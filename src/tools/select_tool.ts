import type { Tool, ToolContext } from './tool';
import type { Element } from '../elements/element';
import { getElementBounds } from '../rendering/draw_selection';

type DragMode = 'none' | 'move' | 'marquee';

export class SelectTool implements Tool {
  private dragMode: DragMode = 'none';
  private startWorldX = 0;
  private startWorldY = 0;
  private lastWorldX = 0;
  private lastWorldY = 0;
  private marqueeX1 = 0;
  private marqueeY1 = 0;
  private marqueeX2 = 0;
  private marqueeY2 = 0;

  // Exposed for renderer to draw marquee preview
  marqueeActive = false;
  getMarquee(): [number, number, number, number] {
    return [this.marqueeX1, this.marqueeY1, this.marqueeX2, this.marqueeY2];
  }

  onMouseDown(e: MouseEvent, worldX: number, worldY: number, ctx: ToolContext): void {
    this.startWorldX = worldX;
    this.startWorldY = worldY;
    this.lastWorldX = worldX;
    this.lastWorldY = worldY;

    const scene = ctx.history.present;
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
      this.marqueeX1 = e.clientX - ctx.canvas.getBoundingClientRect().left;
      this.marqueeY1 = e.clientY - ctx.canvas.getBoundingClientRect().top;
      this.marqueeX2 = this.marqueeX1;
      this.marqueeY2 = this.marqueeY1;
    }
  }

  onMouseMove(e: MouseEvent, worldX: number, worldY: number, ctx: ToolContext): void {
    if (this.dragMode === 'move') {
      const dx = worldX - this.lastWorldX;
      const dy = worldY - this.lastWorldY;
      const ids = [...ctx.history.present.selectedIds];
      for (const id of ids) {
        ctx.history.dispatch({ type: 'MOVE_ELEMENT', id, dx, dy });
      }
      this.lastWorldX = worldX;
      this.lastWorldY = worldY;
    } else if (this.dragMode === 'marquee') {
      const rect = ctx.canvas.getBoundingClientRect();
      this.marqueeX2 = e.clientX - rect.left;
      this.marqueeY2 = e.clientY - rect.top;
      ctx.onPreviewUpdate?.();
    }
  }

  onMouseUp(_e: MouseEvent, _worldX: number, _worldY: number, ctx: ToolContext): void {
    if (this.dragMode === 'marquee') {
      this.marqueeActive = false;
      // Select elements inside marquee
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

      if (ids.length > 0) {
        ctx.history.dispatch({ type: 'SELECT_ELEMENTS', ids });
      }
    }
    this.dragMode = 'none';
  }

  onKeyDown(e: KeyboardEvent, ctx: ToolContext): void {
    if (e.key === 'Delete' || e.key === 'Backspace') {
      const ids = [...ctx.history.present.selectedIds];
      if (ids.length > 0) {
        ctx.history.dispatch({ type: 'DELETE_ELEMENTS', ids });
      }
    }
  }

  getCursor(worldX: number, worldY: number, ctx: ToolContext): string {
    const scene = ctx.history.present;
    const hit = hitTest(scene.elements, worldX, worldY);
    return hit ? 'move' : 'default';
  }
}

function hitTest(elements: ReadonlyArray<Element>, wx: number, wy: number): Element | null {
  // Iterate in reverse to pick topmost element
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
    case 'arrow': {
      return distToSegment(wx, wy, el.x, el.y, el.x2, el.y2) < el.strokeWidth / 2 + PAD;
    }
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
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(px - x1, py - y1);
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lenSq));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}
