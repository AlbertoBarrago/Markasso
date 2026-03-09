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

  onMouseMove(_e: MouseEvent, worldX: number, worldY: number, ctx: ToolContext): void {
    if (!this.drawing) return;
    const { appState } = ctx.history.present;
    this.preview = {
      id: '__preview__',
      type: 'ellipse',
      x: this.startX,
      y: this.startY,
      width: worldX - this.startX,
      height: worldY - this.startY,
      strokeColor: appState.strokeColor,
      fillColor: appState.fillColor,
      strokeWidth: appState.strokeWidth,
      opacity: appState.opacity,
      roughness: appState.roughness,
    };
    ctx.onPreviewUpdate?.();
  }

  onMouseUp(_e: MouseEvent, worldX: number, worldY: number, ctx: ToolContext): void {
    if (!this.drawing) return;
    this.drawing = false;
    this.preview = null;

    const w = worldX - this.startX;
    const h = worldY - this.startY;
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
      },
    });
    ctx.history.dispatch({ type: 'SET_TOOL', tool: 'select' });
  }

  getCursor(): string {
    return 'crosshair';
  }
}
