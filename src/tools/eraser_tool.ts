import type { Tool, ToolContext } from './tool';
import { getElementBounds } from '../rendering/draw_selection';

const TRAIL_DURATION = 350; // ms

export interface SlashPoint { worldX: number; worldY: number; time: number }

export class EraserTool implements Tool {
  private erasing = false;
  /** Exposed for canvas_view to draw the slash trail */
  slashTrail: SlashPoint[] = [];

  onMouseDown(_e: MouseEvent, worldX: number, worldY: number, ctx: ToolContext): void {
    this.erasing = true;
    this.slashTrail = [{ worldX, worldY, time: Date.now() }];
    this.eraseAt(worldX, worldY, ctx);
  }

  onMouseMove(_e: MouseEvent, worldX: number, worldY: number, ctx: ToolContext): void {
    if (!this.erasing) return;
    this.slashTrail.push({ worldX, worldY, time: Date.now() });
    this.eraseAt(worldX, worldY, ctx);
  }

  onMouseUp(): void {
    this.erasing = false;
  }

  /** Prune points older than TRAIL_DURATION. Returns true if trail still has points. */
  pruneTrail(): boolean {
    const cutoff = Date.now() - TRAIL_DURATION;
    this.slashTrail = this.slashTrail.filter((p) => p.time >= cutoff);
    return this.slashTrail.length > 0;
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
    return 'crosshair';
  }
}
