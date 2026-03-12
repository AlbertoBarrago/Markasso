import type { Tool, ToolContext } from './tool';
import type { TextElement } from '../elements/element';
import { worldToScreen } from '../core/viewport';


export class TextTool implements Tool {
  private textarea: HTMLTextAreaElement | null = null;
  private commitFn: (() => void) | null = null;
  /** ID of the text element currently being edited (to suppress canvas rendering). */
  editingId: string | null = null;

  onMouseDown(e: MouseEvent, worldX: number, worldY: number, ctx: ToolContext): void {
    // Prevent browser from stealing focus away from the textarea
    e.preventDefault();
    this.commitSync(ctx);
    this.createTextarea(worldX, worldY, ctx);
  }

  onMouseMove(): void {}
  onMouseUp(): void {}

  onDeactivate(ctx: ToolContext): void {
    this.commitSync(ctx);
  }

  private commitSync(ctx: ToolContext): void {
    if (!this.textarea || !this.commitFn) return;
    this.textarea.removeEventListener('blur', this.commitFn);
    const fn = this.commitFn;
    this.commitFn  = null;
    this.textarea  = null;
    fn();
  }

  private createTextarea(worldX: number, worldY: number, ctx: ToolContext): void {
    const { viewport, appState } = ctx.history.present;
    const [screenX, screenY]    = worldToScreen(viewport, worldX, worldY);
    const canvasRect             = ctx.canvas.getBoundingClientRect();

    const ta = document.createElement('textarea');

    // ── Invisible / Excalidraw-like style ────────────────────────────────
    ta.style.position   = 'fixed';
    ta.style.left       = `${screenX + canvasRect.left}px`;
    ta.style.top        = `${screenY + canvasRect.top}px`;
    ta.style.minWidth   = '4px';
    ta.style.minHeight  = `${appState.fontSize * viewport.zoom}px`;
    ta.style.width      = '4px';       // starts tiny, grows with content
    ta.style.height     = `${appState.fontSize * viewport.zoom * 1.2}px`;
    ta.style.font       = `${appState.fontSize * viewport.zoom}px ${appState.fontFamily}`;
    ta.style.color      = appState.strokeColor;
    ta.style.caretColor = 'var(--accent, #7c63d4)';
    ta.style.lineHeight = '1.2';
    ta.style.padding    = '0';
    ta.style.margin     = '0';
    ta.style.border     = 'none';
    ta.style.outline    = 'none';
    ta.style.boxShadow  = 'none';
    ta.style.resize     = 'none';
    ta.style.overflow   = 'hidden';
    ta.style.background = 'transparent';
    ta.style.zIndex     = '1000';
    ta.style.whiteSpace = 'pre';       // prevent wrapping, width grows naturally

    // Auto-grow as the user types
    const grow = (): void => {
      ta.style.width  = '4px';         // reset to measure scrollWidth
      ta.style.width  = `${ta.scrollWidth}px`;
      ta.style.height = '4px';
      ta.style.height = `${ta.scrollHeight}px`;
    };
    ta.addEventListener('input', grow);

    // ── Commit logic ─────────────────────────────────────────────────────
    const doCommit = (): void => {
      const content  = ta.value.trim();
      // Read dimensions BEFORE removing from DOM (they become 0 after detach)
      const vp       = ctx.history.present.viewport;
      const elWidth  = Math.max(ta.scrollWidth,  8) / vp.zoom;
      const elHeight = Math.max(ta.scrollHeight, appState.fontSize) / vp.zoom;
      ta.remove();
      if (this.textarea === ta) { this.textarea = null; this.commitFn = null; }

      if (content) {
        ctx.history.dispatch({
          type: 'CREATE_ELEMENT',
          element: {
            id:          crypto.randomUUID(),
            type:        'text',
            x:           worldX,
            y:           worldY,
            width:       elWidth,
            height:      elHeight,
            content,
            fontSize:    appState.fontSize,
            fontFamily:  appState.fontFamily,
            strokeColor: appState.strokeColor,
            fillColor:   'transparent',
            strokeWidth: 0,
            opacity:     appState.opacity,
            roughness:   0,
          } satisfies TextElement,
        });
      }
    };

    const onBlur = (): void => {
      if (this.commitFn === onBlur) { this.commitFn = null; this.textarea = null; }
      doCommit();
    };

    ta.addEventListener('blur', onBlur, { once: true });

    ta.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        ta.removeEventListener('blur', onBlur);
        ta.remove();
        if (this.textarea === ta) { this.textarea = null; this.commitFn = null; }
        return;
      }
      // Enter commits; Shift+Enter inserts newline
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        ta.removeEventListener('blur', onBlur);
        if (this.textarea === ta) { this.commitFn = null; this.textarea = null; }
        doCommit();
      }
    });

    document.body.appendChild(ta);
    ta.focus();

    this.textarea = ta;
    this.commitFn = onBlur;
  }

  getCursor(): string { return 'text'; }

  /** Opens a textarea pre-filled with an existing text element for editing. */
  editExisting(el: TextElement, ctx: ToolContext): void {
    this.commitSync(ctx);
    this.editingId = el.id;

    const { viewport } = ctx.history.present;
    const [screenX, screenY] = worldToScreen(viewport, el.x, el.y);
    const canvasRect = ctx.canvas.getBoundingClientRect();

    const ta = document.createElement('textarea');
    ta.value = el.content;

    ta.style.position   = 'fixed';
    ta.style.left       = `${screenX + canvasRect.left}px`;
    ta.style.top        = `${screenY + canvasRect.top}px`;
    ta.style.minWidth   = '4px';
    ta.style.minHeight  = `${el.fontSize * viewport.zoom}px`;
    ta.style.width      = `${el.width * viewport.zoom}px`;
    ta.style.height     = `${el.height * viewport.zoom}px`;
    ta.style.font       = `${el.fontSize * viewport.zoom}px ${el.fontFamily}`;
    ta.style.color      = el.strokeColor;
    ta.style.caretColor = 'var(--accent, #7c63d4)';
    ta.style.lineHeight = '1.2';
    ta.style.padding    = '0';
    ta.style.margin     = '0';
    ta.style.border     = 'none';
    ta.style.outline    = 'none';
    ta.style.boxShadow  = 'none';
    ta.style.resize     = 'none';
    ta.style.overflow   = 'hidden';
    ta.style.background = 'transparent';
    ta.style.zIndex     = '1000';
    ta.style.whiteSpace = 'pre';

    const grow = (): void => {
      ta.style.width  = '4px';
      ta.style.width  = `${ta.scrollWidth}px`;
      ta.style.height = '4px';
      ta.style.height = `${ta.scrollHeight}px`;
    };
    ta.addEventListener('input', grow);

    const doCommit = (): void => {
      const content  = ta.value.trim();
      const vp       = ctx.history.present.viewport;
      const elWidth  = Math.max(ta.scrollWidth,  8) / vp.zoom;
      const elHeight = Math.max(ta.scrollHeight, el.fontSize) / vp.zoom;
      ta.remove();
      if (this.textarea === ta) { this.textarea = null; this.commitFn = null; }
      this.editingId = null;

      if (content) {
        ctx.history.dispatch({ type: 'EDIT_TEXT', id: el.id, content });
        ctx.history.dispatch({
          type: 'RESIZE_ELEMENT', id: el.id,
          x: el.x, y: el.y, width: elWidth, height: elHeight,
        });
      } else {
        ctx.history.dispatch({ type: 'DELETE_ELEMENTS', ids: [el.id] });
      }
    };

    const onBlur = (): void => {
      if (this.commitFn === onBlur) { this.commitFn = null; this.textarea = null; }
      doCommit();
    };

    ta.addEventListener('blur', onBlur, { once: true });

    ta.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        ta.removeEventListener('blur', onBlur);
        ta.remove();
        if (this.textarea === ta) { this.textarea = null; this.commitFn = null; }
        this.editingId = null;
        return;
      }
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        ta.removeEventListener('blur', onBlur);
        if (this.textarea === ta) { this.commitFn = null; this.textarea = null; }
        doCommit();
      }
    });

    document.body.appendChild(ta);
    ta.focus();
    ta.select();

    this.textarea = ta;
    this.commitFn = onBlur;
  }
}
