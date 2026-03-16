import type { Tool, ToolContext } from './tool';
import type { TextElement } from '../elements/element';
import { worldToScreen } from '../core/viewport';


export class TextTool implements Tool {
  private textarea: HTMLTextAreaElement | null = null;
  private commitFn: (() => void) | null = null;
  /** ID of the text element currently being edited (to suppress canvas rendering). */
  editingId: string | null = null;
  
  /** Drag state for creating text area */
  private isDragging = false;
  private startX = 0;
  private startY = 0;
  private currentX = 0;
  private currentY = 0;

  onMouseDown(e: MouseEvent, worldX: number, worldY: number, ctx: ToolContext): void {
    e.preventDefault();
    this.commitSync(ctx);
    
    // Start drag to define text area
    this.isDragging = true;
    this.startX = worldX;
    this.startY = worldY;
    this.currentX = worldX;
    this.currentY = worldY;
  }

  onMouseMove(e: MouseEvent, worldX: number, worldY: number, ctx: ToolContext): void {
    if (this.isDragging) {
      this.currentX = worldX;
      this.currentY = worldY;
      ctx.onPreviewUpdate?.();
    }
  }

  onMouseUp(e: MouseEvent, worldX: number, worldY: number, ctx: ToolContext): void {
    if (this.isDragging) {
      this.isDragging = false;

      // Calculate bounds from drag
      const x = Math.min(this.startX, this.currentX);
      const y = Math.min(this.startY, this.currentY);
      const width = Math.abs(this.currentX - this.startX);
      const height = Math.abs(this.currentY - this.startY);

      if (width > 5 && height > 5) {
        // Drag: use defined area
        this.createTextarea(x, y, width, height, ctx);
      } else {
        // Single click: use default size based on current font
        const { appState } = ctx.history.present;
        const defaultWidth = 240;
        const defaultHeight = appState.fontSize * 1.5;
        this.createTextarea(this.startX, this.startY, defaultWidth, defaultHeight, ctx);
      }
    }
  }

  onDeactivate(ctx: ToolContext): void {
    this.commitSync(ctx);
  }

  /** Get preview rectangle for rendering during drag */
  getPreview(): { x: number; y: number; width: number; height: number } | null {
    if (!this.isDragging) return null;
    return {
      x: Math.min(this.startX, this.currentX),
      y: Math.min(this.startY, this.currentY),
      width: Math.abs(this.currentX - this.startX),
      height: Math.abs(this.currentY - this.startY),
    };
  }

  private commitSync(ctx: ToolContext): void {
    if (!this.textarea || !this.commitFn) return;
    this.textarea.removeEventListener('blur', this.commitFn);
    const fn = this.commitFn;
    this.commitFn = null;
    this.textarea = null;
    fn();
  }

  private createTextarea(worldX: number, worldY: number, width: number, height: number, ctx: ToolContext): void {
    const { viewport, appState } = ctx.history.present;
    const [screenX, screenY] = worldToScreen(viewport, worldX, worldY);
    const canvasRect = ctx.canvas.getBoundingClientRect();

    const ta = document.createElement('textarea');

    // ── Invisible / Excalidraw-like style ────────────────────────────────
    ta.style.position = 'fixed';
    ta.style.left = `${screenX + canvasRect.left}px`;
    ta.style.top = `${screenY + canvasRect.top}px`;
    ta.style.width = `${width * viewport.zoom}px`;
    ta.style.height = `${height * viewport.zoom}px`;
    ta.style.minWidth = `${width * viewport.zoom}px`;
    ta.style.minHeight = `${height * viewport.zoom}px`;
    ta.style.font = `${appState.fontSize * viewport.zoom}px ${appState.fontFamily}`;
    ta.style.color = appState.strokeColor;
    ta.style.caretColor = 'var(--accent, #7c63d4)';
    ta.style.lineHeight = '1.2';
    ta.style.padding = '4px';
    ta.style.margin = '0';
    ta.style.border = `1px dashed ${appState.strokeColor}`;
    ta.style.outline = 'none';
    ta.style.boxShadow = 'none';
    ta.style.resize = 'none';
    ta.style.overflow = 'hidden';
    ta.style.background = 'rgba(255,255,255,0.05)';
    ta.style.zIndex = '1000';
    ta.style.whiteSpace = 'pre-wrap';
    ta.style.wordBreak = 'break-word';

    // ── Commit logic ─────────────────────────────────────────────────────
    const doCommit = (): void => {
      const content = ta.value.trim();
      ta.remove();
      if (this.textarea === ta) { this.textarea = null; this.commitFn = null; }

      if (content) {
        ctx.history.dispatch({
          type: 'CREATE_ELEMENT',
          element: {
            id: crypto.randomUUID(),
            type: 'text',
            x: worldX,
            y: worldY,
            width: width,
            height: height,
            content,
            fontSize: appState.fontSize,
            fontFamily: appState.fontFamily,
            strokeColor: appState.strokeColor,
            fillColor: 'transparent',
            strokeWidth: 0,
            opacity: appState.opacity,
            roughness: 0,
          } satisfies TextElement,
        });
        // Set flag to enable marquee drag on next select tool interaction
        ctx.history.dispatch({ type: 'SET_TOOL', tool: 'select' });
        ctx.history.dispatch({ type: 'SET_JUST_CREATED_TEXT' });
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

  getCursor(worldX: number, worldY: number, ctx: ToolContext): string {
    return this.isDragging ? 'crosshair' : 'text';
  }

  /** Opens a textarea pre-filled with an existing text element for editing. */
  editExisting(el: TextElement, ctx: ToolContext): void {
    this.commitSync(ctx);
    this.editingId = el.id;

    const { viewport } = ctx.history.present;
    const [screenX, screenY] = worldToScreen(viewport, el.x, el.y);
    const canvasRect = ctx.canvas.getBoundingClientRect();

    const ta = document.createElement('textarea');
    ta.value = el.content;

    ta.style.position = 'fixed';
    ta.style.left = `${screenX + canvasRect.left}px`;
    ta.style.top = `${screenY + canvasRect.top}px`;
    ta.style.width = `${el.width * viewport.zoom}px`;
    ta.style.height = `${el.height * viewport.zoom}px`;
    ta.style.minWidth = `${el.width * viewport.zoom}px`;
    ta.style.minHeight = `${el.height * viewport.zoom}px`;
    ta.style.font = `${el.fontSize * viewport.zoom}px ${el.fontFamily}`;
    ta.style.color = el.strokeColor;
    ta.style.caretColor = 'var(--accent, #7c63d4)';
    ta.style.lineHeight = '1.2';
    ta.style.padding = '4px';
    ta.style.margin = '0';
    ta.style.border = `1px dashed ${el.strokeColor}`;
    ta.style.outline = 'none';
    ta.style.boxShadow = 'none';
    ta.style.resize = 'none';
    ta.style.overflow = 'hidden';
    ta.style.background = 'rgba(255,255,255,0.05)';
    ta.style.zIndex = '1000';
    ta.style.whiteSpace = 'pre-wrap';
    ta.style.wordBreak = 'break-word';

    const doCommit = (): void => {
      const content = ta.value.trim();
      ta.remove();
      if (this.textarea === ta) { this.textarea = null; this.commitFn = null; }
      this.editingId = null;

      if (content) {
        ctx.history.dispatch({ type: 'EDIT_TEXT', id: el.id, content });
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
