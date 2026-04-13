import type { Tool, ToolContext } from './tool';
import type { PolygonElement } from '../elements/element';

/** Close threshold: snap to first vertex if within this many pixels (screen space). */
const CLOSE_THRESHOLD = 12;

export class PolygonTool implements Tool {
  private vertices: Array<readonly [number, number]> = [];
  private mouseX = 0;
  private mouseY = 0;
  preview: PolygonElement | null = null;

  onMouseMove(_e: MouseEvent, worldX: number, worldY: number, ctx: ToolContext): void {
    this.mouseX = worldX;
    this.mouseY = worldY;
    if (this.vertices.length > 0) {
      this.updatePreview(ctx, false);
      ctx.onPreviewUpdate?.();
    }
  }

  onMouseDown(_e: MouseEvent, worldX: number, worldY: number, ctx: ToolContext): void {
    // If we have vertices, check if clicking near the first one to close
    if (this.vertices.length >= 3) {
      const first = this.vertices[0]!;
      const vp = ctx.history.present.viewport;
      const zoom = vp.zoom;
      const dx = (worldX - first[0]) * zoom;
      const dy = (worldY - first[1]) * zoom;
      if (Math.hypot(dx, dy) < CLOSE_THRESHOLD) {
        this.commitPolygon(ctx, true);
        return;
      }
    }
    this.vertices.push([worldX, worldY] as const);
    this.updatePreview(ctx, false);
    ctx.onPreviewUpdate?.();
  }

  onMouseUp(_e: MouseEvent, _worldX: number, _worldY: number, _ctx: ToolContext): void {
    // No-op: polygon accumulates on clicks, not drag
  }

  onKeyDown(e: KeyboardEvent, ctx: ToolContext): void {
    if (e.key === 'Enter' && this.vertices.length >= 2) {
      e.preventDefault();
      this.commitPolygon(ctx, this.vertices.length >= 3);
    }
    if (e.key === 'Escape') {
      this.cancel();
    }
  }

  /** Double-click: close polygon if enough vertices */
  onDblClick(_e: MouseEvent, _worldX: number, _worldY: number, ctx: ToolContext): void {
    if (this.vertices.length >= 3) {
      // Remove the last vertex added by the second click of the double-click
      this.vertices.pop();
      this.commitPolygon(ctx, true);
    }
  }

  private updatePreview(ctx: ToolContext, closed: boolean): void {
    if (this.vertices.length === 0) { this.preview = null; return; }
    const { appState } = ctx.history.present;
    const pts: Array<readonly [number, number]> = [...this.vertices, [this.mouseX, this.mouseY] as const];
    this.preview = {
      id: '__preview__',
      type: 'polygon',
      x: 0, y: 0,
      points: pts,
      closed,
      strokeColor: appState.strokeColor,
      fillColor: appState.fillColor,
      strokeWidth: appState.strokeWidth,
      opacity: appState.opacity,
      roughness: 0,
      strokeStyle: appState.strokeStyle,
    };
  }

  private commitPolygon(ctx: ToolContext, closed: boolean): void {
    const vertices = this.vertices.slice();
    this.vertices = [];
    this.preview = null;

    if (vertices.length < 2) return;

    const { appState } = ctx.history.present;
    const element: PolygonElement = {
      id: crypto.randomUUID(),
      type: 'polygon',
      x: 0, y: 0,
      points: vertices,
      closed,
      strokeColor: appState.strokeColor,
      fillColor: appState.fillColor,
      strokeWidth: appState.strokeWidth,
      opacity: appState.opacity,
      roughness: 0,
      strokeStyle: appState.strokeStyle,
    };

    ctx.history.dispatch({ type: 'CREATE_ELEMENT', element });
    ctx.onPreviewUpdate?.();
    if (!ctx.history.present.appState.toolLocked) {
      ctx.history.dispatch({ type: 'SET_TOOL', tool: 'select', keepSelection: true });
    }
  }

  private cancel(): void {
    this.vertices = [];
    this.preview = null;
  }

  onDeactivate(_ctx: ToolContext): void {
    this.cancel();
  }

  getCursor(): string {
    return 'crosshair';
  }
}
