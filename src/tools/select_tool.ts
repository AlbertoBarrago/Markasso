import type { Tool, ToolContext } from './tool';
import type { Element } from '../elements/element';
import type { HandlePosition } from '../rendering/draw_selection';
import { getElementBounds, hitTestHandle, getSelectionHandles } from '../rendering/draw_selection';
import { worldToScreen } from '../core/viewport';

type DragMode = 'none' | 'move' | 'marquee' | 'resize';

const HANDLE_CURSORS: Record<HandlePosition, string> = {
  nw: 'nw-resize', n: 'ns-resize', ne: 'ne-resize',
  w:  'ew-resize',                  e: 'ew-resize',
  sw: 'sw-resize', s: 'ns-resize', se: 'se-resize',
};

export class SelectTool implements Tool {
  private dragMode: DragMode = 'none';
  private lastWorldX = 0;
  private lastWorldY = 0;

  private marqueeX1 = 0;
  private marqueeY1 = 0;
  private marqueeX2 = 0;
  private marqueeY2 = 0;

  // Resize state — captured at mousedown, used throughout the drag
  private resizeHandle: HandlePosition | null = null;
  private resizeOrigEl: Element | null = null;
  private resizeOrigBounds: { x: number; y: number; w: number; h: number } | null = null;
  private resizeAnchorX = 0;
  private resizeAnchorY = 0;

  // Exposed for renderer to draw marquee preview
  marqueeActive = false;
  getMarquee(): [number, number, number, number] {
    return [this.marqueeX1, this.marqueeY1, this.marqueeX2, this.marqueeY2];
  }

  onMouseDown(e: MouseEvent, worldX: number, worldY: number, ctx: ToolContext): void {
    this.lastWorldX = worldX;
    this.lastWorldY = worldY;

    const scene = ctx.history.present;
    const selectedEls = scene.elements.filter((el) => scene.selectedIds.has(el.id));

    // 1. Check if a resize handle was clicked
    if (selectedEls.length > 0) {
      const rect = ctx.canvas.getBoundingClientRect();
      const screenX = e.clientX - rect.left;
      const screenY = e.clientY - rect.top;
      const handles = getSelectionHandles(selectedEls, scene.viewport);
      const hitHandle = hitTestHandle(handles, screenX, screenY);

      if (hitHandle) {
        this.dragMode = 'resize';
        this.resizeHandle = hitHandle;
        if (selectedEls.length === 1) {
          this.resizeOrigEl = selectedEls[0]!;
          this.resizeOrigBounds = getElementBounds(this.resizeOrigEl);
        } else {
          // Multi-selection: treat union bounds as the resize surface
          this.resizeOrigEl = null;
          let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
          for (const el of selectedEls) {
            const b = getElementBounds(el);
            minX = Math.min(minX, b.x);
            minY = Math.min(minY, b.y);
            maxX = Math.max(maxX, b.x + b.w);
            maxY = Math.max(maxY, b.y + b.h);
          }
          this.resizeOrigBounds = { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
        }
        this.resizeAnchorX = anchorX(hitHandle, this.resizeOrigBounds);
        this.resizeAnchorY = anchorY(hitHandle, this.resizeOrigBounds);
        return;
      }
    }

    // 2. Hit-test elements
    const hit = hitTest(scene.elements, worldX, worldY);
    if (hit) {
      if (!scene.selectedIds.has(hit.id)) {
        ctx.history.dispatch({ type: 'SELECT_ELEMENTS', ids: [hit.id] });
      }
      this.dragMode = 'move';
    } else {
      ctx.history.dispatch({ type: 'CLEAR_SELECTION' });
      this.dragMode = 'marquee';
      this.marqueeActive = true;
      const rect = ctx.canvas.getBoundingClientRect();
      this.marqueeX1 = e.clientX - rect.left;
      this.marqueeY1 = e.clientY - rect.top;
      this.marqueeX2 = this.marqueeX1;
      this.marqueeY2 = this.marqueeY1;
    }
  }

  onMouseMove(e: MouseEvent, worldX: number, worldY: number, ctx: ToolContext): void {
    if (this.dragMode === 'resize') {
      const scene = ctx.history.present;
      if (
        this.resizeHandle &&
        this.resizeOrigEl &&
        this.resizeOrigBounds
      ) {
        const resized = computeResize(
          this.resizeOrigEl,
          this.resizeHandle,
          this.resizeAnchorX,
          this.resizeAnchorY,
          worldX,
          worldY,
          this.resizeOrigBounds,
          e.shiftKey,
        );
        if (resized) {
          ctx.history.dispatch({ type: 'RESIZE_ELEMENT', id: this.resizeOrigEl.id, ...resized });
        }
      } else if (this.resizeHandle && this.resizeOrigBounds && !this.resizeOrigEl) {
        // Multi-selection proportional scale
        const selectedEls = scene.elements.filter((el) => scene.selectedIds.has(el.id));
        const ob = this.resizeOrigBounds;
        const newBounds = newBoundsFromHandle(
          this.resizeHandle, this.resizeAnchorX, this.resizeAnchorY, worldX, worldY, ob, e.shiftKey
        );
        if (newBounds && ob.w > 0 && ob.h > 0) {
          const scaleX = newBounds.w / ob.w;
          const scaleY = newBounds.h / ob.h;
          for (const el of selectedEls) {
            const b = getElementBounds(el);
            const relX = (b.x - ob.x) * scaleX + newBounds.x;
            const relY = (b.y - ob.y) * scaleY + newBounds.y;
            const resized = scaleElement(el, relX, relY, b.w * scaleX, b.h * scaleY);
            if (resized) ctx.history.dispatch({ type: 'RESIZE_ELEMENT', id: el.id, ...resized });
          }
        }
      }
      ctx.onPreviewUpdate?.();
      return;
    }

    if (this.dragMode === 'move') {
      const dx = worldX - this.lastWorldX;
      const dy = worldY - this.lastWorldY;
      const ids = [...ctx.history.present.selectedIds];
      for (const id of ids) {
        ctx.history.dispatch({ type: 'MOVE_ELEMENT', id, dx, dy });
      }
      this.lastWorldX = worldX;
      this.lastWorldY = worldY;
      return;
    }

    if (this.dragMode === 'marquee') {
      const rect = ctx.canvas.getBoundingClientRect();
      this.marqueeX2 = e.clientX - rect.left;
      this.marqueeY2 = e.clientY - rect.top;
      ctx.onPreviewUpdate?.();
    }
  }

  onMouseUp(_e: MouseEvent, _worldX: number, _worldY: number, ctx: ToolContext): void {
    if (this.dragMode === 'marquee') {
      this.marqueeActive = false;
      const scene = ctx.history.present;
      const viewport = scene.viewport;
      const x1 = Math.min(this.marqueeX1, this.marqueeX2);
      const y1 = Math.min(this.marqueeY1, this.marqueeY2);
      const x2 = Math.max(this.marqueeX1, this.marqueeX2);
      const y2 = Math.max(this.marqueeY1, this.marqueeY2);

      const wx1 = (x1 - viewport.offsetX) / viewport.zoom;
      const wy1 = (y1 - viewport.offsetY) / viewport.zoom;
      const wx2 = (x2 - viewport.offsetX) / viewport.zoom;
      const wy2 = (y2 - viewport.offsetY) / viewport.zoom;

      const ids = scene.elements
        .filter((el) => {
          const b = getElementBounds(el);
          return b.x >= wx1 && b.y >= wy1 && b.x + b.w <= wx2 && b.y + b.h <= wy2;
        })
        .map((el) => el.id);

      if (ids.length > 0) ctx.history.dispatch({ type: 'SELECT_ELEMENTS', ids });
    }

    this.dragMode = 'none';
    this.resizeHandle = null;
    this.resizeOrigEl = null;
    this.resizeOrigBounds = null;
  }

  onKeyDown(e: KeyboardEvent, ctx: ToolContext): void {
    if (e.key === 'Delete' || e.key === 'Backspace') {
      const ids = [...ctx.history.present.selectedIds];
      if (ids.length > 0) ctx.history.dispatch({ type: 'DELETE_ELEMENTS', ids });
    }
  }

  getCursor(worldX: number, worldY: number, ctx: ToolContext): string {
    const scene = ctx.history.present;
    const selectedEls = scene.elements.filter((el) => scene.selectedIds.has(el.id));

    if (selectedEls.length > 0) {
      const [screenX, screenY] = worldToScreen(scene.viewport, worldX, worldY);
      const handles = getSelectionHandles(selectedEls, scene.viewport);
      const hit = hitTestHandle(handles, screenX, screenY);
      if (hit) return HANDLE_CURSORS[hit];
    }

    const hit = hitTest(scene.elements, worldX, worldY);
    return hit ? 'move' : 'default';
  }
}

// ── Resize helpers ─────────────────────────────────────────────────────────────

type ResizePayload = {
  x?: number; y?: number;
  width?: number; height?: number;
  x2?: number; y2?: number;
  fontSize?: number;
  points?: ReadonlyArray<readonly [number, number]>;
};

function anchorX(h: HandlePosition, b: { x: number; y: number; w: number; h: number }): number {
  if (h === 'nw' || h === 'w' || h === 'sw') return b.x + b.w;
  if (h === 'ne' || h === 'e' || h === 'se') return b.x;
  return b.x + b.w / 2; // n/s — unused (x axis fixed)
}

function anchorY(h: HandlePosition, b: { x: number; y: number; w: number; h: number }): number {
  if (h === 'nw' || h === 'n' || h === 'ne') return b.y + b.h;
  if (h === 'sw' || h === 's' || h === 'se') return b.y;
  return b.y + b.h / 2; // w/e — unused (y axis fixed)
}

function newBoundsFromHandle(
  handle: HandlePosition,
  ax: number, ay: number,
  curX: number, curY: number,
  orig: { x: number; y: number; w: number; h: number },
  shiftKey = false,
): { x: number; y: number; w: number; h: number } | null {
  const fixX = handle === 'n' || handle === 's';
  const fixY = handle === 'w' || handle === 'e';

  let minX = fixX ? orig.x : Math.min(ax, curX);
  let maxX = fixX ? orig.x + orig.w : Math.max(ax, curX);
  let minY = fixY ? orig.y : Math.min(ay, curY);
  let maxY = fixY ? orig.y + orig.h : Math.max(ay, curY);

  // Shift + corner handle → constrain to original aspect ratio
  if (shiftKey && !fixX && !fixY && orig.w > 0 && orig.h > 0) {
    const ar = orig.w / orig.h;
    const rawW = Math.abs(curX - ax);
    const rawH = Math.abs(curY - ay);
    const sx = Math.sign(curX - ax) || 1;
    const sy = Math.sign(curY - ay) || 1;
    let finalW: number, finalH: number;
    if (rawW / rawH > ar) { finalH = rawH; finalW = rawH * ar; }
    else                  { finalW = rawW; finalH = rawW / ar; }
    minX = Math.min(ax, ax + sx * finalW);
    maxX = Math.max(ax, ax + sx * finalW);
    minY = Math.min(ay, ay + sy * finalH);
    maxY = Math.max(ay, ay + sy * finalH);
  }

  const w = maxX - minX;
  const h = maxY - minY;
  if (w < 1 || h < 1) return null;
  return { x: minX, y: minY, w, h };
}

function scaleElement(
  el: Element,
  newX: number, newY: number,
  newW: number, newH: number,
): ResizePayload | null {
  switch (el.type) {
    case 'rectangle':
    case 'ellipse':
      return { x: newX, y: newY, width: newW, height: newH };
    case 'text': {
      const origB = getElementBounds(el);
      const fontScale = origB.h > 0 ? newH / origB.h : 1;
      const fontSize = Math.max(1, Math.round(el.fontSize * fontScale));
      // Text width scales with font size, not with dragged width
      const scaledWidth = el.width * fontScale;
      return { x: newX, y: newY, width: scaledWidth, height: newH, fontSize };
    }
    case 'line':
    case 'arrow': {
      const origB = getElementBounds(el);
      const scaleX = origB.w > 0 ? newW / origB.w : 1;
      const scaleY = origB.h > 0 ? newH / origB.h : 1;
      const ox = newX + (el.x - origB.x) * scaleX;
      const oy = newY + (el.y - origB.y) * scaleY;
      const ox2 = newX + (el.x2 - origB.x) * scaleX;
      const oy2 = newY + (el.y2 - origB.y) * scaleY;
      return { x: ox, y: oy, x2: ox2, y2: oy2 };
    }
    case 'freehand': {
      const origB = getElementBounds(el);
      if (origB.w === 0 || origB.h === 0) return null;
      const scaleX = newW / origB.w;
      const scaleY = newH / origB.h;
      const points = el.points.map(([px, py]) => [
        newX + (px - origB.x) * scaleX,
        newY + (py - origB.y) * scaleY,
      ] as const);
      return { x: newX, y: newY, points };
    }
  }
}

function computeResize(
  el: Element,
  handle: HandlePosition,
  ax: number, ay: number,
  curX: number, curY: number,
  origBounds: { x: number; y: number; w: number; h: number },
  shiftKey = false,
): ResizePayload | null {
  const nb = newBoundsFromHandle(handle, ax, ay, curX, curY, origBounds, shiftKey);
  if (!nb) return null;
  return scaleElement(el, nb.x, nb.y, nb.w, nb.h);
}

// ── Hit testing ───────────────────────────────────────────────────────────────

function hitTest(elements: ReadonlyArray<Element>, wx: number, wy: number): Element | null {
  for (let i = elements.length - 1; i >= 0; i--) {
    const el = elements[i];
    if (el && hitTestElement(el, wx, wy)) return el;
  }
  return null;
}

function hitTestElement(el: Element, wx: number, wy: number): boolean {
  const PAD = 4;
  switch (el.type) {
    case 'rectangle':
    case 'text': {
      const x = el.width < 0 ? el.x + el.width : el.x;
      const y = el.height < 0 ? el.y + el.height : el.y;
      const w = Math.abs(el.width);
      const h = Math.abs(el.height);
      return wx >= x - PAD && wx <= x + w + PAD && wy >= y - PAD && wy <= y + h + PAD;
    }
    case 'ellipse': {
      const cx = el.x + el.width / 2;
      const cy = el.y + el.height / 2;
      const rx = Math.abs(el.width / 2) + PAD;
      const ry = Math.abs(el.height / 2) + PAD;
      return ((wx - cx) / rx) ** 2 + ((wy - cy) / ry) ** 2 <= 1;
    }
    case 'line':
    case 'arrow':
      return distToSegment(wx, wy, el.x, el.y, el.x2, el.y2) < el.strokeWidth / 2 + PAD;
    case 'freehand': {
      for (let i = 1; i < el.points.length; i++) {
        const p1 = el.points[i - 1]!;
        const p2 = el.points[i]!;
        if (distToSegment(wx, wy, p1[0], p1[1], p2[0], p2[1]) < el.strokeWidth / 2 + PAD) return true;
      }
      return false;
    }
  }
}

function distToSegment(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
  const dx = x2 - x1, dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(px - x1, py - y1);
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lenSq));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}
