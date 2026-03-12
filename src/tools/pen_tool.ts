import type { Tool, ToolContext } from './tool';
import type { FreehandElement } from '../elements/element';

export class PenTool implements Tool {
  private drawing = false;
  private points: [number, number][] = [];
  preview: FreehandElement | null = null;

  onMouseDown(_e: MouseEvent, worldX: number, worldY: number, _ctx: ToolContext): void {
    this.drawing = true;
    this.points = [[worldX, worldY]];
    this.preview = null;
  }

  onMouseMove(_e: MouseEvent, worldX: number, worldY: number, ctx: ToolContext): void {
    if (!this.drawing) return;
    this.points.push([worldX, worldY]);
    const { appState } = ctx.history.present;
    const origin = this.points[0] ?? [0, 0];
    this.preview = {
      id: '__preview__',
      type: 'freehand',
      x: origin[0],
      y: origin[1],
      points: this.points.map((p) => p as [number, number]),
      strokeColor: appState.strokeColor,
      fillColor: 'transparent',
      strokeWidth: appState.strokeWidth,
      opacity: appState.opacity,
      roughness: appState.roughness,
      strokeStyle: appState.strokeStyle,
    };
    ctx.onPreviewUpdate?.();
  }

  onMouseUp(_e: MouseEvent, _worldX: number, _worldY: number, ctx: ToolContext): void {
    if (!this.drawing) return;
    this.drawing = false;
    this.preview = null;

    if (this.points.length < 2) return;

    const { appState } = ctx.history.present;
    const origin = this.points[0] ?? [0, 0];
    ctx.history.dispatch({
      type: 'CREATE_ELEMENT',
      element: {
        id: crypto.randomUUID(),
        type: 'freehand',
        x: origin[0],
        y: origin[1],
        points: this.points.map((p) => p as [number, number]),
        strokeColor: appState.strokeColor,
        fillColor: 'transparent',
        strokeWidth: appState.strokeWidth,
        opacity: appState.opacity,
        roughness: appState.roughness,
        strokeStyle: appState.strokeStyle,
      },
    });
  }

  getCursor(): string {
    return 'crosshair';
  }
}
