import type { Tool, ToolContext } from './tool';

export class HandTool implements Tool {
  private isPanning = false;
  private lastX = 0;
  private lastY = 0;

  onMouseDown(e: MouseEvent, _worldX: number, _worldY: number, ctx: ToolContext): void {
    e.preventDefault();
    this.isPanning = true;
    this.lastX = e.clientX;
    this.lastY = e.clientY;
  }

  onMouseMove(e: MouseEvent, _worldX: number, _worldY: number, ctx: ToolContext): void {
    if (this.isPanning) {
      const dx = e.clientX - this.lastX;
      const dy = e.clientY - this.lastY;
      this.lastX = e.clientX;
      this.lastY = e.clientY;
      ctx.history.dispatch({ type: 'PAN_VIEWPORT', dx, dy });
      ctx.onPreviewUpdate?.();
    }
  }

  onMouseUp(): void {
    this.isPanning = false;
  }

  onMouseLeave(): void {
    this.isPanning = false;
  }

  getCursor(): string {
    return this.isPanning ? 'grabbing' : 'grab';
  }
}
