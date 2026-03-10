import type { History } from '../engine/history';
import type { Tool, ToolContext } from '../tools/tool';
import { SelectTool } from '../tools/select_tool';
import { RectangleTool } from '../tools/rectangle_tool';
import { EllipseTool } from '../tools/ellipse_tool';
import { LineTool } from '../tools/line_tool';
import { ArrowTool } from '../tools/arrow_tool';
import { PenTool } from '../tools/pen_tool';
import { TextTool } from '../tools/text_tool';
import type { TextElement } from '../elements/element';
import { render } from '../rendering/renderer';
import { drawElement } from '../rendering/draw_element';
import { drawMarquee } from '../rendering/draw_selection';
import { screenToWorld } from '../core/viewport';
import type { ActiveTool } from '../core/app_state';

const TOOLS: Record<ActiveTool, Tool> = {
  select: new SelectTool(),
  rectangle: new RectangleTool(),
  ellipse: new EllipseTool(),
  line: new LineTool(),
  arrow: new ArrowTool(),
  freehand: new PenTool(),
  text: new TextTool(),
};

export function initCanvasView(canvas: HTMLCanvasElement, history: History): void {
  const ctx2d = canvas.getContext('2d')!;

  let isPanning = false;
  let panStartX = 0;
  let panStartY = 0;
  let needsRender = true;

  const toolCtx: ToolContext = {
    history,
    canvas,
    onPreviewUpdate: () => { needsRender = true; },
  };

  function getActiveTool(): Tool {
    return TOOLS[history.present.appState.activeTool];
  }

  function getWorldCoords(e: MouseEvent): [number, number] {
    const rect = canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    return screenToWorld(history.present.viewport, sx, sy);
  }

  function resizeCanvas(): void {
    canvas.width = canvas.clientWidth * devicePixelRatio;
    canvas.height = canvas.clientHeight * devicePixelRatio;
    needsRender = true;
  }

  // Resize observer
  const ro = new ResizeObserver(resizeCanvas);
  ro.observe(canvas);
  resizeCanvas();

  // Event listeners
  canvas.addEventListener('mousedown', (e) => {
    if (e.button === 1 || (e.button === 0 && e.altKey)) {
      // Middle click or Alt+click = pan
      isPanning = true;
      panStartX = e.clientX;
      panStartY = e.clientY;
      canvas.style.cursor = 'grabbing';
      e.preventDefault();
      return;
    }
    if (e.button !== 0) return;
    const [wx, wy] = getWorldCoords(e);
    getActiveTool().onMouseDown(e, wx, wy, toolCtx);
    needsRender = true;
  });

  canvas.addEventListener('mousemove', (e) => {
    if (isPanning) {
      const dx = e.clientX - panStartX;
      const dy = e.clientY - panStartY;
      panStartX = e.clientX;
      panStartY = e.clientY;
      history.dispatch({ type: 'PAN_VIEWPORT', dx, dy });
      needsRender = true;
      return;
    }
    const [wx, wy] = getWorldCoords(e);
    getActiveTool().onMouseMove(e, wx, wy, toolCtx);
    const cursor = getActiveTool().getCursor(wx, wy, toolCtx);
    canvas.style.cursor = cursor;
    needsRender = true;
  });

  window.addEventListener('mouseup', (e) => {
    if (isPanning) {
      isPanning = false;
      canvas.style.cursor = getActiveTool().getCursor(0, 0, toolCtx);
      return;
    }
    if (e.button !== 0) return;
    const [wx, wy] = getWorldCoords(e);
    getActiveTool().onMouseUp(e, wx, wy, toolCtx);
    needsRender = true;
  });

  canvas.addEventListener('dblclick', (e) => {
    const [wx, wy] = getWorldCoords(e);
    const scene = history.present;
    // Find a text element under the cursor (topmost first)
    for (let i = scene.elements.length - 1; i >= 0; i--) {
      const el = scene.elements[i];
      if (el?.type === 'text') {
        const x = el.x, y = el.y, w = el.width, h = el.height;
        if (wx >= x - 4 && wx <= x + w + 4 && wy >= y - 4 && wy <= y + h + 4) {
          (TOOLS.text as TextTool).editExisting(el as TextElement, toolCtx);
          needsRender = true;
          return;
        }
      }
    }
  });

  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    // Use CSS pixels — viewport coords are all in CSS pixel space
    const originX = e.clientX - rect.left;
    const originY = e.clientY - rect.top;

    if (e.ctrlKey || e.metaKey) {
      // Pinch zoom
      const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
      history.dispatch({ type: 'ZOOM_VIEWPORT', factor, originX, originY });
    } else {
      // Scroll pan
      history.dispatch({ type: 'PAN_VIEWPORT', dx: -e.deltaX, dy: -e.deltaY });
    }
    needsRender = true;
  }, { passive: false });

  window.addEventListener('keydown', (e) => {
    getActiveTool().onKeyDown?.(e, toolCtx);
    needsRender = true;
  });

  // Sync tool when scene tool changes
  history.subscribe((scene) => {
    needsRender = true;
    // Update cursor
    const tool = TOOLS[scene.appState.activeTool];
    canvas.style.cursor = tool.getCursor(0, 0, toolCtx);
  });

  // rAF render loop
  function loop(): void {
    if (needsRender) {
      needsRender = false;
      renderFrame();
    }
    requestAnimationFrame(loop);
  }

  function renderFrame(): void {
    render(ctx2d, history.present, canvas);

    // Draw preview element on top (in world transform)
    const activeTool = getActiveTool();
    const scene = history.present;

    if ('preview' in activeTool) {
      const preview = (activeTool as { preview: unknown }).preview;
      if (preview) {
        ctx2d.save();
        const { viewport } = scene;
        const dpr = window.devicePixelRatio;
        ctx2d.setTransform(viewport.zoom * dpr, 0, 0, viewport.zoom * dpr, viewport.offsetX * dpr, viewport.offsetY * dpr);
        ctx2d.globalAlpha = 0.7;
        drawElement(ctx2d, preview as Parameters<typeof drawElement>[1]);
        ctx2d.restore();
      }
    }

    // Draw marquee if select tool is in marquee mode
    const selectTool = TOOLS['select'] as SelectTool;
    if (selectTool.marqueeActive) {
      const [x1, y1, x2, y2] = selectTool.getMarquee();
      drawMarquee(ctx2d, x1, y1, x2, y2);
    }
  }

  requestAnimationFrame(loop);
}
