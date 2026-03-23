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

    // If clicking on an existing text element, edit it instead of creating a new one
    const elements = ctx.history.present.elements;
    for (let i = elements.length - 1; i >= 0; i--) {
      const el = elements[i];
      if (!el || el.type !== 'text') continue;
      const PAD = 4;
      if (worldX >= el.x - PAD && worldX <= el.x + el.width + PAD &&
          worldY >= el.y - PAD && worldY <= el.y + el.height + PAD) {
        this.editExisting(el, ctx);
        return;
      }
    }

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

      const { appState } = ctx.history.present;

      if (appState.textMode === 'code') {
        // Code mode: always auto-size, ignore drag dimensions
        this.createCodeTextarea(this.startX, this.startY, ctx);
        return;
      }

      // Calculate bounds from drag
      const x = Math.min(this.startX, this.currentX);
      const y = Math.min(this.startY, this.currentY);
      const width = Math.abs(this.currentX - this.startX);
      const height = Math.abs(this.currentY - this.startY);

      if (width > 5 && height > 5) {
        // Drag: use defined area
        this.createTextarea(x, y, width, height, ctx);
      } else {
        // Single click: auto-size to text content
        this.createAutoTextarea(this.startX, this.startY, ctx);
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
    ta.style.border = 'none';
    ta.style.outline = 'none';
    ta.style.boxShadow = 'none';
    ta.style.resize = 'none';
    ta.style.overflow = 'hidden';
    ta.style.background = 'transparent';
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
            fillColor: appState.fillColor,
            strokeWidth: 0,
            opacity: appState.opacity,
            roughness: 0,
            textAlign: appState.textAlign,
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
        if (this.textarea === ta) { this.commitFn = null; this.textarea = null; }
        doCommit();
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
    this.focusTextareaDeferred(ta);

    this.textarea = ta;
    this.commitFn = onBlur;
  }

  private createAutoTextarea(worldX: number, worldY: number, ctx: ToolContext): void {
    const { viewport, appState } = ctx.history.present;
    const [screenX, screenY] = worldToScreen(viewport, worldX, worldY);
    const canvasRect = ctx.canvas.getBoundingClientRect();
    const scaledFont = appState.fontSize * viewport.zoom;

    const ta = document.createElement('textarea');
    ta.style.position    = 'fixed';
    ta.style.left        = `${screenX + canvasRect.left}px`;
    ta.style.top         = `${screenY + canvasRect.top}px`;
    ta.style.minWidth    = '4px';
    ta.style.width       = '4px';
    ta.style.height      = `${scaledFont * 1.2}px`;
    ta.style.font        = `${scaledFont}px ${appState.fontFamily}`;
    ta.style.color       = appState.strokeColor;
    ta.style.caretColor  = 'var(--accent, #7c63d4)';
    ta.style.lineHeight  = '1.2';
    ta.style.padding     = '0';
    ta.style.margin      = '0';
    ta.style.border      = 'none';
    ta.style.outline     = 'none';
    ta.style.boxShadow   = 'none';
    ta.style.resize      = 'none';
    ta.style.overflow    = 'hidden';
    ta.style.background  = 'transparent';
    ta.style.zIndex      = '1000';
    ta.style.whiteSpace  = 'pre';
    ta.style.overflowWrap = 'normal';
    ta.style.textAlign   = appState.textAlign;

    // Mirror span to measure natural text width
    const mirror = document.createElement('span');
    mirror.style.cssText = `position:fixed;visibility:hidden;white-space:pre;font:${scaledFont}px ${appState.fontFamily};padding:0;`;
    document.body.appendChild(mirror);

    const grow = (): void => {
      const lines = ta.value.split('\n');
      let maxWidth = 0;
      for (const line of lines) {
        mirror.textContent = line || ' ';
        maxWidth = Math.max(maxWidth, mirror.offsetWidth);
      }
      ta.style.width  = `${maxWidth + 4}px`;
      ta.style.height = `${scaledFont * 1.2 * lines.length}px`;
    };
    ta.addEventListener('input', grow);

    const doCommit = (): void => {
      const content = ta.value.trim();
      const w = ta.offsetWidth / viewport.zoom;
      const h = ta.offsetHeight / viewport.zoom;
      mirror.remove();
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
            width:  Math.max(w, 10),
            height: Math.max(h, appState.fontSize),
            content,
            fontSize:    appState.fontSize,
            fontFamily:  appState.fontFamily,
            strokeColor: appState.strokeColor,
            fillColor:   'transparent',
            strokeWidth: 0,
            opacity:     appState.opacity,
            roughness:   0,
            textAlign:   appState.textAlign,
          } satisfies TextElement,
        });
        if (!ctx.history.present.appState.toolLocked) {
          ctx.history.dispatch({ type: 'SET_TOOL', tool: 'select', keepSelection: true });
        }
      } else {
        mirror.remove();
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
        if (this.textarea === ta) { this.commitFn = null; this.textarea = null; }
        doCommit();
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
    this.focusTextareaDeferred(ta);
    grow();

    this.textarea = ta;
    this.commitFn = onBlur;
  }

  getCursor(): string {
    return this.textarea ? 'text' : 'crosshair';
  }

  private createCodeTextarea(worldX: number, worldY: number, ctx: ToolContext): void {
    const { viewport, appState } = ctx.history.present;
    const [screenX, screenY] = worldToScreen(viewport, worldX, worldY);
    const canvasRect = ctx.canvas.getBoundingClientRect();
    const scaledFont = appState.fontSize * viewport.zoom;

    const ta = document.createElement('textarea');
    ta.style.position     = 'fixed';
    ta.style.left         = `${screenX + canvasRect.left}px`;
    ta.style.top          = `${screenY + canvasRect.top}px`;
    ta.style.minWidth     = '160px';
    ta.style.minHeight    = `${scaledFont * 1.5}px`;
    ta.style.width        = '160px';
    ta.style.height       = `${scaledFont * 1.5}px`;
    ta.style.font         = `${scaledFont}px "Courier New", monospace`;
    ta.style.color        = appState.strokeColor;
    ta.style.caretColor   = 'var(--accent, #7c63d4)';
    ta.style.lineHeight   = '1.3';
    ta.style.padding      = '10px';
    ta.style.margin       = '0';
    ta.style.border       = '1px dashed rgba(255,255,255,0.3)';
    ta.style.outline      = 'none';
    ta.style.boxShadow    = 'none';
    ta.style.resize       = 'none';
    ta.style.overflow     = 'hidden';
    ta.style.background   = 'rgba(0,0,0,0.55)';
    ta.style.zIndex       = '1000';
    ta.style.whiteSpace   = 'pre';
    ta.style.overflowWrap = 'normal';

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
            fontSize:    appState.fontSize,
            fontFamily:  '"Courier New", monospace',
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
        if (this.textarea === ta) { this.commitFn = null; this.textarea = null; }
        doCommit();
        return;
      }
      // Shift+Enter commits in code mode; plain Enter inserts newline
      if (e.key === 'Enter' && e.shiftKey) {
        e.preventDefault();
        ta.removeEventListener('blur', onBlur);
        if (this.textarea === ta) { this.commitFn = null; this.textarea = null; }
        doCommit();
        return;
      }
      if (e.key === 'Tab') {
        e.preventDefault();
        const s = ta.selectionStart;
        ta.value = ta.value.slice(0, s) + '  ' + ta.value.slice(ta.selectionEnd);
        ta.selectionStart = ta.selectionEnd = s + 2;
        grow();
      }
    });

    document.body.appendChild(ta);
    this.focusTextareaDeferred(ta);
    grow();

    this.textarea = ta;
    this.commitFn = onBlur;
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

    ta.style.position   = 'fixed';
    ta.style.left       = `${screenX + canvasRect.left}px`;
    ta.style.top        = `${screenY + canvasRect.top}px`;
    ta.style.width      = `${el.width * viewport.zoom}px`;
    ta.style.minWidth   = `${el.width * viewport.zoom}px`;
    ta.style.font       = `${el.fontSize * viewport.zoom}px ${el.fontFamily}`;
    ta.style.color      = el.strokeColor;
    ta.style.caretColor = 'var(--accent, #7c63d4)';
    ta.style.lineHeight = '1.2';
    ta.style.margin     = '0';
    ta.style.outline    = 'none';
    ta.style.boxShadow  = 'none';
    ta.style.resize     = 'none';
    ta.style.overflow   = 'hidden';
    ta.style.zIndex     = '1000';

    if (el.isCode) {
      ta.style.fontFamily   = '"Courier New", monospace';
      ta.style.background   = 'rgba(0,0,0,0.55)';
      ta.style.border       = '1px dashed rgba(255,255,255,0.3)';
      ta.style.padding      = '10px';
      ta.style.whiteSpace   = 'pre';
      ta.style.wordBreak    = 'normal';
      ta.style.overflowWrap = 'normal';
    } else {
      ta.style.background   = 'transparent';
      ta.style.border       = 'none';
      ta.style.padding      = '4px';
      ta.style.whiteSpace   = 'pre-wrap';
      ta.style.wordBreak    = 'break-word';
      ta.style.textAlign    = el.textAlign ?? 'left';
    }

    // Auto-grow height as user types
    const grow = (): void => {
      ta.style.height = '0';
      ta.style.height = `${ta.scrollHeight}px`;
    };
    ta.addEventListener('input', grow);
    // Trigger initial grow to show all existing content
    setTimeout(grow, 0);

    const doCommit = (): void => {
      const content = ta.value.trim();
      const newHeight = ta.offsetHeight / viewport.zoom;
      ta.remove();
      if (this.textarea === ta) { this.textarea = null; this.commitFn = null; }
      this.editingId = null;

      if (content) {
        ctx.history.dispatch({ type: 'EDIT_TEXT', id: el.id, content });
        // Update height if content grew/shrank
        const clampedHeight = Math.max(newHeight, el.fontSize);
        if (Math.abs(clampedHeight - el.height) > 1) {
          ctx.history.dispatch({ type: 'RESIZE_ELEMENT', id: el.id, height: clampedHeight });
        }
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
        if (this.textarea === ta) { this.commitFn = null; this.textarea = null; }
        doCommit();
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
    this.focusTextareaDeferred(ta, true);

    this.textarea = ta;
    this.commitFn = onBlur;
  }

  /** Defers focus so canvas click/mouseup focus handling doesn't instantly blur textareas. */
  private focusTextareaDeferred(ta: HTMLTextAreaElement, select = false): void {
    window.setTimeout(() => {
      if (!ta.isConnected) return;
      ta.focus();
      if (select) ta.select();
    }, 0);
  }
}
