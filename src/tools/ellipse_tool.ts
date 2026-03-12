import type { Tool, ToolContext } from './tool';
import type { EllipseElement } from '../elements/element';

export class EllipseTool implements Tool {
  private drawing = false;
  private startX = 0;
  private startY = 0;
  preview: EllipseElement | null = null;

  onMouseDown(_e: MouseEvent, worldX: number, worldY: number, _ctx: ToolContext): void {
    this.drawing = true;
    this.startX = worldX;
    this.startY = worldY;
    this.preview = null;
  }

  onMouseMove(e: MouseEvent, worldX: number, worldY: number, ctx: ToolContext): void {
    if (!this.drawing) return;
    const { appState } = ctx.history.present;
    let w = worldX - this.startX, h = worldY - this.startY;
    if (e.shiftKey) { const s = Math.min(Math.abs(w), Math.abs(h)); w = Math.sign(w) * s; h = Math.sign(h) * s; }
    this.preview = {
      id: '__preview__',
      type: 'ellipse',
      x: this.startX,
      y: this.startY,
      width: w,
      height: h,
      strokeColor: appState.strokeColor,
      fillColor: appState.fillColor,
      strokeWidth: appState.strokeWidth,
      opacity: appState.opacity,
      roughness: appState.roughness,
      strokeStyle: appState.strokeStyle,
    };
    ctx.onPreviewUpdate?.();
  }

  onMouseUp(e: MouseEvent, worldX: number, worldY: number, ctx: ToolContext): void {
    if (!this.drawing) return;
    this.drawing = false;
    this.preview = null;

    let w = worldX - this.startX, h = worldY - this.startY;
    if (e.shiftKey) { const s = Math.min(Math.abs(w), Math.abs(h)); w = Math.sign(w) * s; h = Math.sign(h) * s; }
    if (Math.abs(w) < 2 && Math.abs(h) < 2) return;

    const { appState } = ctx.history.present;
    ctx.history.dispatch({
      type: 'CREATE_ELEMENT',
      element: {
        id: crypto.randomUUID(),
        type: 'ellipse',
        x: this.startX,
        y: this.startY,
        width: w,
        height: h,
        strokeColor: appState.strokeColor,
        fillColor: appState.fillColor,
        strokeWidth: appState.strokeWidth,
        opacity: appState.opacity,
        roughness: appState.roughness,
        strokeStyle: appState.strokeStyle,
      },
    });
    ctx.history.dispatch({ type: 'SET_TOOL', tool: 'select' });
  }

  getCursor(): string {
    return 'crosshair';
  }
}
