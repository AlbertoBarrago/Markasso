import type { Tool, ToolContext } from './tool';
import type { ArrowElement } from '../elements/element';
import { getElementBounds } from '../rendering/draw_selection';

const SNAP_RADIUS_PX = 20;

export class ArrowTool implements Tool {
  private drawing = false;
  private startX = 0;
  private startY = 0;
  preview: ArrowElement | null = null;

  startElementId: string | null = null;
  endElementId: string | null = null;
  snapIndicator: { worldX: number; worldY: number } | null = null;

  onMouseDown(_e: MouseEvent, worldX: number, worldY: number, ctx: ToolContext): void {
    this.drawing = true;
    this.preview = null;
    this.endElementId = null;
    this.snapIndicator = null;

    const scene = ctx.history.present;
    const snapRadius = SNAP_RADIUS_PX / scene.viewport.zoom;

    // Check if starting near an element center
    this.startElementId = null;
    let snappedX = worldX;
    let snappedY = worldY;
    for (const el of scene.elements) {
      if (el.type === 'line' || el.type === 'arrow') continue;
      const b = getElementBounds(el);
      const cx = b.x + b.w / 2;
      const cy = b.y + b.h / 2;
      if (Math.hypot(worldX - cx, worldY - cy) <= snapRadius) {
        this.startElementId = el.id;
        snappedX = cx;
        snappedY = cy;
        break;
      }
    }

    this.startX = snappedX;
    this.startY = snappedY;
  }

  onMouseMove(e: MouseEvent, worldX: number, worldY: number, ctx: ToolContext): void {
    if (!this.drawing) return;
    const { appState } = ctx.history.present;
    let [x2, y2] = [worldX, worldY];
    if (e.shiftKey) [x2, y2] = snap45(this.startX, this.startY, worldX, worldY);

    // Check for snap to element center at end position
    const scene = ctx.history.present;
    const snapRadius = SNAP_RADIUS_PX / scene.viewport.zoom;
    this.snapIndicator = null;
    for (const el of scene.elements) {
      if (el.type === 'line' || el.type === 'arrow') continue;
      const b = getElementBounds(el);
      const cx = b.x + b.w / 2;
      const cy = b.y + b.h / 2;
      if (Math.hypot(x2 - cx, y2 - cy) <= snapRadius) {
        x2 = cx;
        y2 = cy;
        this.snapIndicator = { worldX: cx, worldY: cy };
        break;
      }
    }

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
      strokeStyle: appState.strokeStyle,
    };
    ctx.onPreviewUpdate?.();
  }

  onMouseUp(e: MouseEvent, worldX: number, worldY: number, ctx: ToolContext): void {
    if (!this.drawing) return;
    this.drawing = false;

    let [x2, y2] = [worldX, worldY];
    if (e.shiftKey) [x2, y2] = snap45(this.startX, this.startY, worldX, worldY);

    // Check for snap to element center
    let finalEndElementId: string | null = null;
    const scene = ctx.history.present;
    const snapRadius = SNAP_RADIUS_PX / scene.viewport.zoom;
    for (const el of scene.elements) {
      if (el.type === 'line' || el.type === 'arrow') continue;
      const b = getElementBounds(el);
      const cx = b.x + b.w / 2;
      const cy = b.y + b.h / 2;
      if (Math.hypot(x2 - cx, y2 - cy) <= snapRadius) {
        x2 = cx;
        y2 = cy;
        finalEndElementId = el.id;
        break;
      }
    }

    this.preview = null;
    this.snapIndicator = null;

    const dx = x2 - this.startX, dy = y2 - this.startY;
    if (Math.abs(dx) < 2 && Math.abs(dy) < 2) {
      this.startElementId = null;
      this.endElementId = null;
      return;
    }

    const { appState } = ctx.history.present;
    const element: ArrowElement = {
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
      strokeStyle: appState.strokeStyle,
      ...(this.startElementId && { startElementId: this.startElementId }),
      ...(finalEndElementId && { endElementId: finalEndElementId }),
    };

    ctx.history.dispatch({ type: 'CREATE_ELEMENT', element });
    this.startElementId = null;
    this.endElementId = null;
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
