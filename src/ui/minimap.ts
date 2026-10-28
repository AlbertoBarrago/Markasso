import type { History } from '../engine/history';
import {
  getElementBounds,
  resolveArrowEndpoints,
  resolveConnectorRoute,
} from '../rendering/draw_selection';

const MM_W = 168; // minimap canvas logical width
const MM_H = 100; // minimap canvas logical height
const PADDING = 20; // world-space padding around the scene bounds

export function initMinimap(workspace: HTMLElement, history: History): void {
  // Hide on touch devices
  if (window.matchMedia('(pointer: coarse)').matches) return;

  // ── DOM ──────────────────────────────────────────────────────────────────
  const container = document.createElement('div');
  container.id = 'minimap';
  workspace.appendChild(container);

  const mmCanvas = document.createElement('canvas');
  mmCanvas.style.width = `${MM_W}px`;
  mmCanvas.style.height = `${MM_H}px`;
  container.appendChild(mmCanvas);

  const ctx = mmCanvas.getContext('2d')!;

  function ensureMinimapBuffer(): void {
    const width = Math.max(1, Math.round(MM_W * devicePixelRatio));
    const height = Math.max(1, Math.round(MM_H * devicePixelRatio));
    if (mmCanvas.width === width && mmCanvas.height === height) return;
    mmCanvas.width = width;
    mmCanvas.height = height;
  }

  // ── State ─────────────────────────────────────────────────────────────────
  // Maps world coords ↔ minimap pixel coords
  let worldLeft = 0;
  let worldTop = 0;
  let worldToMmScale = 1; // pixels per world unit in the minimap

  function worldToMm(wx: number, wy: number): [number, number] {
    return [
      (wx - worldLeft) * worldToMmScale * devicePixelRatio,
      (wy - worldTop) * worldToMmScale * devicePixelRatio,
    ];
  }

  function mmToWorld(mx: number, my: number): [number, number] {
    return [
      mx / (worldToMmScale * devicePixelRatio) + worldLeft,
      my / (worldToMmScale * devicePixelRatio) + worldTop,
    ];
  }

  // ── Render ────────────────────────────────────────────────────────────────
  function paint(): void {
    ensureMinimapBuffer();
    const scene = history.present;
    const { elements, viewport } = scene;

    ctx.clearRect(0, 0, mmCanvas.width, mmCanvas.height);

    // Background
    const bg =
      getComputedStyle(document.documentElement)
        .getPropertyValue('--canvas-bg')
        .trim() || '#141414';
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, mmCanvas.width, mmCanvas.height);

    if (elements.length === 0) {
      // Show only viewport rect on empty canvas
      worldLeft = -window.innerWidth / 2;
      worldTop = -window.innerHeight / 2;
      const worldW = window.innerWidth;
      const worldH = window.innerHeight;
      worldToMmScale = Math.min(
        MM_W / (worldW + PADDING * 2),
        MM_H / (worldH + PADDING * 2),
      );
      drawViewportRect(viewport);
      return;
    }

    // Bounds are resolved against the whole scene so bound connectors follow
    // their shapes, as on the main canvas. Their stored x/y/x2/y2 can be stale
    // (e.g. MCP boards connect nodes before laying them out).
    const visible = elements.filter((el) => el.visible !== false);
    const bounds = visible.map((el) => getElementBounds(el, elements));

    // Compute scene bounding box
    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;
    for (const b of bounds) {
      minX = Math.min(minX, b.x);
      minY = Math.min(minY, b.y);
      maxX = Math.max(maxX, b.x + b.w);
      maxY = Math.max(maxY, b.y + b.h);
    }

    // Include viewport in bounds so the viewport rect is always visible
    const vpLeft = (0 - viewport.offsetX) / viewport.zoom;
    const vpTop = (0 - viewport.offsetY) / viewport.zoom;
    const vpRight = (window.innerWidth - viewport.offsetX) / viewport.zoom;
    const vpBottom = (window.innerHeight - viewport.offsetY) / viewport.zoom;

    minX = Math.min(minX, vpLeft) - PADDING;
    minY = Math.min(minY, vpTop) - PADDING;
    maxX = Math.max(maxX, vpRight) + PADDING;
    maxY = Math.max(maxY, vpBottom) + PADDING;

    const worldW = maxX - minX;
    const worldH = maxY - minY;

    // Fit scene into minimap while preserving aspect ratio. The origin is
    // shifted so the scene sits centered: worldLeft/worldTop already carry
    // that offset, and worldToMm (elements and viewport rect alike) uses them.
    worldToMmScale = Math.min(MM_W / worldW, MM_H / worldH);
    worldLeft = minX - (MM_W / worldToMmScale - worldW) / 2;
    worldTop = minY - (MM_H / worldToMmScale - worldH) / 2;

    const k = worldToMmScale * devicePixelRatio;

    // Draw elements as simplified shapes: connectors as their path, the rest
    // as their bounding box.
    ctx.save();
    ctx.translate(-worldLeft * k, -worldTop * k);

    visible.forEach((el, i) => {
      const b = bounds[i]!;
      ctx.strokeStyle = el.strokeColor;
      ctx.lineWidth = Math.max(0.5, (el.strokeWidth ?? 1) * k * 0.5);

      if (el.type === 'line' || el.type === 'arrow') {
        ctx.globalAlpha = (el.opacity ?? 1) * 0.8;
        ctx.beginPath();
        if (el.type === 'line' && el.cx !== undefined && el.cy !== undefined) {
          const pts = resolveArrowEndpoints(el, elements);
          ctx.moveTo(pts.x * k, pts.y * k);
          ctx.quadraticCurveTo(el.cx * k, el.cy * k, pts.x2 * k, pts.y2 * k);
        } else {
          resolveConnectorRoute(el, elements).forEach(([px, py], j) => {
            if (j === 0) ctx.moveTo(px * k, py * k);
            else ctx.lineTo(px * k, py * k);
          });
        }
        ctx.stroke();
        return;
      }

      const x = b.x * k;
      const y = b.y * k;
      const w = Math.max(1, b.w * k);
      const h = Math.max(1, b.h * k);

      ctx.globalAlpha = el.opacity ?? 1;
      if (el.fillColor && el.fillColor !== 'transparent') {
        ctx.fillStyle = el.fillColor;
        ctx.fillRect(x, y, w, h);
      }
      ctx.globalAlpha = (el.opacity ?? 1) * 0.8;
      ctx.strokeRect(x, y, w, h);
    });

    ctx.restore();
    ctx.globalAlpha = 1;

    drawViewportRect(viewport);
  }

  function drawViewportRect(viewport: {
    zoom: number;
    offsetX: number;
    offsetY: number;
  }): void {
    // Viewport corners in world space
    const vl = (0 - viewport.offsetX) / viewport.zoom;
    const vt = (0 - viewport.offsetY) / viewport.zoom;
    const vr = (window.innerWidth - viewport.offsetX) / viewport.zoom;
    const vb = (window.innerHeight - viewport.offsetY) / viewport.zoom;

    const [sx, sy] = worldToMm(vl, vt);
    const [ex, ey] = worldToMm(vr, vb);

    const rectX = Math.round(sx);
    const rectY = Math.round(sy);
    const rectW = Math.round(ex - sx);
    const rectH = Math.round(ey - sy);

    // Tinted fill
    ctx.fillStyle = 'rgba(100,160,255,0.08)';
    ctx.fillRect(rectX, rectY, rectW, rectH);

    // Border
    ctx.strokeStyle = 'rgba(100,160,255,0.6)';
    ctx.lineWidth = devicePixelRatio;
    ctx.setLineDash([]);
    ctx.strokeRect(rectX + 0.5, rectY + 0.5, rectW - 1, rectH - 1);
  }

  // ── Pan on click/drag ─────────────────────────────────────────────────────
  let dragging = false;

  function panTo(e: MouseEvent): void {
    const rect = mmCanvas.getBoundingClientRect();
    const mx = (e.clientX - rect.left) * devicePixelRatio;
    const my = (e.clientY - rect.top) * devicePixelRatio;
    const [wx, wy] = mmToWorld(mx, my);
    const vp = history.present.viewport;
    // Center the viewport on (wx, wy)
    const offsetX = window.innerWidth / 2 - wx * vp.zoom;
    const offsetY = window.innerHeight / 2 - wy * vp.zoom;
    history.dispatch({
      type: 'PAN_VIEWPORT',
      dx: offsetX - vp.offsetX,
      dy: offsetY - vp.offsetY,
    });
  }

  mmCanvas.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    dragging = true;
    panTo(e);
    e.stopPropagation();
  });

  window.addEventListener('mousemove', (e) => {
    if (dragging) panTo(e);
  });

  window.addEventListener('mouseup', () => {
    dragging = false;
  });

  // ── Subscribe and initial paint ───────────────────────────────────────────
  history.subscribe(() => paint());
  // The theme and background color live on <html> (`data-theme`, the
  // `--canvas-bg` inline style) and can change without a scene update.
  let repaintQueued = false;
  new MutationObserver(() => {
    if (repaintQueued) return;
    repaintQueued = true;
    requestAnimationFrame(() => {
      repaintQueued = false;
      paint();
    });
  }).observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-theme', 'style'],
  });
  paint();
}
