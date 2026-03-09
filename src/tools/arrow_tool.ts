import type { Tool, ToolContext } from './tool';
import type { ArrowElement } from '../elements/element';

export class ArrowTool implements Tool {
  private drawing = false;
  private startX = 0;
  private startY = 0;
  preview: ArrowElement | null = null;

  onMouseDown(_e: MouseEvent, worldX: number, worldY: number, _ctx: ToolContext): void {
    this.drawing = true;
    this.startX = worldX;
    this.startY = worldY;
    this.preview = null;
  }

  onMouseMove(e: MouseEvent, worldX: number, worldY: number, ctx: ToolContext): void {
    if (!this.drawing) return;
    const { appState } = ctx.history.present;
    let [x2, y2] = [worldX, worldY];
    if (e.shiftKey) [x2, y2] = snap45(this.startX, this.startY, worldX, worldY);
    this.preview = {
      id: '__preview__',
      type: 'arrow',
      x: this.startX,
      y: this.startY,
      x2,
      y2,
      strokeColor: appState.strokeColor,
      fillColor: 'transparent',
      strokeWidth: appState.strokeWidth,
      opacity: appState.opacity,
      roughness: appState.roughness,
    };
    ctx.onPreviewUpdate?.();
  }

  onMouseUp(e: MouseEvent, worldX: number, worldY: number, ctx: ToolContext): void {
    if (!this.drawing) return;
    this.drawing = false;
    this.preview = null;

    let [x2, y2] = [worldX, worldY];
    if (e.shiftKey) [x2, y2] = snap45(this.startX, this.startY, worldX, worldY);
    const dx = x2 - this.startX, dy = y2 - this.startY;
    if (Math.abs(dx) < 2 && Math.abs(dy) < 2) return;

    const { appState } = ctx.history.present;
    ctx.history.dispatch({
      type: 'CREATE_ELEMENT',
      element: {
        id: crypto.randomUUID(),
        type: 'arrow',
        x: this.startX,
        y: this.startY,
        x2,
        y2,
        strokeColor: appState.strokeColor,
        fillColor: 'transparent',
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

function snap45(startX: number, startY: number, x: number, y: number): [number, number] {
  const dx = x - startX, dy = y - startY;
  const angle = Math.atan2(dy, dx);
  const snapped = Math.round(angle / (Math.PI / 4)) * (Math.PI / 4);
  const dist = Math.hypot(dx, dy);
  return [startX + dist * Math.cos(snapped), startY + dist * Math.sin(snapped)];
}
