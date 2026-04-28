import type { TextElement } from '../elements/element';
import type { Tool, ToolContext } from './tool';

const STICKY_W = 200;
const STICKY_H = 180;
const STICKY_FILL = '#FFD966';
const STICKY_FONT_SIZE = 16;

export class StickyTool implements Tool {
  /** Called after placing a sticky to immediately open the text editor. Injected by canvas_view.ts. */
  onPlaced: ((el: TextElement, ctx: ToolContext) => void) | null = null;

  onMouseDown(
    _e: MouseEvent,
    _worldX: number,
    _worldY: number,
    _ctx: ToolContext,
  ): void {
    // Nothing on mousedown
  }

  onMouseMove(
    _e: MouseEvent,
    _worldX: number,
    _worldY: number,
    _ctx: ToolContext,
  ): void {
    // No preview
  }

  onMouseUp(
    _e: MouseEvent,
    worldX: number,
    worldY: number,
    ctx: ToolContext,
  ): void {
    const id = crypto.randomUUID();
    const { appState } = ctx.history.present;
    const el: TextElement = {
      id,
      type: 'text',
      x: worldX - STICKY_W / 2,
      y: worldY - STICKY_H / 2,
      width: STICKY_W,
      height: STICKY_H,
      content: '',
      fontSize: STICKY_FONT_SIZE,
      fontFamily: appState.fontFamily,
      textAlign: 'left',
      strokeColor: '#5c4a00',
      fillColor: STICKY_FILL,
      strokeWidth: appState.strokeWidth,
      opacity: 1,
      roughness: 0,
      shadowBlur: 6,
      shadowColor: 'rgba(0,0,0,0.25)',
      shadowOffsetX: 3,
      shadowOffsetY: 3,
    };
    ctx.history.dispatch({ type: 'CREATE_ELEMENT', element: el });
    ctx.history.dispatch({ type: 'SELECT_ELEMENTS', ids: [id] });
    if (!ctx.history.present.appState.toolLocked) {
      ctx.history.dispatch({
        type: 'SET_TOOL',
        tool: 'select',
        keepSelection: true,
      });
    }
    this.onPlaced?.(el, ctx);
  }

  onDeactivate(_ctx: ToolContext): void {
    // Nothing
  }

  getCursor(): string {
    return 'crosshair';
  }
}
