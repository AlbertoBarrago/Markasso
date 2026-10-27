import type { ActiveTool } from '../core/app_state';
import { normalizeRect } from '../core/geometry';
import { screenToWorld, worldToScreen } from '../core/viewport';
import { cloneElementsWithOffset } from '../elements/clone';
import type {
  ConnectorAnchor,
  Element as DrawableElement,
  EllipseElement,
  LineElement,
  RectangleElement,
  RhombusElement,
  ShapeElement,
  StencilElement,
  TextElement,
} from '../elements/element';
import { onBundledPackLoad } from '../elements/stencils/packs';
import {
  DEFAULT_STENCIL_LABEL_FONT_SIZE,
  getStencilLabelWidth,
  STENCIL_LABEL_GAP,
} from '../elements/stencils/registry';
import type { History } from '../engine/history';
import { t } from '../i18n';
import {
  getRemoteCursors,
  sendLocalCursor,
  subscribeCursors,
} from '../io/presence';
import { distToRoute, getRoutePointAt } from '../rendering/connector_geometry';
import { getConnectorLabelBoxes } from '../rendering/connector_labels';
import { contrastColor, drawElement } from '../rendering/draw_element';
import {
  drawAlignGuides,
  drawHoverHighlight,
  drawMarquee,
  drawPortIndicators,
  drawSnapIndicator,
  resolveConnectorRoute,
} from '../rendering/draw_selection';
import { onImageLoad } from '../rendering/image_cache';
import { render } from '../rendering/renderer';
import {
  DEFAULT_SHAPE_LABEL_FONT_FAMILY,
  DEFAULT_SHAPE_LABEL_FONT_SIZE,
  getLabelWrapWidth,
  getShapeTextBox,
} from '../rendering/shape_geometry';
import { EllipseTool } from '../tools/ellipse_tool';
import { EraserTool, type SlashPoint } from '../tools/eraser_tool';
import { HandTool } from '../tools/hand_tool';
import { LineTool } from '../tools/line_tool';
import { PenTool } from '../tools/pen_tool';
import { RectangleTool } from '../tools/rectangle_tool';
import { RomboTool } from '../tools/rombo_tool';
import { SelectTool } from '../tools/select_tool';
import { ShapeTool } from '../tools/shape_tool';
import { StickyTool } from '../tools/sticky_tool';
import { TextTool } from '../tools/text_tool';
import type { Tool, ToolContext } from '../tools/tool';
import { toolAfterLabelEdit } from './label_edit_tool';

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
  shape: new ShapeTool(),
  freehand: new PenTool(),
  text: textTool,
  sticky: stickyTool,
};

export function initCanvasView(
  canvas: HTMLCanvasElement,
  history: History,
): { selectTool: SelectTool } {
  const ctx2d = canvas.getContext('2d')!;

  let isPanning = false;
  let panStartX = 0;
  let panStartY = 0;
  let needsRender = true;
  let editingShapeLabelId: string | null = null;
  let canvasDpr = window.devicePixelRatio;

  const toolCtx: ToolContext = {
    history,
    canvas,
    onPreviewUpdate: () => {
      needsRender = true;
    },
  };

  onImageLoad(() => {
    needsRender = true;
  });
  onBundledPackLoad(() => {
    needsRender = true;
  });

  function getActiveTool(): Tool {
    return TOOLS[history.present.appState.activeTool];
  }

  const SNAP_TOOLS = new Set([
    'rectangle',
    'ellipse',
    'rombo',
    'shape',
    'arrow',
    'line',
    'text',
  ]);

  function snapWorldCoords(wx: number, wy: number): [number, number] {
    const { appState } = history.present;
    if (!appState.gridVisible || !SNAP_TOOLS.has(appState.activeTool))
      return [wx, wy];
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
    canvasDpr = window.devicePixelRatio;
    canvas.width = Math.max(1, Math.round(canvas.clientWidth * canvasDpr));
    canvas.height = Math.max(1, Math.round(canvas.clientHeight * canvasDpr));
    needsRender = true;
  }

  function ensureCanvasBuffer(): void {
    const dpr = window.devicePixelRatio;
    const width = Math.max(1, Math.round(canvas.clientWidth * dpr));
    const height = Math.max(1, Math.round(canvas.clientHeight * dpr));
    if (dpr === canvasDpr && canvas.width === width && canvas.height === height)
      return;
    canvasDpr = dpr;
    canvas.width = width;
    canvas.height = height;
    needsRender = true;
  }

  // Resize observer
  const ro = new ResizeObserver(resizeCanvas);
  ro.observe(canvas);
  resizeCanvas();

  /**
   * Commits an open label editor before a canvas press is handled. The
   * editor would only close on blur, which fires after the press reached
   * the temporary text tool (creating stray text); touch presses don't blur
   * it at all since touchstart prevents the default.
   */
  function closeLabelEditor(): void {
    if (editingShapeLabelId === null) return;
    (document.activeElement as HTMLElement | null)?.blur();
  }

  // Event listeners
  canvas.addEventListener('mousedown', (e) => {
    closeLabelEditor();
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
    sendLocalCursor(wx, wy);
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
        const x = el.x,
          y = el.y,
          w = el.width,
          h = el.height;
        if (wx >= x - 4 && wx <= x + w + 4 && wy >= y - 4 && wy <= y + h + 4) {
          (TOOLS.text as TextTool).editExisting(el as TextElement, toolCtx);
          needsRender = true;
          return;
        }
      }

      if (
        el.type === 'rectangle' ||
        el.type === 'ellipse' ||
        el.type === 'rhombus' ||
        el.type === 'shape' ||
        el.type === 'stencil'
      ) {
        const { x: bx, y: by, w: bw, h: bh } = normalizeRect(el);
        if (
          wx >= bx - 4 &&
          wx <= bx + bw + 4 &&
          wy >= by - 4 &&
          wy <= by + bh + 4
        ) {
          const previousTool = history.present.appState.activeTool;
          history.dispatch({ type: 'SELECT_ELEMENTS', ids: [el.id] });
          history.dispatch({
            type: 'SET_TOOL',
            tool: 'text',
            keepSelection: true,
          });
          openShapeLabelEditor(el, history, canvas, previousTool, (id) => {
            editingShapeLabelId = id;
            needsRender = true;
          });
          needsRender = true;
          return;
        }
      }

      if (el.type === 'arrow' || el.type === 'line') {
        const line = el as LineElement;
        const route =
          line.routing === 'elbow'
            ? resolveConnectorRoute(line, scene.elements)
            : null;
        const hitLabel = isPointInArrowLabel(wx, wy, line, scene.elements);
        const hitShaft =
          (route
            ? distToRoute(wx, wy, route)
            : distPointToSegment(wx, wy, line.x, line.y, line.x2, line.y2)) <
          line.strokeWidth / 2 + 8;
        if (hitLabel || hitShaft) {
          const previousTool = history.present.appState.activeTool;
          history.dispatch({ type: 'SELECT_ELEMENTS', ids: [line.id] });
          history.dispatch({
            type: 'SET_TOOL',
            tool: 'text',
            keepSelection: true,
          });
          openArrowLabelEditor(line, history, canvas, previousTool, (id) => {
            editingShapeLabelId = id;
            needsRender = true;
          });
          needsRender = true;
          return;
        }
      }
    }
  });

  // ── Touch support ──────────────────────────────────────────────────────────
  let touch1Id = -1,
    touch2Id = -1;
  let _lastTouchX = 0,
    _lastTouchY = 0;
  let lastPinchDist = 0,
    lastPinchMidX = 0,
    lastPinchMidY = 0;
  let lastTapTime = 0,
    lastTapX = 0,
    lastTapY = 0;

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

    const actions: Array<{ label: string; icon: string; action: () => void }> =
      [
        {
          label: t('duplicate'),
          icon: `<svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="7" y="7" width="9" height="9" rx="1.5"/><path d="M13 7V5.5A1.5 1.5 0 0 0 11.5 4h-7A1.5 1.5 0 0 0 3 5.5v7A1.5 1.5 0 0 0 4.5 14H7"/></svg>`,
          action: () => {
            const sc = history.present;
            const elements = [...sc.selectedIds]
              .map((id) => sc.elements.find((e) => e.id === id))
              .filter(
                (el): el is (typeof sc.elements)[number] => el !== undefined,
              );
            const newElements = cloneElementsWithOffset(elements, 20, 20);
            if (newElements.length > 0)
              history.dispatch({
                type: 'CREATE_ELEMENTS',
                elements: newElements,
              });
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
            if (ids.length > 0)
              history.dispatch({ type: 'DELETE_ELEMENTS', ids });
            closeCtxMenu();
          },
        },
      ];

    for (const item of actions) {
      const btn = document.createElement('button');
      btn.className = 'touch-ctx-menu-item';
      btn.setAttribute('role', 'menuitem');
      btn.innerHTML = `${item.icon}<span>${item.label}</span>`;
      btn.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        item.action();
      });
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
  document.addEventListener(
    'pointerdown',
    (e) => {
      if (
        ctxMenu.style.display !== 'none' &&
        !ctxMenu.contains(e.target as Node)
      ) {
        closeCtxMenu();
      }
    },
    true,
  );

  function getWorldCoordsFromTouch(touch: Touch): [number, number] {
    const rect = canvas.getBoundingClientRect();
    return snapWorldCoords(
      ...screenToWorld(
        history.present.viewport,
        touch.clientX - rect.left,
        touch.clientY - rect.top,
      ),
    );
  }

  function syntheticMouse(
    type: string,
    clientX: number,
    clientY: number,
  ): MouseEvent {
    return new MouseEvent(type, { clientX, clientY, bubbles: false });
  }

  function getTouchById(list: TouchList, id: number): Touch | null {
    for (let i = 0; i < list.length; i++)
      if (list.item(i)!.identifier === id) return list.item(i)!;
    return null;
  }

  function preventIfCancelable(e: Event): void {
    if (e.cancelable) e.preventDefault();
  }

  canvas.addEventListener(
    'touchstart',
    (e) => {
      preventIfCancelable(e);
      closeLabelEditor();
      cancelAnimationFrame(inertiaRafId);
      if (e.touches.length === 1) {
        const t = e.touches.item(0)!;
        touch1Id = t.identifier;
        touch2Id = -1;
        _lastTouchX = t.clientX;
        _lastTouchY = t.clientY;
        const [wx, wy] = getWorldCoordsFromTouch(t);
        getActiveTool().onMouseDown(
          syntheticMouse('mousedown', t.clientX, t.clientY),
          wx,
          wy,
          toolCtx,
        );
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
        // A second finger is almost always pinch-to-zoom, not an intentional
        // stroke end, so never synthesize mouseup here.
        const activeTool = getActiveTool();
        if (touch1Id !== -1) {
          activeTool.onCancel?.(toolCtx);
          needsRender = true;
        }
        const t1 = e.touches.item(0)!;
        const t2 = e.touches.item(1)!;
        touch1Id = t1.identifier;
        touch2Id = t2.identifier;
        lastPinchDist = Math.hypot(
          t2.clientX - t1.clientX,
          t2.clientY - t1.clientY,
        );
        lastPinchMidX = (t1.clientX + t2.clientX) / 2;
        lastPinchMidY = (t1.clientY + t2.clientY) / 2;
        needsRender = true;
      }
    },
    { passive: false },
  );

  canvas.addEventListener(
    'touchmove',
    (e) => {
      preventIfCancelable(e);
      if (touch2Id === -1) {
        // Single-finger: dispatch move to active tool
        const t = getTouchById(e.touches, touch1Id);
        if (!t) return;
        _lastTouchX = t.clientX;
        _lastTouchY = t.clientY;
        // Cancel long-press if finger moved too far
        if (
          !longPressMoved &&
          Math.hypot(
            t.clientX - longPressClientX,
            t.clientY - longPressClientY,
          ) > LONG_PRESS_MOVE_TOL
        ) {
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
        sendLocalCursor(wx, wy);
        getActiveTool().onMouseMove(
          syntheticMouse('mousemove', t.clientX, t.clientY),
          wx,
          wy,
          toolCtx,
        );
        needsRender = true;
      } else {
        // Two-finger: pan + pinch-zoom
        const t1 = getTouchById(e.touches, touch1Id);
        const t2 = getTouchById(e.touches, touch2Id);
        if (!t1 || !t2) return;
        const midX = (t1.clientX + t2.clientX) / 2;
        const midY = (t1.clientY + t2.clientY) / 2;
        const dist = Math.hypot(
          t2.clientX - t1.clientX,
          t2.clientY - t1.clientY,
        );
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
          history.dispatch({
            type: 'ZOOM_VIEWPORT',
            factor,
            originX: midX - rect.left,
            originY: midY - rect.top,
          });
        }
        lastPinchDist = dist;
        lastPinchMidX = midX;
        lastPinchMidY = midY;
        needsRender = true;
      }
    },
    { passive: false },
  );

  canvas.addEventListener(
    'touchend',
    (e) => {
      preventIfCancelable(e);
      clearTimeout(longPressTimer);
      if (touch2Id === -1) {
        // Single-finger end
        const changedTouch = e.changedTouches[0];
        if (changedTouch) {
          const [wx, wy] = getWorldCoordsFromTouch(changedTouch);
          getActiveTool().onMouseUp(
            syntheticMouse(
              'mouseup',
              changedTouch.clientX,
              changedTouch.clientY,
            ),
            wx,
            wy,
            toolCtx,
          );
          // Touch pan inertia — only when panning, not drawing
          if (history.present.appState.activeTool === 'hand') {
            cancelAnimationFrame(inertiaRafId);
            const FRICTION = 0.9;
            const MIN_V = 0.05;
            const frameMs = 16;
            const applyInertia = (): void => {
              inertiaVX *= FRICTION;
              inertiaVY *= FRICTION;
              if (Math.abs(inertiaVX) < MIN_V && Math.abs(inertiaVY) < MIN_V)
                return;
              history.dispatch({
                type: 'PAN_VIEWPORT',
                dx: inertiaVX * frameMs,
                dy: inertiaVY * frameMs,
              });
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
            canvas.dispatchEvent(
              new MouseEvent('dblclick', {
                clientX: changedTouch.clientX,
                clientY: changedTouch.clientY,
                bubbles: true,
              }),
            );
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
          _lastTouchX = remaining.clientX;
          _lastTouchY = remaining.clientY;
        } else {
          touch1Id = -1;
        }
      }
      needsRender = true;
    },
    { passive: false },
  );

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

  canvas.addEventListener(
    'wheel',
    (e) => {
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
        history.dispatch({
          type: 'PAN_VIEWPORT',
          dx: -e.deltaX * scale,
          dy: -e.deltaY * scale,
        });
      }
      needsRender = true;
    },
    { passive: false },
  );

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
    ensureCanvasBuffer();
    // Keep rendering while eraser slash trail is fading out
    if ((TOOLS.eraser as EraserTool).pruneTrail()) needsRender = true;
    if (needsRender) {
      needsRender = false;
      renderFrame();
      drawRemoteCursors();
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
      const textTool = TOOLS.text as TextTool;
      const preview = textTool.getPreview();
      if (preview) {
        ctx2d.save();
        const { viewport } = scene;
        const dpr = window.devicePixelRatio;
        ctx2d.setTransform(
          viewport.zoom * dpr,
          0,
          0,
          viewport.zoom * dpr,
          viewport.offsetX * dpr,
          viewport.offsetY * dpr,
        );
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
        ctx2d.setTransform(
          viewport.zoom * dpr,
          0,
          0,
          viewport.zoom * dpr,
          viewport.offsetX * dpr,
          viewport.offsetY * dpr,
        );
        ctx2d.globalAlpha = 0.7;
        for (const el of previews) {
          drawElement(
            ctx2d,
            el as Parameters<typeof drawElement>[1],
            scene.elements,
          );
        }
        ctx2d.restore();
      }
    }

    // Draw snap indicators (arrow/line tool and select tool endpoint drag)
    const selectTool = TOOLS.select as SelectTool;
    if ('snapIndicator' in activeTool) {
      const indicator = (
        activeTool as {
          snapIndicator: { worldX: number; worldY: number } | null;
        }
      ).snapIndicator;
      if (indicator) {
        drawSnapIndicator(
          ctx2d,
          indicator.worldX,
          indicator.worldY,
          scene.viewport,
        );
      }
    }
    if (selectTool.endpointSnapIndicator) {
      drawSnapIndicator(
        ctx2d,
        selectTool.endpointSnapIndicator.worldX,
        selectTool.endpointSnapIndicator.worldY,
        scene.viewport,
      );
    }
    if (selectTool.endpointSnapElementId) {
      const snapEl = scene.elements.find(
        (el) => el.id === selectTool.endpointSnapElementId,
      );
      if (snapEl) {
        drawHoverHighlight(ctx2d, snapEl, scene.viewport, scene.elements);
        drawPortIndicators(
          ctx2d,
          snapEl,
          scene.viewport,
          selectTool.endpointSnapAnchor ?? undefined,
        );
      }
    }

    // Draw hover highlight when using select tool (unselected elements only)
    if (scene.appState.activeTool === 'select' && selectTool.hoveredId) {
      const hoveredEl = scene.elements.find(
        (el) => el.id === selectTool.hoveredId && !scene.selectedIds.has(el.id),
      );
      if (hoveredEl)
        drawHoverHighlight(ctx2d, hoveredEl, scene.viewport, scene.elements);
    }

    // Draw hover highlight for arrow/line tool snap target (magnetic connection point)
    if ('snapElementId' in activeTool) {
      const { snapElementId: snapElId, snapAnchor } = activeTool as {
        snapElementId: string | null;
        snapAnchor?: ConnectorAnchor | null;
      };
      if (snapElId) {
        const snapEl = scene.elements.find((el) => el.id === snapElId);
        if (snapEl) {
          drawHoverHighlight(ctx2d, snapEl, scene.viewport, scene.elements);
          drawPortIndicators(
            ctx2d,
            snapEl,
            scene.viewport,
            snapAnchor ?? undefined,
          );
        }
      }
    }

    // Draw hover highlight when using eraser tool
    const eraserTool = TOOLS.eraser as EraserTool;
    if (scene.appState.activeTool === 'eraser' && eraserTool.hoveredId) {
      const hoveredEl = scene.elements.find(
        (el) => el.id === eraserTool.hoveredId,
      );
      if (hoveredEl)
        drawHoverHighlight(ctx2d, hoveredEl, scene.viewport, scene.elements);
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
      drawAlignGuides(
        ctx2d,
        selectTool.alignGuides,
        scene.viewport,
        canvas.width,
        canvas.height,
      );
    }

    // Draw curve control point handle when a single curve element is selected
    if (scene.selectedIds.size === 1) {
      const selId = [...scene.selectedIds][0]!;
      const curveEl = scene.elements.find(
        (el) => el.id === selId && el.type === 'curve',
      );
      if (curveEl && curveEl.type === 'curve') {
        const dpr = window.devicePixelRatio;
        const [scx, scy] = worldToScreen(
          scene.viewport,
          curveEl.cx,
          curveEl.cy,
        );
        const [sx1, sy1] = worldToScreen(scene.viewport, curveEl.x, curveEl.y);
        const [sx2, sy2] = worldToScreen(
          scene.viewport,
          curveEl.x2,
          curveEl.y2,
        );
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

  /** Draw other peers' cursors + name tags on top of the frame (screen px). */
  function drawRemoteCursors(): void {
    const cursors = getRemoteCursors();
    if (cursors.length === 0) return;
    const scene = history.present;
    const dpr = window.devicePixelRatio;
    ctx2d.save();
    ctx2d.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx2d.lineCap = 'round';
    ctx2d.lineJoin = 'round';
    for (const c of cursors) {
      const [sx, sy] = worldToScreen(scene.viewport, c.x, c.y);
      const s = 13;
      ctx2d.beginPath();
      ctx2d.moveTo(sx, sy);
      ctx2d.lineTo(sx + s, sy);
      ctx2d.lineTo(sx + s * 0.35, sy + s * 0.55);
      ctx2d.closePath();
      ctx2d.fillStyle = c.color;
      ctx2d.fill();
      ctx2d.strokeStyle = 'rgba(0,0,0,0.6)';
      ctx2d.lineWidth = 1;
      ctx2d.stroke();
      const label = c.name;
      ctx2d.font = '500 11px "Roboto Mono", monospace';
      const labelW = ctx2d.measureText(label).width;
      const pad = 4;
      ctx2d.fillStyle = 'rgba(0,0,0,0.6)';
      ctx2d.fillRect(sx + s * 0.2, sy + s * 0.1, labelW + pad * 2, 16);
      ctx2d.fillStyle = '#fff';
      ctx2d.fillText(label, sx + s * 0.2 + pad, sy + s * 0.1 + 12);
    }
    ctx2d.restore();
  }

  requestAnimationFrame(loop);

  // Re-render when remote cursors move (or appear/disappear).
  subscribeCursors(() => {
    needsRender = true;
  });

  // Wire sticky tool to open text editor immediately after placing
  stickyTool.onPlaced = (el, ctx) => {
    textTool.editExisting(el, ctx);
    needsRender = true;
  };

  return { selectTool: TOOLS.select as SelectTool };
}

function drawSlashTrail(
  ctx2d: CanvasRenderingContext2D,
  trail: SlashPoint[],
  viewport: { offsetX: number; offsetY: number; zoom: number },
): void {
  const now = Date.now();
  const dpr = window.devicePixelRatio;
  ctx2d.save();
  ctx2d.setTransform(
    viewport.zoom * dpr,
    0,
    0,
    viewport.zoom * dpr,
    viewport.offsetX * dpr,
    viewport.offsetY * dpr,
  );
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

/** Brings back the tool that was active before a label editor opened. */
function restoreToolAfterLabelEdit(
  history: History,
  previousTool: ActiveTool,
): void {
  const tool = toolAfterLabelEdit(
    previousTool,
    history.present.appState.activeTool,
  );
  if (tool) history.dispatch({ type: 'SET_TOOL', tool, keepSelection: true });
}

/**
 * Text color while editing a label, matching how it is drawn: inside the
 * fill (contrast with it) for shapes, below the icon (stroke color) for
 * stencils.
 */
function labelEditorColor(
  el:
    | RectangleElement
    | EllipseElement
    | RhombusElement
    | ShapeElement
    | StencilElement,
): string {
  if (el.labelColor) return el.labelColor;
  return el.type === 'stencil'
    ? el.strokeColor
    : contrastColor(el.fillColor, el.strokeColor);
}

function openShapeLabelEditor(
  el:
    | RectangleElement
    | EllipseElement
    | RhombusElement
    | ShapeElement
    | StencilElement,
  history: History,
  canvas: HTMLCanvasElement,
  previousTool: ActiveTool,
  onEditingChange: (id: string | null) => void,
): void {
  const { viewport, appState } = history.present;
  const { x: bx, y: by, w: bw, h: bh } = normalizeRect(el);
  // Flowchart shapes lay their label out in a dedicated text box; stencil
  // labels hang below the icon.
  const stencilLabelW = getStencilLabelWidth(bw);
  const textBox =
    el.type === 'shape'
      ? getShapeTextBox(el.kind, bw, bh)
      : el.type === 'stencil'
        ? {
            x: (bw - stencilLabelW) / 2,
            y: bh + STENCIL_LABEL_GAP,
            w: stencilLabelW,
            h: (el.labelFontSize ?? DEFAULT_STENCIL_LABEL_FONT_SIZE) * 1.2,
          }
        : { x: 0, y: 0, w: bw, h: bh };
  const cx = bx + textBox.x + textBox.w / 2;
  const cy = by + textBox.y + textBox.h / 2;

  const [screenCX, screenCY] = worldToScreen(viewport, cx, cy);
  const canvasRect = canvas.getBoundingClientRect();

  // An existing label without its own font is drawn with the renderer's
  // defaults, so the editor uses them too; only a new label takes the font
  // currently picked in the app.
  const hasLabel = Boolean(el.label);
  const fontSize =
    el.labelFontSize ??
    (el.type === 'stencil'
      ? DEFAULT_STENCIL_LABEL_FONT_SIZE
      : hasLabel
        ? DEFAULT_SHAPE_LABEL_FONT_SIZE
        : appState.fontSize);
  const fontFamily =
    el.labelFontFamily ??
    (hasLabel ? DEFAULT_SHAPE_LABEL_FONT_FAMILY : appState.fontFamily);
  // Same wrap width as the renderer, so the label breaks where it will be drawn.
  const editorW =
    (el.type === 'stencil' ? textBox.w : getLabelWrapWidth(el, bw, bh)) *
    viewport.zoom;

  const ta = document.createElement('textarea');
  ta.spellcheck = true;
  ta.value = el.label ?? '';

  ta.style.position = 'fixed';
  ta.style.left = `${screenCX + canvasRect.left - editorW / 2}px`;
  ta.style.top = `${screenCY + canvasRect.top - fontSize * viewport.zoom * 0.6}px`;
  ta.style.width = `${editorW}px`;
  ta.style.minHeight = `${fontSize * viewport.zoom * 1.2}px`;
  ta.style.font = `${fontSize * viewport.zoom}px ${fontFamily}`;
  ta.style.color = labelEditorColor(el);
  ta.style.caretColor = 'var(--accent, #7c63d4)';
  ta.style.textAlign = 'center';
  ta.style.lineHeight = '1.2';
  ta.style.padding = '0';
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

  const grow = (): void => {
    ta.style.height = '0';
    ta.style.height = `${ta.scrollHeight}px`;
  };
  ta.addEventListener('input', grow);
  grow();

  onEditingChange(el.id);
  const unsubscribe = history.subscribe((scene) => {
    const latest = scene.elements.find((item) => item.id === el.id);
    if (
      latest?.type === 'rectangle' ||
      latest?.type === 'ellipse' ||
      latest?.type === 'rhombus' ||
      latest?.type === 'shape' ||
      latest?.type === 'stencil'
    ) {
      ta.style.color = labelEditorColor(latest);
    }
  });

  const doCommit = (): void => {
    unsubscribe();
    onEditingChange(null);
    const content = ta.value.trim();
    ta.remove();
    if (content !== (el.label ?? '')) {
      history.dispatch({
        type: 'SET_SHAPE_LABEL',
        id: el.id,
        label: content,
        labelFontSize: fontSize,
        labelFontFamily: fontFamily,
      });
    }
    restoreToolAfterLabelEdit(history, previousTool);
  };

  ta.addEventListener('blur', doCommit, { once: true });

  ta.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      e.preventDefault();
      ta.removeEventListener('blur', doCommit);
      doCommit();
    }
    // Enter inserts newline (default textarea behavior)
  });

  document.body.appendChild(ta);
  ta.focus();
  ta.select();
}

/**
 * Where a connector label sits: the spot the renderer placed it on, or the
 * middle of the drawn route for a connector that has no label yet.
 */
function connectorLabelCenter(
  el: LineElement,
  allElements: ReadonlyArray<DrawableElement>,
): [number, number] {
  const box = getConnectorLabelBoxes(allElements).get(el.id);
  if (box) return [box.x, box.y];
  const [x, y] = getRoutePointAt(resolveConnectorRoute(el, allElements), 0.5);
  return [x, y];
}

/** True when the point falls on the connector's drawn label box. */
function isPointInArrowLabel(
  wx: number,
  wy: number,
  el: LineElement,
  allElements: ReadonlyArray<DrawableElement>,
): boolean {
  const box = el.label ? getConnectorLabelBoxes(allElements).get(el.id) : null;
  return (
    !!box &&
    Math.abs(wx - box.x) <= box.w / 2 &&
    Math.abs(wy - box.y) <= box.h / 2
  );
}

function distPointToSegment(
  px: number,
  py: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): number {
  const dx = x2 - x1,
    dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(px - x1, py - y1);
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lenSq));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

function openArrowLabelEditor(
  el: LineElement,
  history: History,
  canvas: HTMLCanvasElement,
  previousTool: ActiveTool,
  onEditingChange?: (id: string | null) => void,
): void {
  const { viewport, appState, elements } = history.present;
  const [mx, my] = connectorLabelCenter(el, elements);
  const [screenX, screenY] = worldToScreen(viewport, mx, my);
  const canvasRect = canvas.getBoundingClientRect();

  const fontSize = el.labelFontSize ?? Math.min(appState.fontSize, 12);
  const fontFamily = el.labelFontFamily ?? appState.fontFamily;

  const ta = document.createElement('textarea');
  ta.spellcheck = true;
  ta.value = el.label ?? '';

  ta.style.position = 'fixed';
  ta.style.left = `${screenX + canvasRect.left - 80}px`;
  ta.style.top = `${screenY + canvasRect.top - fontSize * viewport.zoom * 0.6}px`;
  ta.style.width = '160px';
  ta.style.minHeight = `${fontSize * viewport.zoom * 1.2}px`;
  ta.style.font = `${fontSize * viewport.zoom}px ${fontFamily}`;
  ta.style.color = el.labelColor ?? el.strokeColor;
  ta.style.caretColor = 'var(--accent, #7c63d4)';
  ta.style.textAlign = 'center';
  ta.style.lineHeight = '1.2';
  ta.style.padding = '0';
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

  const grow = (): void => {
    ta.style.height = '0';
    ta.style.height = `${ta.scrollHeight}px`;
  };
  ta.addEventListener('input', grow);
  grow();

  const unsubscribe = history.subscribe((scene) => {
    const latest = scene.elements.find((item) => item.id === el.id);
    if (latest?.type === 'line' || latest?.type === 'arrow') {
      ta.style.color = latest.labelColor ?? latest.strokeColor;
    }
  });

  const doCommit = (): void => {
    unsubscribe();
    onEditingChange?.(null);
    const content = ta.value.trim();
    ta.remove();
    if (content !== (el.label ?? '')) {
      history.dispatch({
        type: 'SET_SHAPE_LABEL',
        id: el.id,
        label: content,
        labelFontSize: fontSize,
        labelFontFamily: fontFamily,
      });
    }
    restoreToolAfterLabelEdit(history, previousTool);
  };

  ta.addEventListener('blur', doCommit, { once: true });

  ta.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      ta.removeEventListener('blur', doCommit);
      unsubscribe();
      onEditingChange?.(null);
      ta.remove();
      restoreToolAfterLabelEdit(history, previousTool);
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
