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

  onMouseMove(_e: MouseEvent, worldX: number, worldY: number, ctx: ToolContext): void {
    if (!this.drawing) return;
    const { appState } = ctx.history.present;
    this.preview = {
      id: '__preview__',
      type: 'arrow',
      x: this.startX,
      y: this.startY,
      x2: worldX,
      y2: worldY,
      strokeColor: appState.strokeColor,
      fillColor: 'transparent',
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

    const dx = worldX - this.startX;
    const dy = worldY - this.startY;
    if (Math.abs(dx) < 2 && Math.abs(dy) < 2) return;

    const { appState } = ctx.history.present;
    ctx.history.dispatch({
      type: 'CREATE_ELEMENT',
      element: {
        id: crypto.randomUUID(),
        type: 'arrow',
        x: this.startX,
        y: this.startY,
        x2: worldX,
        y2: worldY,
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
