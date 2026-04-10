import type { Tool, ToolContext } from './tool';
import type { Element } from '../elements/element';
import { getElementBounds } from '../rendering/draw_selection';

const TRAIL_DURATION = 350; // ms

const ERASER_CURSOR = (() => {
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='20' height='20'><circle cx='10' cy='10' r='8' fill='none' stroke='white' stroke-width='1.5'/><circle cx='10' cy='10' r='8' fill='none' stroke='black' stroke-width='0.5'/></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}") 10 10, crosshair`;
})();

export interface SlashPoint { worldX: number; worldY: number; time: number }

export class EraserTool implements Tool {
  private erasing = false;
  /** Exposed for canvas_view to draw the slash trail */
  slashTrail: SlashPoint[] = [];
  /** Exposed for canvas_view to draw hover highlight */
  hoveredId: string | null = null;

  onMouseDown(_e: MouseEvent, worldX: number, worldY: number, ctx: ToolContext): void {
    this.erasing = true;
    this.slashTrail = [{ worldX, worldY, time: Date.now() }];
    this.eraseAt(worldX, worldY, ctx);
  }

  onMouseMove(_e: MouseEvent, worldX: number, worldY: number, ctx: ToolContext): void {
    const { elements } = ctx.history.present;
    this.hoveredId = this.findAt(worldX, worldY, elements);
    if (!this.erasing) return;
    this.slashTrail.push({ worldX, worldY, time: Date.now() });
    this.eraseAt(worldX, worldY, ctx);
  }

  onMouseUp(): void {
    this.erasing = false;
  }

  onMouseLeave(): void {
    this.hoveredId = null;
  }

  /** Prune points older than TRAIL_DURATION. Returns true if trail still has points. */
  pruneTrail(): boolean {
    const cutoff = Date.now() - TRAIL_DURATION;
    this.slashTrail = this.slashTrail.filter((p) => p.time >= cutoff);
    return this.slashTrail.length > 0;
  }

  private findAt(worldX: number, worldY: number, elements: ReadonlyArray<Element>): string | null {
    for (let i = elements.length - 1; i >= 0; i--) {
      const el = elements[i];
      if (!el || el.locked) continue;
      const { x, y, w, h } = getElementBounds(el, elements);
      const pad = 4;
      if (worldX >= x - pad && worldX <= x + w + pad && worldY >= y - pad && worldY <= y + h + pad) {
        return el.id;
      }
    }
    return null;
  }

  private eraseAt(worldX: number, worldY: number, ctx: ToolContext): void {
    const { elements } = ctx.history.present;
    for (let i = elements.length - 1; i >= 0; i--) {
      const el = elements[i];
      if (!el || el.locked) continue;
      const { x, y, w, h } = getElementBounds(el, elements);
      const pad = 4;
      if (worldX >= x - pad && worldX <= x + w + pad && worldY >= y - pad && worldY <= y + h + pad) {
        ctx.history.dispatch({ type: 'DELETE_ELEMENTS', ids: [el.id] });
        break;
      }
    }
  }

  getCursor(): string {
    return ERASER_CURSOR;
  }
}
