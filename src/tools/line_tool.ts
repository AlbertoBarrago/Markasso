import type { ConnectorAnchor, LineElement } from '../elements/element';
import {
  anchorToWorld,
  findConnectorSnapTarget,
  getNearestElementBorderPoint,
} from '../rendering/draw_selection';
import type { Tool, ToolContext } from './tool';

const SNAP_RADIUS_PX = 20;
/** Ports win over plain border snapping inside this screen-space radius. */
export const PORT_SNAP_RADIUS_PX = 14;

export class LineTool implements Tool {
  private drawing = false;
  private startX = 0;
  private startY = 0;
  preview: LineElement | null = null;

  startElementId: string | null = null;
  endElementId: string | null = null;
  startAnchor: ConnectorAnchor | null = null;
  snapIndicator: { worldX: number; worldY: number } | null = null;
  snapElementId: string | null = null;
  /** Port under the pointer, exposed so the canvas can highlight it. */
  snapAnchor: ConnectorAnchor | null = null;

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
    this.snapAnchor = null;

    const scene = ctx.history.present;
    const { zoom } = scene.viewport;

    this.startElementId = null;
    this.startAnchor = null;
    let snappedX = worldX;
    let snappedY = worldY;
    const startSnap = findConnectorSnapTarget(
      scene.elements,
      worldX,
      worldY,
      SNAP_RADIUS_PX / zoom,
      PORT_SNAP_RADIUS_PX / zoom,
    );
    if (startSnap) {
      this.startElementId = startSnap.elementId;
      this.startAnchor = startSnap.anchor ?? null;
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
    const { zoom } = scene.viewport;
    const snapRadius = SNAP_RADIUS_PX / zoom;
    const portRadius = PORT_SNAP_RADIUS_PX / zoom;

    if (!this.drawing) {
      this.snapIndicator = null;
      this.snapElementId = null;
      this.snapAnchor = null;
      const hoverSnap = findConnectorSnapTarget(
        scene.elements,
        worldX,
        worldY,
        snapRadius,
        portRadius,
      );
      if (hoverSnap) {
        this.snapIndicator = {
          worldX: hoverSnap.worldX,
          worldY: hoverSnap.worldY,
        };
        this.snapElementId = hoverSnap.elementId;
        this.snapAnchor = hoverSnap.anchor ?? null;
      }
      ctx.onPreviewUpdate?.();
      return;
    }

    const { appState } = scene;
    let [x2, y2] = [worldX, worldY];
    if (e.shiftKey) [x2, y2] = snap45(this.startX, this.startY, worldX, worldY);

    this.snapIndicator = null;
    this.snapElementId = null;
    this.snapAnchor = null;
    const endSnapMove = findConnectorSnapTarget(
      scene.elements,
      x2,
      y2,
      snapRadius,
      portRadius,
    );
    if (endSnapMove) {
      x2 = endSnapMove.worldX;
      y2 = endSnapMove.worldY;
      this.snapIndicator = { worldX: x2, worldY: y2 };
      this.snapElementId = endSnapMove.elementId;
      this.snapAnchor = endSnapMove.anchor ?? null;
    }

    let previewStartX = this.startX;
    let previewStartY = this.startY;
    if (this.startElementId) {
      const startEl = scene.elements.find(
        (el) => el.id === this.startElementId,
      );
      if (startEl) {
        [previewStartX, previewStartY] = this.startAnchor
          ? anchorToWorld(startEl, this.startAnchor)
          : getNearestElementBorderPoint(startEl, this.startX, this.startY);
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
      ...(appState.lineRouting === 'elbow' && { routing: 'elbow' }),
      ...(this.startElementId && { startElementId: this.startElementId }),
      ...(this.startElementId &&
        this.startAnchor && { startAnchor: this.startAnchor }),
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
    let finalEndAnchor: ConnectorAnchor | null = null;
    const scene = ctx.history.present;
    const { zoom } = scene.viewport;
    const endSnapUp = findConnectorSnapTarget(
      scene.elements,
      x2,
      y2,
      SNAP_RADIUS_PX / zoom,
      PORT_SNAP_RADIUS_PX / zoom,
    );
    if (endSnapUp) {
      x2 = endSnapUp.worldX;
      y2 = endSnapUp.worldY;
      finalEndElementId = endSnapUp.elementId;
      finalEndAnchor = endSnapUp.anchor ?? null;
    }

    this.preview = null;
    this.snapIndicator = null;
    this.snapElementId = null;
    this.snapAnchor = null;

    const dx = x2 - this.startX,
      dy = y2 - this.startY;
    if (Math.abs(dx) < 2 && Math.abs(dy) < 2) {
      this.startElementId = null;
      this.startAnchor = null;
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
      ...(appState.lineRouting === 'elbow' && { routing: 'elbow' }),
      ...(this.startElementId && { startElementId: this.startElementId }),
      ...(this.startElementId &&
        this.startAnchor && { startAnchor: this.startAnchor }),
      ...(finalEndElementId && { endElementId: finalEndElementId }),
      ...(finalEndElementId && finalEndAnchor && { endAnchor: finalEndAnchor }),
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
    this.startAnchor = null;
    this.endElementId = null;
  }

  onDeactivate(_ctx: ToolContext): void {
    this.drawing = false;
    this.preview = null;
    this.startElementId = null;
    this.startAnchor = null;
    this.endElementId = null;
    this.snapIndicator = null;
    this.snapElementId = null;
    this.snapAnchor = null;
  }

  onCancel(ctx: ToolContext): void {
    this.drawing = false;
    this.preview = null;
    this.startElementId = null;
    this.startAnchor = null;
    this.endElementId = null;
    this.snapIndicator = null;
    this.snapElementId = null;
    this.snapAnchor = null;
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
