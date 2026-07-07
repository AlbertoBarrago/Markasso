import type { LineElement } from '../elements/element';
import {
  findNearestElementSnapTarget,
  getNearestElementBorderPoint,
} from '../rendering/draw_selection';
import type { Tool, ToolContext } from './tool';

const SNAP_RADIUS_PX = 20;

export class LineTool implements Tool {
  private drawing = false;
  private startX = 0;
  private startY = 0;
  preview: LineElement | null = null;

  startElementId: string | null = null;
  endElementId: string | null = null;
  snapIndicator: { worldX: number; worldY: number } | null = null;
  snapElementId: string | null = null;

  onMouseDown(
    _e: MouseEvent,
    worldX: number,
    worldY: number,
    ctx: ToolContext,
  ): void {
    this.drawing = true;
    this.preview = null;
    this.endElementId = null;
    this.snapIndicator = null;
    this.snapElementId = null;

    const scene = ctx.history.present;
    const snapRadius = SNAP_RADIUS_PX / scene.viewport.zoom;

    this.startElementId = null;
    let snappedX = worldX;
    let snappedY = worldY;
    const startSnap = findNearestElementSnapTarget(
      scene.elements,
      worldX,
      worldY,
      snapRadius,
    );
    if (startSnap) {
      this.startElementId = startSnap.elementId;
      snappedX = startSnap.worldX;
      snappedY = startSnap.worldY;
    }

    this.startX = snappedX;
    this.startY = snappedY;
  }

  onMouseMove(
    e: MouseEvent,
    worldX: number,
    worldY: number,
    ctx: ToolContext,
  ): void {
    const scene = ctx.history.present;
    const snapRadius = SNAP_RADIUS_PX / scene.viewport.zoom;

    if (!this.drawing) {
      this.snapIndicator = null;
      this.snapElementId = null;
      const hoverSnap = findNearestElementSnapTarget(
        scene.elements,
        worldX,
        worldY,
        snapRadius,
      );
      if (hoverSnap) {
        this.snapIndicator = {
          worldX: hoverSnap.worldX,
          worldY: hoverSnap.worldY,
        };
        this.snapElementId = hoverSnap.elementId;
      }
      ctx.onPreviewUpdate?.();
      return;
    }

    const { appState } = scene;
    let [x2, y2] = [worldX, worldY];
    if (e.shiftKey) [x2, y2] = snap45(this.startX, this.startY, worldX, worldY);

    this.snapIndicator = null;
    this.snapElementId = null;
    const endSnapMove = findNearestElementSnapTarget(
      scene.elements,
      x2,
      y2,
      snapRadius,
    );
    if (endSnapMove) {
      x2 = endSnapMove.worldX;
      y2 = endSnapMove.worldY;
      this.snapIndicator = { worldX: x2, worldY: y2 };
      this.snapElementId = endSnapMove.elementId;
    }

    let previewStartX = this.startX;
    let previewStartY = this.startY;
    if (this.startElementId) {
      const startEl = scene.elements.find(
        (el) => el.id === this.startElementId,
      );
      if (startEl) {
        [previewStartX, previewStartY] = getNearestElementBorderPoint(
          startEl,
          this.startX,
          this.startY,
        );
      }
    }

    this.preview = {
      id: '__preview__',
      type: 'line',
      x: previewStartX,
      y: previewStartY,
      x2,
      y2,
      strokeColor: appState.strokeColor,
      fillColor: 'transparent',
      strokeWidth: appState.strokeWidth,
      opacity: appState.opacity,
      roughness: appState.roughness,
      strokeStyle: appState.strokeStyle,
      arrowHead: 'end',
      ...(this.startElementId && { startElementId: this.startElementId }),
    };
    ctx.onPreviewUpdate?.();
  }

  onMouseUp(
    e: MouseEvent,
    worldX: number,
    worldY: number,
    ctx: ToolContext,
  ): void {
    if (!this.drawing) return;
    this.drawing = false;

    let [x2, y2] = [worldX, worldY];
    if (e.shiftKey) [x2, y2] = snap45(this.startX, this.startY, worldX, worldY);

    let finalEndElementId: string | null = null;
    const scene = ctx.history.present;
    const snapRadius = SNAP_RADIUS_PX / scene.viewport.zoom;
    const endSnapUp = findNearestElementSnapTarget(
      scene.elements,
      x2,
      y2,
      snapRadius,
    );
    if (endSnapUp) {
      x2 = endSnapUp.worldX;
      y2 = endSnapUp.worldY;
      finalEndElementId = endSnapUp.elementId;
    }

    this.preview = null;
    this.snapIndicator = null;
    this.snapElementId = null;

    const dx = x2 - this.startX,
      dy = y2 - this.startY;
    if (Math.abs(dx) < 2 && Math.abs(dy) < 2) {
      this.startElementId = null;
      this.endElementId = null;
      return;
    }

    const { appState } = ctx.history.present;
    const element: LineElement = {
      id: crypto.randomUUID(),
      type: 'line',
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
      arrowHead: 'end',
      ...(this.startElementId && { startElementId: this.startElementId }),
      ...(finalEndElementId && { endElementId: finalEndElementId }),
    };

    ctx.history.dispatch({ type: 'CREATE_ELEMENT', element });
    if (!ctx.history.present.appState.toolLocked) {
      ctx.history.dispatch({
        type: 'SET_TOOL',
        tool: 'select',
        keepSelection: true,
      });
    }
    this.startElementId = null;
    this.endElementId = null;
  }

  onDeactivate(_ctx: ToolContext): void {
    this.drawing = false;
    this.preview = null;
    this.startElementId = null;
    this.endElementId = null;
    this.snapIndicator = null;
    this.snapElementId = null;
  }

  onCancel(ctx: ToolContext): void {
    this.drawing = false;
    this.preview = null;
    this.startElementId = null;
    this.endElementId = null;
    this.snapIndicator = null;
    this.snapElementId = null;
    ctx.onPreviewUpdate?.();
  }

  getCursor(): string {
    return 'crosshair';
  }
}

export function snap45(
  startX: number,
  startY: number,
  x: number,
  y: number,
): [number, number] {
  const dx = x - startX,
    dy = y - startY;
  const angle = Math.atan2(dy, dx);
  const snapped = Math.round(angle / (Math.PI / 4)) * (Math.PI / 4);
  const dist = Math.hypot(dx, dy);
  return [startX + dist * Math.cos(snapped), startY + dist * Math.sin(snapped)];
}

export function distToPerimeterBounds(
  b: { x: number; y: number; w: number; h: number },
  px: number,
  py: number,
): number {
  const nearX = Math.max(b.x, Math.min(b.x + b.w, px));
  const nearY = Math.max(b.y, Math.min(b.y + b.h, py));
  return Math.hypot(px - nearX, py - nearY);
}
