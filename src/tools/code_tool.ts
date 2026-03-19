import type { Tool, ToolContext } from './tool';
import type { TextElement } from '../elements/element';
import { worldToScreen } from '../core/viewport';

export class CodeTool implements Tool {
  private textarea: HTMLTextAreaElement | null = null;
  private commitFn: (() => void) | null = null;
  editingId: string | null = null;

  onMouseDown(e: MouseEvent, worldX: number, worldY: number, ctx: ToolContext): void {
    e.preventDefault();
    this.commitSync(ctx);
    this.pendingX = worldX;
    this.pendingY = worldY;
    this.pendingCreate = true;
  }

  private pendingCreate = false;
  private pendingX = 0;
  private pendingY = 0;

  onMouseMove(_e: MouseEvent, _wx: number, _wy: number, _ctx: ToolContext): void {}

  onMouseUp(_e: MouseEvent, _wx: number, _wy: number, ctx: ToolContext): void {
    if (this.pendingCreate) {
      this.pendingCreate = false;
      this.createCodeTextarea(this.pendingX, this.pendingY, ctx);
    }
  }

  onDeactivate(ctx: ToolContext): void {
    this.commitSync(ctx);
  }

  getCursor(): string {
    return 'crosshair';
  }

  private commitSync(ctx: ToolContext): void {
    if (!this.textarea || !this.commitFn) return;
    this.textarea.removeEventListener('blur', this.commitFn);
    const fn = this.commitFn;
    this.commitFn = null;
    this.textarea = null;
    fn();
  }

  private createCodeTextarea(worldX: number, worldY: number, ctx: ToolContext): void {
    const { viewport, appState } = ctx.history.present;
    const [screenX, screenY] = worldToScreen(viewport, worldX, worldY);
    const canvasRect = ctx.canvas.getBoundingClientRect();
    const scaledFont = appState.fontSize * viewport.zoom;

    const ta = document.createElement('textarea');
    ta.style.position      = 'fixed';
    ta.style.left          = `${screenX + canvasRect.left}px`;
    ta.style.top           = `${screenY + canvasRect.top}px`;
    ta.style.minWidth      = '160px';
    ta.style.minHeight     = `${scaledFont * 1.5}px`;
    ta.style.width         = '160px';
    ta.style.height        = `${scaledFont * 1.5}px`;
    ta.style.font          = `${scaledFont}px "Courier New", monospace`;
    ta.style.color         = appState.strokeColor;
    ta.style.caretColor    = 'var(--accent, #7c63d4)';
    ta.style.lineHeight    = '1.3';
    ta.style.padding       = '10px';
    ta.style.margin        = '0';
    ta.style.border        = '1px dashed rgba(255,255,255,0.3)';
    ta.style.outline       = 'none';
    ta.style.boxShadow     = 'none';
    ta.style.resize        = 'none';
    ta.style.overflow      = 'hidden';
    ta.style.background    = 'rgba(0,0,0,0.55)';
    ta.style.zIndex        = '1000';
    ta.style.whiteSpace    = 'pre';
    ta.style.overflowWrap  = 'normal';
    ta.style.tabSize       = '2';

    const grow = (): void => {
      ta.style.height = '0';
      ta.style.height = `${ta.scrollHeight}px`;
      ta.style.width  = '0';
      ta.style.width  = `${Math.max(ta.scrollWidth + 4, 160)}px`;
    };
    ta.addEventListener('input', grow);

    const doCommit = (): void => {
      const content = ta.value;
      const w = ta.offsetWidth / viewport.zoom;
      const h = ta.offsetHeight / viewport.zoom;
      ta.remove();
      if (this.textarea === ta) { this.textarea = null; this.commitFn = null; }
      this.editingId = null;

      if (content.trim()) {
        ctx.history.dispatch({
          type: 'CREATE_ELEMENT',
          element: {
            id: crypto.randomUUID(),
            type: 'text',
            x: worldX,
            y: worldY,
            width:  Math.max(w, 80),
            height: Math.max(h, 24),
            content,
            fontSize:   appState.fontSize,
            fontFamily: '"Courier New", monospace',
            strokeColor: appState.strokeColor,
            fillColor:   'transparent',
            strokeWidth: 0,
            opacity:     appState.opacity,
            roughness:   0,
            isCode:      true,
          } satisfies TextElement,
        });
        if (!ctx.history.present.appState.toolLocked) {
          ctx.history.dispatch({ type: 'SET_TOOL', tool: 'select', keepSelection: true });
        }
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
      // Shift+Enter commits; Enter inserts newline (reversed from text tool — code wants newlines)
      if (e.key === 'Enter' && e.shiftKey) {
        e.preventDefault();
        ta.removeEventListener('blur', onBlur);
        if (this.textarea === ta) { this.commitFn = null; this.textarea = null; }
        doCommit();
        return;
      }
      // Tab → insert spaces
      if (e.key === 'Tab') {
        e.preventDefault();
        const s = ta.selectionStart;
        ta.value = ta.value.slice(0, s) + '  ' + ta.value.slice(ta.selectionEnd);
        ta.selectionStart = ta.selectionEnd = s + 2;
        grow();
      }
    });

    document.body.appendChild(ta);
    ta.focus();
    grow();

    this.textarea = ta;
    this.commitFn = onBlur;
  }
}
