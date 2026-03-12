import type { History } from '../engine/history';
import type { Tool, ToolContext } from '../tools/tool';
import { SelectTool } from '../tools/select_tool';
import { RectangleTool } from '../tools/rectangle_tool';
import { EllipseTool } from '../tools/ellipse_tool';
import { LineTool } from '../tools/line_tool';
import { ArrowTool } from '../tools/arrow_tool';
import { PenTool } from '../tools/pen_tool';
import { TextTool } from '../tools/text_tool';
import type { TextElement, RectangleElement, EllipseElement } from '../elements/element';
import { render } from '../rendering/renderer';
import { drawElement } from '../rendering/draw_element';
import { drawMarquee, drawHoverHighlight, drawSnapIndicator } from '../rendering/draw_selection';
import { screenToWorld, worldToScreen } from '../core/viewport';
import type { ActiveTool } from '../core/app_state';

const TOOLS: Record<ActiveTool, Tool> = {
  select: new SelectTool(),
  rectangle: new RectangleTool(),
  ellipse: new EllipseTool(),
  line: new LineTool(),
  arrow: new ArrowTool(),
  freehand: new PenTool(),
  text: new TextTool(),
};

export function initCanvasView(canvas: HTMLCanvasElement, history: History): { selectTool: SelectTool } {
  const ctx2d = canvas.getContext('2d')!;

  let isPanning = false;
  let panStartX = 0;
  let panStartY = 0;
  let needsRender = true;

  const toolCtx: ToolContext = {
    history,
    canvas,
    onPreviewUpdate: () => { needsRender = true; },
  };

  function getActiveTool(): Tool {
    return TOOLS[history.present.appState.activeTool];
  }

  function getWorldCoords(e: MouseEvent): [number, number] {
    const rect = canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    return screenToWorld(history.present.viewport, sx, sy);
  }

  function resizeCanvas(): void {
    canvas.width = canvas.clientWidth * devicePixelRatio;
    canvas.height = canvas.clientHeight * devicePixelRatio;
    needsRender = true;
  }

  // Resize observer
  const ro = new ResizeObserver(resizeCanvas);
  ro.observe(canvas);
  resizeCanvas();

  // Event listeners
  canvas.addEventListener('mousedown', (e) => {
    if (e.button === 1 || (e.button === 0 && e.altKey)) {
      // Middle click or Alt+click = pan
      isPanning = true;
      panStartX = e.clientX;
      panStartY = e.clientY;
      canvas.style.cursor = 'grabbing';
      e.preventDefault();
      return;
    }
    if (e.button !== 0) return;
    const [wx, wy] = getWorldCoords(e);
    getActiveTool().onMouseDown(e, wx, wy, toolCtx);
    needsRender = true;
  });

  canvas.addEventListener('mousemove', (e) => {
    if (isPanning) {
      const dx = e.clientX - panStartX;
      const dy = e.clientY - panStartY;
      panStartX = e.clientX;
      panStartY = e.clientY;
      history.dispatch({ type: 'PAN_VIEWPORT', dx, dy });
      needsRender = true;
      return;
    }
    const [wx, wy] = getWorldCoords(e);
    getActiveTool().onMouseMove(e, wx, wy, toolCtx);
    const cursor = getActiveTool().getCursor(wx, wy, toolCtx);
    canvas.style.cursor = cursor;
    needsRender = true;
  });

  window.addEventListener('mouseup', (e) => {
    if (isPanning) {
      isPanning = false;
      canvas.style.cursor = getActiveTool().getCursor(0, 0, toolCtx);
      return;
    }
    if (e.button !== 0) return;
    const [wx, wy] = getWorldCoords(e);
    getActiveTool().onMouseUp(e, wx, wy, toolCtx);
    needsRender = true;
  });

  canvas.addEventListener('dblclick', (e) => {
    const [wx, wy] = getWorldCoords(e);
    const scene = history.present;
    // Find element under cursor (topmost first)
    for (let i = scene.elements.length - 1; i >= 0; i--) {
      const el = scene.elements[i];
      if (!el) continue;

      if (el.type === 'text') {
        const x = el.x, y = el.y, w = el.width, h = el.height;
        if (wx >= x - 4 && wx <= x + w + 4 && wy >= y - 4 && wy <= y + h + 4) {
          (TOOLS.text as TextTool).editExisting(el as TextElement, toolCtx);
          needsRender = true;
          return;
        }
      }

      if (el.type === 'rectangle' || el.type === 'ellipse') {
        const bx = el.width < 0 ? el.x + el.width : el.x;
        const by = el.height < 0 ? el.y + el.height : el.y;
        const bw = Math.abs(el.width);
        const bh = Math.abs(el.height);
        if (wx >= bx - 4 && wx <= bx + bw + 4 && wy >= by - 4 && wy <= by + bh + 4) {
          openShapeLabelEditor(el as RectangleElement | EllipseElement, history, canvas);
          needsRender = true;
          return;
        }
      }
    }
  });

  // ── Touch support ──────────────────────────────────────────────────────────
  let touch1Id = -1, touch2Id = -1;
  let lastTouchX = 0, lastTouchY = 0;
  let lastPinchDist = 0, lastPinchMidX = 0, lastPinchMidY = 0;
  let lastTapTime = 0, lastTapX = 0, lastTapY = 0;

  function getWorldCoordsFromTouch(touch: Touch): [number, number] {
    const rect = canvas.getBoundingClientRect();
    return screenToWorld(history.present.viewport, touch.clientX - rect.left, touch.clientY - rect.top);
  }

  function syntheticMouse(type: string, clientX: number, clientY: number): MouseEvent {
    return new MouseEvent(type, { clientX, clientY, bubbles: false });
  }

  function getTouchById(list: TouchList, id: number): Touch | null {
    for (let i = 0; i < list.length; i++) if (list.item(i)!.identifier === id) return list.item(i)!;
    return null;
  }

  canvas.addEventListener('touchstart', (e) => {
    e.preventDefault();
    if (e.touches.length === 1) {
      const t = e.touches.item(0)!;
      touch1Id = t.identifier;
      touch2Id = -1;
      lastTouchX = t.clientX;
      lastTouchY = t.clientY;
      const [wx, wy] = getWorldCoordsFromTouch(t);
      getActiveTool().onMouseDown(syntheticMouse('mousedown', t.clientX, t.clientY), wx, wy, toolCtx);
      needsRender = true;
    } else if (e.touches.length === 2) {
      // Cancel any in-progress single-touch draw
      const t1prev = getTouchById(e.touches, touch1Id);
      if (t1prev) {
        const [wx, wy] = getWorldCoordsFromTouch(t1prev);
        getActiveTool().onMouseUp(syntheticMouse('mouseup', t1prev.clientX, t1prev.clientY), wx, wy, toolCtx);
      }
      const t1 = e.touches.item(0)!;
      const t2 = e.touches.item(1)!;
      touch1Id = t1.identifier;
      touch2Id = t2.identifier;
      lastPinchDist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
      lastPinchMidX = (t1.clientX + t2.clientX) / 2;
      lastPinchMidY = (t1.clientY + t2.clientY) / 2;
      needsRender = true;
    }
  }, { passive: false });

  canvas.addEventListener('touchmove', (e) => {
    e.preventDefault();
    if (touch2Id === -1) {
      // Single-finger: dispatch move to active tool
      const t = getTouchById(e.touches, touch1Id);
      if (!t) return;
      lastTouchX = t.clientX;
      lastTouchY = t.clientY;
      const [wx, wy] = getWorldCoordsFromTouch(t);
      getActiveTool().onMouseMove(syntheticMouse('mousemove', t.clientX, t.clientY), wx, wy, toolCtx);
      needsRender = true;
    } else {
      // Two-finger: pan + pinch-zoom
      const t1 = getTouchById(e.touches, touch1Id);
      const t2 = getTouchById(e.touches, touch2Id);
      if (!t1 || !t2) return;
      const midX = (t1.clientX + t2.clientX) / 2;
      const midY = (t1.clientY + t2.clientY) / 2;
      const dist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
      // Pan
      const dx = midX - lastPinchMidX;
      const dy = midY - lastPinchMidY;
      if (dx !== 0 || dy !== 0) {
        history.dispatch({ type: 'PAN_VIEWPORT', dx, dy });
      }
      // Zoom
      if (lastPinchDist > 0) {
        const factor = dist / lastPinchDist;
        const rect = canvas.getBoundingClientRect();
        history.dispatch({ type: 'ZOOM_VIEWPORT', factor, originX: midX - rect.left, originY: midY - rect.top });
      }
      lastPinchDist = dist;
      lastPinchMidX = midX;
      lastPinchMidY = midY;
      needsRender = true;
    }
  }, { passive: false });

  canvas.addEventListener('touchend', (e) => {
    e.preventDefault();
    if (touch2Id === -1) {
      // Single-finger end
      const changedTouch = e.changedTouches[0];
      if (changedTouch) {
        const [wx, wy] = getWorldCoordsFromTouch(changedTouch);
        getActiveTool().onMouseUp(syntheticMouse('mouseup', changedTouch.clientX, changedTouch.clientY), wx, wy, toolCtx);
        // Double-tap detection
        const now = Date.now();
        const dx = changedTouch.clientX - lastTapX;
        const dy = changedTouch.clientY - lastTapY;
        const dist = Math.hypot(dx, dy);
        if (now - lastTapTime < 300 && dist < 20) {
          canvas.dispatchEvent(new MouseEvent('dblclick', { clientX: changedTouch.clientX, clientY: changedTouch.clientY, bubbles: true }));
          lastTapTime = 0;
        } else {
          lastTapTime = now;
          lastTapX = changedTouch.clientX;
          lastTapY = changedTouch.clientY;
        }
      }
      touch1Id = -1;
    } else if (e.touches.length < 2) {
      // One finger lifted during two-finger gesture
      touch2Id = -1;
      if (e.touches.length === 1) {
        const remaining = e.touches.item(0)!;
        touch1Id = remaining.identifier;
        lastTouchX = remaining.clientX;
        lastTouchY = remaining.clientY;
      } else {
        touch1Id = -1;
      }
    }
    needsRender = true;
  }, { passive: false });

  canvas.addEventListener('mouseleave', () => {
    const tool = getActiveTool();
    if ('onMouseLeave' in tool) (tool as SelectTool).onMouseLeave();
    needsRender = true;
  });

  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    // Use CSS pixels — viewport coords are all in CSS pixel space
    const originX = e.clientX - rect.left;
    const originY = e.clientY - rect.top;

    if (e.ctrlKey || e.metaKey) {
      // Pinch zoom
      const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
      history.dispatch({ type: 'ZOOM_VIEWPORT', factor, originX, originY });
    } else {
      // Scroll pan
      history.dispatch({ type: 'PAN_VIEWPORT', dx: -e.deltaX, dy: -e.deltaY });
    }
    needsRender = true;
  }, { passive: false });

  window.addEventListener('keydown', (e) => {
    const target = e.target as HTMLElement;
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;
    getActiveTool().onKeyDown?.(e, toolCtx);
    needsRender = true;
  });

  // Sync tool when scene tool changes
  history.subscribe((scene) => {
    needsRender = true;
    // Update cursor
    const tool = TOOLS[scene.appState.activeTool];
    canvas.style.cursor = tool.getCursor(0, 0, toolCtx);
  });

  // rAF render loop
  function loop(): void {
    if (needsRender) {
      needsRender = false;
      renderFrame();
    }
    requestAnimationFrame(loop);
  }

  function renderFrame(): void {
    const editingId = (TOOLS.text as TextTool).editingId;
    render(ctx2d, history.present, canvas, editingId);

    // Draw preview element on top (in world transform)
    const activeTool = getActiveTool();
    const scene = history.present;

    if ('preview' in activeTool) {
      const preview = (activeTool as { preview: unknown }).preview;
      if (preview) {
        ctx2d.save();
        const { viewport } = scene;
        const dpr = window.devicePixelRatio;
        ctx2d.setTransform(viewport.zoom * dpr, 0, 0, viewport.zoom * dpr, viewport.offsetX * dpr, viewport.offsetY * dpr);
        ctx2d.globalAlpha = 0.7;
        drawElement(ctx2d, preview as Parameters<typeof drawElement>[1], scene.elements);
        ctx2d.restore();
      }
    }

    // Draw snap indicators (arrow/line tool and select tool endpoint drag)
    const selectTool = TOOLS['select'] as SelectTool;
    if ('snapIndicator' in activeTool) {
      const indicator = (activeTool as { snapIndicator: { worldX: number; worldY: number } | null }).snapIndicator;
      if (indicator) {
        drawSnapIndicator(ctx2d, indicator.worldX, indicator.worldY, scene.viewport);
      }
    }
    if (selectTool.endpointSnapIndicator) {
      drawSnapIndicator(ctx2d, selectTool.endpointSnapIndicator.worldX, selectTool.endpointSnapIndicator.worldY, scene.viewport);
    }
    if (selectTool.endpointSnapElementId) {
      const snapEl = scene.elements.find((el) => el.id === selectTool.endpointSnapElementId);
      if (snapEl) drawHoverHighlight(ctx2d, snapEl, scene.viewport);
    }

    // Draw hover highlight when using select tool (unselected elements only)
    if (scene.appState.activeTool === 'select' && selectTool.hoveredId) {
      const hoveredEl = scene.elements.find(
        (el) => el.id === selectTool.hoveredId && !scene.selectedIds.has(el.id),
      );
      if (hoveredEl) drawHoverHighlight(ctx2d, hoveredEl, scene.viewport);
    }

    // Draw hover highlight for arrow/line tool snap target (magnetic connection point)
    if ('snapElementId' in activeTool) {
      const snapElId = (activeTool as { snapElementId: string | null }).snapElementId;
      if (snapElId) {
        const snapEl = scene.elements.find((el) => el.id === snapElId);
        if (snapEl) drawHoverHighlight(ctx2d, snapEl, scene.viewport);
      }
    }

    // Draw marquee if select tool is in marquee mode
    if (selectTool.marqueeActive) {
      const [x1, y1, x2, y2] = selectTool.getMarquee();
      drawMarquee(ctx2d, x1, y1, x2, y2);
    }
  }

  requestAnimationFrame(loop);

  return { selectTool: TOOLS['select'] as SelectTool };
}

// ── Shape label editor ─────────────────────────────────────────────────────────

function openShapeLabelEditor(
  el: RectangleElement | EllipseElement,
  history: History,
  canvas: HTMLCanvasElement,
): void {
  const { viewport, appState } = history.present;
  const bx = el.width < 0 ? el.x + el.width : el.x;
  const by = el.height < 0 ? el.y + el.height : el.y;
  const bw = Math.abs(el.width);
  const bh = Math.abs(el.height);
  const cx = bx + bw / 2;
  const cy = by + bh / 2;

  const [screenCX, screenCY] = worldToScreen(viewport, cx, cy);
  const canvasRect = canvas.getBoundingClientRect();

  const fontSize = el.labelFontSize ?? appState.fontSize;
  const fontFamily = el.labelFontFamily ?? appState.fontFamily;
  const shapeW = bw * viewport.zoom;

  const ta = document.createElement('textarea');
  ta.value = el.label ?? '';

  ta.style.position    = 'fixed';
  ta.style.left        = `${screenCX + canvasRect.left - shapeW / 2}px`;
  ta.style.top         = `${screenCY + canvasRect.top - fontSize * viewport.zoom * 0.6}px`;
  ta.style.width       = `${shapeW}px`;
  ta.style.minHeight   = `${fontSize * viewport.zoom * 1.2}px`;
  ta.style.font        = `${fontSize * viewport.zoom}px ${fontFamily}`;
  ta.style.color       = el.strokeColor;
  ta.style.caretColor  = 'var(--accent, #7c63d4)';
  ta.style.textAlign   = 'center';
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
  ta.style.whiteSpace  = 'pre-wrap';
  ta.style.wordBreak   = 'break-word';

  const grow = (): void => {
    ta.style.height = '0';
    ta.style.height = `${ta.scrollHeight}px`;
  };
  ta.addEventListener('input', grow);
  grow();

  const doCommit = (): void => {
    const content = ta.value.trim();
    ta.remove();
    if (content !== (el.label ?? '')) {
      history.dispatch({ type: 'SET_SHAPE_LABEL', id: el.id, label: content, labelFontSize: fontSize, labelFontFamily: fontFamily });
    }
  };

  ta.addEventListener('blur', doCommit, { once: true });

  ta.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      ta.removeEventListener('blur', doCommit);
      ta.remove();
      return;
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      ta.removeEventListener('blur', doCommit);
      doCommit();
    }
  });

  document.body.appendChild(ta);
  ta.focus();
  ta.select();
}
