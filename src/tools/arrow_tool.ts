import type { Tool, ToolContext } from './tool';
import type { ArrowElement } from '../elements/element';
import { getElementBounds, getElementBorderPoint } from '../rendering/draw_selection';

const SNAP_RADIUS_PX = 20;

/** Distance from cursor to nearest point on element's bounding perimeter (0 if inside). */
function distToPerimeter(b: { x: number; y: number; w: number; h: number }, px: number, py: number): number {
  const nearX = Math.max(b.x, Math.min(b.x + b.w, px));
  const nearY = Math.max(b.y, Math.min(b.y + b.h, py));
  return Math.hypot(px - nearX, py - nearY);
}

export class ArrowTool implements Tool {
  private drawing = false;
  private startX = 0;
  private startY = 0;
  preview: ArrowElement | null = null;

  startElementId: string | null = null;
  endElementId: string | null = null;
  snapIndicator: { worldX: number; worldY: number } | null = null;
  snapElementId: string | null = null;

  onMouseDown(_e: MouseEvent, worldX: number, worldY: number, ctx: ToolContext): void {
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
    for (const el of scene.elements) {
      if (el.type === 'line' || el.type === 'arrow') continue;
      const b = getElementBounds(el);
      if (distToPerimeter(b, worldX, worldY) <= snapRadius) {
        this.startElementId = el.id;
        // Store center as fallback; resolveArrowEndpoints will compute border dynamically
        snappedX = b.x + b.w / 2;
        snappedY = b.y + b.h / 2;
        break;
      }
    }

    this.startX = snappedX;
    this.startY = snappedY;
  }

  onMouseMove(e: MouseEvent, worldX: number, worldY: number, ctx: ToolContext): void {
    const scene = ctx.history.present;
    const snapRadius = SNAP_RADIUS_PX / scene.viewport.zoom;

    if (!this.drawing) {
      // Pre-drawing: show hover snap indicator on nearby/inside elements
      this.snapIndicator = null;
      this.snapElementId = null;
      for (const el of scene.elements) {
        if (el.type === 'line' || el.type === 'arrow') continue;
        const b = getElementBounds(el);
        if (distToPerimeter(b, worldX, worldY) <= snapRadius) {
          // Show indicator at border point facing cursor direction
          const [bx, by] = getElementBorderPoint(el, worldX, worldY);
          this.snapIndicator = { worldX: bx, worldY: by };
          this.snapElementId = el.id;
          break;
        }
      }
      ctx.onPreviewUpdate?.();
      return;
    }

    const { appState } = scene;
    let [x2, y2] = [worldX, worldY];
    if (e.shiftKey) [x2, y2] = snap45(this.startX, this.startY, worldX, worldY);

    // Check for snap to element border at end position (border facing start)
    this.snapIndicator = null;
    this.snapElementId = null;
    for (const el of scene.elements) {
      if (el.type === 'line' || el.type === 'arrow') continue;
      const b = getElementBounds(el);
      if (distToPerimeter(b, x2, y2) <= snapRadius) {
        const [bx, by] = getElementBorderPoint(el, this.startX, this.startY);
        x2 = bx;
        y2 = by;
        this.snapIndicator = { worldX: bx, worldY: by };
        this.snapElementId = el.id;
        break;
      }
    }

    // When snapped to a start element, dynamically compute border point facing cursor
    let previewStartX = this.startX;
    let previewStartY = this.startY;
    if (this.startElementId) {
      const startEl = scene.elements.find((el) => el.id === this.startElementId);
      if (startEl) {
        [previewStartX, previewStartY] = getElementBorderPoint(startEl, x2, y2);
      }
    }

    this.preview = {
      id: '__preview__',
      type: 'arrow',
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
      ...(this.startElementId && { startElementId: this.startElementId }),
    };
    ctx.onPreviewUpdate?.();
  }

  onMouseUp(e: MouseEvent, worldX: number, worldY: number, ctx: ToolContext): void {
    if (!this.drawing) return;
    this.drawing = false;

    let [x2, y2] = [worldX, worldY];
    if (e.shiftKey) [x2, y2] = snap45(this.startX, this.startY, worldX, worldY);

    // Check for snap to element border at end position
    let finalEndElementId: string | null = null;
    const scene = ctx.history.present;
    const snapRadius = SNAP_RADIUS_PX / scene.viewport.zoom;
    for (const el of scene.elements) {
      if (el.type === 'line' || el.type === 'arrow') continue;
      const b = getElementBounds(el);
      if (distToPerimeter(b, x2, y2) <= snapRadius) {
        const [bx, by] = getElementBorderPoint(el, this.startX, this.startY);
        x2 = bx;
        y2 = by;
        finalEndElementId = el.id;
        break;
      }
    }

    this.preview = null;
    this.snapIndicator = null;
    this.snapElementId = null;

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
    if (!ctx.history.present.appState.toolLocked) {
      ctx.history.dispatch({ type: 'SET_TOOL', tool: 'select', keepSelection: true });
    }
    this.startElementId = null;
    this.endElementId = null;
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
