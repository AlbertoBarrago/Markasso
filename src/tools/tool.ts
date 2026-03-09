import type { History } from '../engine/history';

export interface ToolContext {
  history: History;
  canvas: HTMLCanvasElement;
  // For drawing in-progress previews before committing to history
  onPreviewUpdate?: () => void;
}

export interface Tool {
  onMouseDown(e: MouseEvent, worldX: number, worldY: number, ctx: ToolContext): void;
  onMouseMove(e: MouseEvent, worldX: number, worldY: number, ctx: ToolContext): void;
  onMouseUp(e: MouseEvent, worldX: number, worldY: number, ctx: ToolContext): void;
  onKeyDown?(e: KeyboardEvent, ctx: ToolContext): void;
  onActivate?(ctx: ToolContext): void;
  onDeactivate?(ctx: ToolContext): void;
  /** Cursor style while this tool is active */
  getCursor(worldX: number, worldY: number, ctx: ToolContext): string;
}
