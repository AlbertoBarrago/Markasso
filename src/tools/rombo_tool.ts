import type { Tool, ToolContext } from './tool';
import type { LineElement } from '../elements/element';

type Segment = {
  x: number;
  y: number;
  x2: number;
  y2: number;
};

export class RomboTool implements Tool {
  private drawing = false;
  private startX = 0;
  private startY = 0;
  preview: LineElement[] | null = null;

  onMouseDown(_e: MouseEvent, worldX: number, worldY: number, _ctx: ToolContext): void {
    this.drawing = true;
    this.startX = worldX;
    this.startY = worldY;
    this.preview = null;
  }

  onMouseMove(e: MouseEvent, worldX: number, worldY: number, ctx: ToolContext): void {
    if (!this.drawing) return;
    const [x2, y2] = getEndPoint(this.startX, this.startY, worldX, worldY, e.shiftKey);
    const segments = toDiamondSegments(this.startX, this.startY, x2, y2);
    const { appState } = ctx.history.present;
    this.preview = segments.map((s) => ({
      id: '__preview__',
      type: 'line',
      x: s.x,
      y: s.y,
      x2: s.x2,
      y2: s.y2,
      strokeColor: appState.strokeColor,
      fillColor: 'transparent',
      strokeWidth: appState.strokeWidth,
      opacity: appState.opacity,
      roughness: appState.roughness,
      strokeStyle: appState.strokeStyle,
    }));
    ctx.onPreviewUpdate?.();
  }

  onMouseUp(e: MouseEvent, worldX: number, worldY: number, ctx: ToolContext): void {
    if (!this.drawing) return;
    this.drawing = false;
    this.preview = null;

    const [x2, y2] = getEndPoint(this.startX, this.startY, worldX, worldY, e.shiftKey);
    const width = Math.abs(x2 - this.startX);
    const height = Math.abs(y2 - this.startY);
    if (width < 2 && height < 2) return;

    const segments = toDiamondSegments(this.startX, this.startY, x2, y2);
    const { appState } = ctx.history.present;
    const groupId = crypto.randomUUID();
    const elements: LineElement[] = segments.map((s) => ({
      id: crypto.randomUUID(),
      type: 'line',
      x: s.x,
      y: s.y,
      x2: s.x2,
      y2: s.y2,
      strokeColor: appState.strokeColor,
      fillColor: 'transparent',
      strokeWidth: appState.strokeWidth,
      opacity: appState.opacity,
      roughness: appState.roughness,
      strokeStyle: appState.strokeStyle,
      groupId,
    }));

    ctx.history.dispatch({ type: 'CREATE_ELEMENTS', elements });
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

function getEndPoint(
  startX: number,
  startY: number,
  x: number,
  y: number,
  lockRatio: boolean,
): [number, number] {
  if (!lockRatio) return [x, y];
  let w = x - startX;
  let h = y - startY;
  const s = Math.min(Math.abs(w), Math.abs(h));
  w = Math.sign(w || 1) * s;
  h = Math.sign(h || 1) * s;
  return [startX + w, startY + h];
}

function toDiamondSegments(x1: number, y1: number, x2: number, y2: number): Segment[] {
  const minX = Math.min(x1, x2);
  const minY = Math.min(y1, y2);
  const maxX = Math.max(x1, x2);
  const maxY = Math.max(y1, y2);

  const top: [number, number] = [(minX + maxX) / 2, minY];
  const right: [number, number] = [maxX, (minY + maxY) / 2];
  const bottom: [number, number] = [(minX + maxX) / 2, maxY];
  const left: [number, number] = [minX, (minY + maxY) / 2];

  return [
    { x: top[0], y: top[1], x2: right[0], y2: right[1] },
    { x: right[0], y: right[1], x2: bottom[0], y2: bottom[1] },
    { x: bottom[0], y: bottom[1], x2: left[0], y2: left[1] },
    { x: left[0], y: left[1], x2: top[0], y2: top[1] },
  ];
}
