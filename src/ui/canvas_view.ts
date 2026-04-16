import type { History } from '../engine/history';
import type { Tool, ToolContext } from '../tools/tool';
import { SelectTool } from '../tools/select_tool';
import { HandTool } from '../tools/hand_tool';
import { RectangleTool } from '../tools/rectangle_tool';
import { EllipseTool } from '../tools/ellipse_tool';
import { LineTool } from '../tools/line_tool';
import { RomboTool } from '../tools/rombo_tool';
import { PenTool } from '../tools/pen_tool';
import { TextTool } from '../tools/text_tool';
import { StickyTool } from '../tools/sticky_tool';
import { EraserTool, type SlashPoint } from '../tools/eraser_tool';
import type { TextElement, RectangleElement, EllipseElement, RhombusElement, LineElement } from '../elements/element';
import { render } from '../rendering/renderer';
import { drawElement } from '../rendering/draw_element';
import { drawMarquee, drawHoverHighlight, drawSnapIndicator, drawAlignGuides } from '../rendering/draw_selection';
import { screenToWorld, worldToScreen } from '../core/viewport';
import type { ActiveTool } from '../core/app_state';
import { t } from '../i18n';

const textTool = new TextTool();
const stickyTool = new StickyTool();

const TOOLS: Record<ActiveTool, Tool> = {
  select: new SelectTool(),
  hand: new HandTool(),
  eraser: new EraserTool(),
  rectangle: new RectangleTool(),
  ellipse: new EllipseTool(),
  line: new LineTool(),
  rombo: new RomboTool(),
  freehand: new PenTool(),
  text: textTool,
  sticky: stickyTool,
};

export function initCanvasView(canvas: HTMLCanvasElement, history: History): { selectTool: SelectTool } {
  const ctx2d = canvas.getContext('2d')!;

  let isPanning = false;
  let panStartX = 0;
  let panStartY = 0;
  let needsRender = true;
  let editingShapeLabelId: string | null = null;

  const toolCtx: ToolContext = {
    history,
    canvas,
    onPreviewUpdate: () => { needsRender = true; },
  };

  function getActiveTool(): Tool {
    return TOOLS[history.present.appState.activeTool];
  }

  const SNAP_TOOLS = new Set(['rectangle', 'ellipse', 'rombo', 'arrow', 'line', 'freehand', 'text']);

  function snapWorldCoords(wx: number, wy: number): [number, number] {
    const { appState } = history.present;
    if (!appState.gridVisible || !SNAP_TOOLS.has(appState.activeTool)) return [wx, wy];
    const g = appState.gridSize;
    return [Math.round(wx / g) * g, Math.round(wy / g) * g];
  }

  function getWorldCoords(e: MouseEvent): [number, number] {
    const rect = canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    return snapWorldCoords(...screenToWorld(history.present.viewport, sx, sy));
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

    // Let active tool handle double-click first (e.g. polygon closing)
    const activeTool = getActiveTool();
    if (activeTool.onDblClick) {
      activeTool.onDblClick(e, wx, wy, toolCtx);
      needsRender = true;
      return;
    }

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

      if (el.type === 'rectangle' || el.type === 'ellipse' || el.type === 'rhombus') {
        const bx = el.width < 0 ? el.x + el.width : el.x;
        const by = el.height < 0 ? el.y + el.height : el.y;
        const bw = Math.abs(el.width);
        const bh = Math.abs(el.height);
        if (wx >= bx - 4 && wx <= bx + bw + 4 && wy >= by - 4 && wy <= by + bh + 4) {
          openShapeLabelEditor(el as RectangleElement | EllipseElement | RhombusElement, history, canvas, (id) => { editingShapeLabelId = id; needsRender = true; });
          needsRender = true;
          return;
        }
      }

      if (el.type === 'arrow' || el.type === 'line') {
        const line = el as LineElement;
        const hitLabel = isPointInArrowLabel(wx, wy, line);
        const hitShaft = distPointToSegment(wx, wy, line.x, line.y, line.x2, line.y2) < line.strokeWidth / 2 + 8;
        if (hitLabel || hitShaft) {
          openArrowLabelEditor(line, history, canvas, (id) => { editingShapeLabelId = id; needsRender = true; });
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

  // Touch pan inertia
  let inertiaVX = 0;
  let inertiaVY = 0;
  let inertiaRafId = 0;
  let lastTouchMoveTime = 0;
  let prevInertiaX = 0;
  let prevInertiaY = 0;

  // ── Long-press context menu ────────────────────────────────────────────────
  let longPressTimer = 0;
  let longPressClientX = 0;
  let longPressClientY = 0;
  let longPressMoved = false;
  const LONG_PRESS_MS = 500;
  const LONG_PRESS_MOVE_TOL = 8;

  const ctxMenu = document.createElement('div');
  ctxMenu.className = 'touch-ctx-menu';
  ctxMenu.setAttribute('role', 'menu');
  ctxMenu.setAttribute('aria-label', t('contextMenu'));
  ctxMenu.style.display = 'none';
  document.body.appendChild(ctxMenu);

  function closeCtxMenu(): void {
    ctxMenu.style.display = 'none';
  }

  function openCtxMenu(clientX: number, clientY: number): void {
    const scene = history.present;
    const selectedIds = [...scene.selectedIds];
    if (selectedIds.length === 0) return;

    ctxMenu.innerHTML = '';

    const actions: Array<{ label: string; icon: string; action: () => void }> = [
      {
        label: t('duplicate'),
        icon: `<svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="7" y="7" width="9" height="9" rx="1.5"/><path d="M13 7V5.5A1.5 1.5 0 0 0 11.5 4h-7A1.5 1.5 0 0 0 3 5.5v7A1.5 1.5 0 0 0 4.5 14H7"/></svg>`,
        action: () => {
          const newIds: string[] = [];
          const sc = history.present;
          for (const id of [...sc.selectedIds]) {
            const el = sc.elements.find((e) => e.id === id);
            if (!el) continue;
            const newId = crypto.randomUUID();
            newIds.push(newId);
            history.dispatch({ type: 'CREATE_ELEMENT', element: { ...el, id: newId } });
            history.dispatch({ type: 'MOVE_ELEMENT', id: newId, dx: 20, dy: 20 });
          }
          if (newIds.length > 0) history.dispatch({ type: 'SELECT_ELEMENTS', ids: newIds });
          closeCtxMenu();
        },
      },
      {
        label: t('delete'),
        icon: `<svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><polyline points="3,6 17,6"/><path d="M8 6V4h4v2"/><rect x="5" y="6" width="10" height="10" rx="1"/><line x1="8" y1="10" x2="8" y2="14"/><line x1="12" y1="10" x2="12" y2="14"/></svg>`,
        action: () => {
          const sc = history.present;
          const ids = [...sc.selectedIds].filter((id) => {
            const el = sc.elements.find((e) => e.id === id);
            return el && !el.locked;
          });
          if (ids.length > 0) history.dispatch({ type: 'DELETE_ELEMENTS', ids });
          closeCtxMenu();
        },
      },
    ];

    for (const item of actions) {
      const btn = document.createElement('button');
      btn.className = 'touch-ctx-menu-item';
      btn.setAttribute('role', 'menuitem');
      btn.innerHTML = `${item.icon}<span>${item.label}</span>`;
      btn.addEventListener('pointerdown', (e) => { e.stopPropagation(); item.action(); });
      ctxMenu.appendChild(btn);
    }

    ctxMenu.style.display = 'block';
    requestAnimationFrame(() => {
      const mw = ctxMenu.offsetWidth;
      const mh = ctxMenu.offsetHeight;
      let left = clientX - mw / 2;
      let top = clientY - mh - 12;
      left = Math.max(8, Math.min(left, window.innerWidth - mw - 8));
      top = Math.max(8, Math.min(top, window.innerHeight - mh - 8));
      ctxMenu.style.left = `${left}px`;
      ctxMenu.style.top = `${top}px`;
    });
  }

  // Close on outside tap
  document.addEventListener('pointerdown', (e) => {
    if (ctxMenu.style.display !== 'none' && !ctxMenu.contains(e.target as Node)) {
      closeCtxMenu();
    }
  }, true);

  function getWorldCoordsFromTouch(touch: Touch): [number, number] {
    const rect = canvas.getBoundingClientRect();
    return snapWorldCoords(...screenToWorld(history.present.viewport, touch.clientX - rect.left, touch.clientY - rect.top));
  }

  function syntheticMouse(type: string, clientX: number, clientY: number): MouseEvent {
    return new MouseEvent(type, { clientX, clientY, bubbles: false });
  }

  function getTouchById(list: TouchList, id: number): Touch | null {
    for (let i = 0; i < list.length; i++) if (list.item(i)!.identifier === id) return list.item(i)!;
    return null;
  }

  function preventIfCancelable(e: Event): void {
    if (e.cancelable) e.preventDefault();
  }

  canvas.addEventListener('touchstart', (e) => {
    preventIfCancelable(e);
    cancelAnimationFrame(inertiaRafId);
    if (e.touches.length === 1) {
      const t = e.touches.item(0)!;
      touch1Id = t.identifier;
      touch2Id = -1;
      lastTouchX = t.clientX;
      lastTouchY = t.clientY;
      const [wx, wy] = getWorldCoordsFromTouch(t);
      getActiveTool().onMouseDown(syntheticMouse('mousedown', t.clientX, t.clientY), wx, wy, toolCtx);
      needsRender = true;

      // Long-press timer
      clearTimeout(longPressTimer);
      longPressClientX = t.clientX;
      longPressClientY = t.clientY;
      longPressMoved = false;
      longPressTimer = window.setTimeout(() => {
        if (!longPressMoved && touch2Id === -1) {
          openCtxMenu(longPressClientX, longPressClientY);
        }
      }, LONG_PRESS_MS);
    } else if (e.touches.length === 2) {
      clearTimeout(longPressTimer);
      longPressMoved = true;
      // Cancel any in-progress single-touch draw.
      // Use onCancel() when available (e.g. PenTool) so the tool can discard
      // the partial stroke rather than committing it — a second finger is
      // almost always a pinch-to-zoom, not an intentional stroke end.
      const activeTool = getActiveTool();
      if (touch1Id !== -1) {
        if (activeTool.onCancel) {
          activeTool.onCancel(toolCtx);
        } else {
          const t1prev = getTouchById(e.touches, touch1Id);
          if (t1prev) {
            const [wx, wy] = getWorldCoordsFromTouch(t1prev);
            activeTool.onMouseUp(syntheticMouse('mouseup', t1prev.clientX, t1prev.clientY), wx, wy, toolCtx);
          }
        }
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
    preventIfCancelable(e);
    if (touch2Id === -1) {
      // Single-finger: dispatch move to active tool
      const t = getTouchById(e.touches, touch1Id);
      if (!t) return;
      lastTouchX = t.clientX;
      lastTouchY = t.clientY;
      // Cancel long-press if finger moved too far
      if (!longPressMoved && Math.hypot(t.clientX - longPressClientX, t.clientY - longPressClientY) > LONG_PRESS_MOVE_TOL) {
        longPressMoved = true;
        clearTimeout(longPressTimer);
      }
      const now = performance.now();
      const dt = Math.max(1, now - lastTouchMoveTime);
      inertiaVX = (t.clientX - prevInertiaX) / dt;
      inertiaVY = (t.clientY - prevInertiaY) / dt;
      prevInertiaX = t.clientX;
      prevInertiaY = t.clientY;
      lastTouchMoveTime = now;
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
    preventIfCancelable(e);
    clearTimeout(longPressTimer);
    if (touch2Id === -1) {
      // Single-finger end
      const changedTouch = e.changedTouches[0];
      if (changedTouch) {
        const [wx, wy] = getWorldCoordsFromTouch(changedTouch);
        getActiveTool().onMouseUp(syntheticMouse('mouseup', changedTouch.clientX, changedTouch.clientY), wx, wy, toolCtx);
        // Touch pan inertia — only when panning, not drawing
        if (history.present.appState.activeTool === 'hand') {
          cancelAnimationFrame(inertiaRafId);
          const FRICTION = 0.90;
          const MIN_V = 0.05;
          const frameMs = 16;
          const applyInertia = (): void => {
            inertiaVX *= FRICTION;
            inertiaVY *= FRICTION;
            if (Math.abs(inertiaVX) < MIN_V && Math.abs(inertiaVY) < MIN_V) return;
            history.dispatch({ type: 'PAN_VIEWPORT', dx: inertiaVX * frameMs, dy: inertiaVY * frameMs });
            needsRender = true;
            inertiaRafId = requestAnimationFrame(applyInertia);
          };
          inertiaRafId = requestAnimationFrame(applyInertia);
        }
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

  // touchcancel fires when the OS interrupts a touch sequence (e.g. incoming
  // call, system gesture). Cancel any in-progress tool action so the tool
  // state doesn't get stuck with drawing=true and a dangling preview.
  canvas.addEventListener('touchcancel', () => {
    const activeTool = getActiveTool();
    if (activeTool.onCancel) {
      activeTool.onCancel(toolCtx);
    }
    touch1Id = -1;
    touch2Id = -1;
    needsRender = true;
  });

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
      // Pinch zoom (trackpad) or Ctrl+wheel (mouse)
      // deltaMode=0: trackpad pixel deltas (small) → fine sensitivity
      // deltaMode=1/2: mouse wheel lines/pages → coarser sensitivity
      const sensitivity = e.deltaMode === 0 ? 0.005 : 0.05;
      const rawFactor = Math.exp(-e.deltaY * sensitivity);
      // Hard cap: no single event jumps more than 2× in either direction
      const factor = Math.min(Math.max(rawFactor, 0.5), 2.0);
      history.dispatch({ type: 'ZOOM_VIEWPORT', factor, originX, originY });
    } else {
      // Scroll pan — normalize non-pixel deltas so mouse and trackpad feel consistent
      const scale = e.deltaMode === 0 ? 1 : 12;
      history.dispatch({ type: 'PAN_VIEWPORT', dx: -e.deltaX * scale, dy: -e.deltaY * scale });
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
  let prevActiveTool = history.present.appState.activeTool;
  let isHandlingToolChange = false;
  history.subscribe((scene) => {
    needsRender = true;
    const newActiveTool = scene.appState.activeTool;
    if (newActiveTool !== prevActiveTool) {
      if (!isHandlingToolChange) {
        isHandlingToolChange = true;
        const prev = prevActiveTool;
        prevActiveTool = newActiveTool;
        TOOLS[prev].onDeactivate?.(toolCtx);
        TOOLS[newActiveTool].onActivate?.(toolCtx);
        isHandlingToolChange = false;
      } else {
        // Re-entrant tool change during deactivation — just track it
        prevActiveTool = newActiveTool;
      }
    }
    canvas.style.cursor = TOOLS[newActiveTool].getCursor(0, 0, toolCtx);
  });

  // rAF render loop
  function loop(): void {
    // Keep rendering while eraser slash trail is fading out
    if ((TOOLS['eraser'] as EraserTool).pruneTrail()) needsRender = true;
    if (needsRender) {
      needsRender = false;
      renderFrame();
    }
    requestAnimationFrame(loop);
  }

  function renderFrame(): void {
    const editingId = (TOOLS.text as TextTool).editingId;
    render(ctx2d, history.present, canvas, editingId, editingShapeLabelId);

    // Draw preview element on top (in world transform)
    const activeTool = getActiveTool();
    const scene = history.present;

    // Draw text tool drag preview
    if (scene.appState.activeTool === 'text') {
      const textTool = TOOLS['text'] as TextTool;
      const preview = textTool.getPreview();
      if (preview) {
        ctx2d.save();
        const { viewport } = scene;
        const dpr = window.devicePixelRatio;
        ctx2d.setTransform(viewport.zoom * dpr, 0, 0, viewport.zoom * dpr, viewport.offsetX * dpr, viewport.offsetY * dpr);
        ctx2d.fillStyle = 'rgba(120,180,255,0.1)';
        ctx2d.strokeStyle = 'rgba(120,180,255,0.8)';
        ctx2d.lineWidth = 1.5 / viewport.zoom;
        ctx2d.setLineDash([6, 3]);
        ctx2d.fillRect(preview.x, preview.y, preview.width, preview.height);
        ctx2d.strokeRect(preview.x, preview.y, preview.width, preview.height);
        ctx2d.restore();
      }
    }

    if ('preview' in activeTool) {
      const preview = (activeTool as { preview: unknown }).preview;
      if (preview) {
        const previews = Array.isArray(preview) ? preview : [preview];
        ctx2d.save();
        const { viewport } = scene;
        const dpr = window.devicePixelRatio;
        ctx2d.setTransform(viewport.zoom * dpr, 0, 0, viewport.zoom * dpr, viewport.offsetX * dpr, viewport.offsetY * dpr);
        ctx2d.globalAlpha = 0.7;
        for (const el of previews) {
          drawElement(ctx2d, el as Parameters<typeof drawElement>[1], scene.elements);
        }
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

    // Draw hover highlight when using eraser tool
    const eraserTool = TOOLS['eraser'] as EraserTool;
    if (scene.appState.activeTool === 'eraser' && eraserTool.hoveredId) {
      const hoveredEl = scene.elements.find((el) => el.id === eraserTool.hoveredId);
      if (hoveredEl) drawHoverHighlight(ctx2d, hoveredEl, scene.viewport);
    }

    // Draw eraser slash trail
    if (eraserTool.slashTrail.length > 1) {
      drawSlashTrail(ctx2d, eraserTool.slashTrail, scene.viewport);
    }

    // Draw marquee if select tool is in marquee mode
    if (selectTool.marqueeActive) {
      const [x1, y1, x2, y2] = selectTool.getMarquee();
      drawMarquee(ctx2d, x1, y1, x2, y2);
    }

    // Draw alignment guides during element move
    if (selectTool.alignGuides.length > 0) {
      drawAlignGuides(ctx2d, selectTool.alignGuides, scene.viewport, canvas.width, canvas.height);
    }

    // Draw curve control point handle when a single curve element is selected
    if (scene.selectedIds.size === 1) {
      const selId = [...scene.selectedIds][0]!;
      const curveEl = scene.elements.find((el) => el.id === selId && el.type === 'curve');
      if (curveEl && curveEl.type === 'curve') {
        const dpr = window.devicePixelRatio;
        const [scx, scy] = worldToScreen(scene.viewport, curveEl.cx, curveEl.cy);
        const [sx1, sy1] = worldToScreen(scene.viewport, curveEl.x,  curveEl.y);
        const [sx2, sy2] = worldToScreen(scene.viewport, curveEl.x2, curveEl.y2);
        ctx2d.save();
        ctx2d.resetTransform();
        ctx2d.setLineDash([4, 3]);
        ctx2d.strokeStyle = 'rgba(100,160,255,0.5)';
        ctx2d.lineWidth = 1 * dpr;
        ctx2d.beginPath();
        ctx2d.moveTo(sx1 * dpr, sy1 * dpr);
        ctx2d.lineTo(scx * dpr, scy * dpr);
        ctx2d.lineTo(sx2 * dpr, sy2 * dpr);
        ctx2d.stroke();
        ctx2d.setLineDash([]);
        ctx2d.fillStyle = '#ffffff';
        ctx2d.strokeStyle = 'rgba(100,160,255,0.9)';
        ctx2d.lineWidth = 1.5 * dpr;
        ctx2d.beginPath();
        ctx2d.arc(scx * dpr, scy * dpr, 5 * dpr, 0, Math.PI * 2);
        ctx2d.fill();
        ctx2d.stroke();
        ctx2d.restore();
      }
    }
  }

  requestAnimationFrame(loop);

  // Wire sticky tool to open text editor immediately after placing
  stickyTool.onPlaced = (el, ctx) => {
    textTool.editExisting(el, ctx);
    needsRender = true;
  };

  return { selectTool: TOOLS['select'] as SelectTool };
}

function drawSlashTrail(
  ctx2d: CanvasRenderingContext2D,
  trail: SlashPoint[],
  viewport: { offsetX: number; offsetY: number; zoom: number },
): void {
  const now = Date.now();
  const dpr = window.devicePixelRatio;
  ctx2d.save();
  ctx2d.setTransform(viewport.zoom * dpr, 0, 0, viewport.zoom * dpr, viewport.offsetX * dpr, viewport.offsetY * dpr);
  ctx2d.lineCap = 'round';
  ctx2d.lineJoin = 'round';

  for (let i = 1; i < trail.length; i++) {
    const p0 = trail[i - 1]!;
    const p1 = trail[i]!;
    const age = now - p1.time;
    const t = Math.max(0, 1 - age / 350);
    if (t <= 0) continue;

    // Glow layer
    ctx2d.shadowBlur = 12 / viewport.zoom;
    ctx2d.shadowColor = `rgba(255,255,255,${t * 0.8})`;
    ctx2d.strokeStyle = `rgba(255,255,255,${t})`;
    ctx2d.lineWidth = (3 + t * 2) / viewport.zoom;
    ctx2d.beginPath();
    ctx2d.moveTo(p0.worldX, p0.worldY);
    ctx2d.lineTo(p1.worldX, p1.worldY);
    ctx2d.stroke();
  }
  ctx2d.restore();
}

// ── Shape label editor ─────────────────────────────────────────────────────────

function openShapeLabelEditor(
  el: RectangleElement | EllipseElement | RhombusElement,
  history: History,
  canvas: HTMLCanvasElement,
  onEditingChange: (id: string | null) => void,
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
  ta.spellcheck = true;
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

  onEditingChange(el.id);

  const doCommit = (): void => {
    onEditingChange(null);
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
      onEditingChange(null);
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

function isPointInArrowLabel(wx: number, wy: number, el: LineElement): boolean {
  if (!el.label) return false;
  const mx = (el.x + el.x2) / 2;
  const my = (el.y + el.y2) / 2;
  const fontSize = el.labelFontSize ?? 12;
  const lines = el.label.split('\n');
  const maxLen = Math.max(...lines.map((l) => l.length));
  const pad = fontSize * 0.8;
  const labelW = maxLen * fontSize * 0.6 + pad;
  const labelH = lines.length * fontSize * 1.2 + pad;
  return wx >= mx - labelW / 2 && wx <= mx + labelW / 2 &&
         wy >= my - labelH / 2 && wy <= my + labelH / 2;
}

function distPointToSegment(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
  const dx = x2 - x1, dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(px - x1, py - y1);
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lenSq));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

function openArrowLabelEditor(
  el: LineElement,
  history: History,
  canvas: HTMLCanvasElement,
  onEditingChange?: (id: string | null) => void,
): void {
  const { viewport, appState } = history.present;
  const mx = (el.x + el.x2) / 2;
  const my = (el.y + el.y2) / 2;
  const [screenX, screenY] = worldToScreen(viewport, mx, my);
  const canvasRect = canvas.getBoundingClientRect();

  const fontSize = el.labelFontSize ?? Math.min(appState.fontSize, 12);
  const fontFamily = el.labelFontFamily ?? appState.fontFamily;

  const ta = document.createElement('textarea');
  ta.spellcheck = true;
  ta.value = el.label ?? '';

  ta.style.position    = 'fixed';
  ta.style.left        = `${screenX + canvasRect.left - 80}px`;
  ta.style.top         = `${screenY + canvasRect.top - fontSize * viewport.zoom * 0.6}px`;
  ta.style.width       = '160px';
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
    onEditingChange?.(null);
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
      onEditingChange?.(null);
      ta.remove();
      return;
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      ta.removeEventListener('blur', doCommit);
      doCommit();
    }
  });

  onEditingChange?.(el.id);
  document.body.appendChild(ta);
  ta.focus();
  ta.select();
}
