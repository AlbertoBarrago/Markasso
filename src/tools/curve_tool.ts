import type { Tool, ToolContext } from './tool';
import type { CurveElement } from '../elements/element';

/** Computes a perpendicular control point for a quadratic bezier. */
function defaultControlPoint(
  x1: number, y1: number, x2: number, y2: number,
): [number, number] {
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  const len = Math.hypot(x2 - x1, y2 - y1);
  if (len < 4) return [mx, my];
  // Perpendicular unit vector * 60px arc height
  const nx = -(y2 - y1) / len;
  const ny =  (x2 - x1) / len;
  const arc = Math.min(len * 0.35, 80);
  return [mx + nx * arc, my + ny * arc];
}

export class CurveTool implements Tool {
  private drawing = false;
  private startX = 0;
  private startY = 0;
  preview: CurveElement | null = null;

  onMouseDown(_e: MouseEvent, worldX: number, worldY: number, _ctx: ToolContext): void {
    this.drawing = true;
    this.preview = null;
    this.startX = worldX;
    this.startY = worldY;
  }

  onMouseMove(_e: MouseEvent, worldX: number, worldY: number, ctx: ToolContext): void {
    if (!this.drawing) return;
    const { appState } = ctx.history.present;
    const [cx, cy] = defaultControlPoint(this.startX, this.startY, worldX, worldY);
    this.preview = {
      id: '__preview__',
      type: 'curve',
      x: this.startX,
      y: this.startY,
      x2: worldX,
      y2: worldY,
      cx,
      cy,
      strokeColor: appState.strokeColor,
      fillColor: 'transparent',
      strokeWidth: appState.strokeWidth,
      opacity: appState.opacity,
      roughness: 0,
      strokeStyle: appState.strokeStyle,
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
    const [cx, cy] = defaultControlPoint(this.startX, this.startY, worldX, worldY);
    const element: CurveElement = {
      id: crypto.randomUUID(),
      type: 'curve',
      x: this.startX,
      y: this.startY,
      x2: worldX,
      y2: worldY,
      cx,
      cy,
      strokeColor: appState.strokeColor,
      fillColor: 'transparent',
      strokeWidth: appState.strokeWidth,
      opacity: appState.opacity,
      roughness: 0,
      strokeStyle: appState.strokeStyle,
    };

    ctx.history.dispatch({ type: 'CREATE_ELEMENT', element });
    if (!ctx.history.present.appState.toolLocked) {
      ctx.history.dispatch({ type: 'SET_TOOL', tool: 'select', keepSelection: true });
    }
  }

  onDeactivate(_ctx: ToolContext): void {
    this.drawing = false;
    this.preview = null;
  }

  getCursor(): string {
    return 'crosshair';
  }
}
