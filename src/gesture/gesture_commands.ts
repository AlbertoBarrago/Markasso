import { screenToWorld } from '../core/viewport';
import type {
  Element,
  FreehandElement,
  LineElement,
} from '../elements/element';
import type { History } from '../engine/history';
import {
  getElementBounds,
  getElementCenter,
  getRotationHandleScreen,
  getSelectionHandles,
  type HandlePosition,
  hitTestHandle,
  ROTATION_HANDLE_R,
} from '../rendering/draw_selection';
import { anchorX, anchorY, computeResize, hitTest } from '../tools/select_tool';
import { gestureHover } from './gesture_hover';
import { distance } from './landmark_geometry';
import { classifyStroke, type StrokeShape } from './stroke_classifier';
import type { GestureEvent, GesturePoint } from './types';

// Hand tracking is far less precise than a mouse pointer, so gesture hit-testing
// gets extra screen-space tolerance beyond the mouse SelectTool's defaults.
const GESTURE_HIT_PAD_PX = 16;
const GESTURE_REGRAB_PAD_PX = 40;
const CP_GRAB_RADIUS_PX = 32;
// The rotation handle sits ROTATION_HANDLE_OFFSET (34px) above the shape
// with nothing else nearby to confuse it with, so it can afford a bigger
// tolerance than the default hit pad — but capped below that 34px offset so
// a very large hand-scale reading can't extend the hit zone down into the
// shape's own top edge and steal resize/move pinches.
const ROTATION_GRAB_PAD_PX = 26;

// Deleting is a double-pinch (tap-tap) gesture rather than a pose hold or a
// swipe: pinching the same element twice in quick succession without
// dragging it deletes it immediately. Pinch is by far the most reliably
// tracked pose in the system (already driving select/drag/resize/rotate),
// so this avoids the tracking problems a closed fist or a fast swipe had.
const DOUBLE_TAP_MS = 500;
const TAP_MOVE_THRESHOLD_PX = 10;

// Typical wrist-to-middle-MCP distance (normalized image space) for a hand at
// a comfortable distance from the camera — the baseline the padding above was
// tuned against. A smaller palmScale (small hand, or hand farther from the
// camera) means the same absolute landmark jitter maps to a larger fraction
// of the hand, so hit tolerances scale up to compensate.
const REFERENCE_PALM_SCALE = 0.18;
const HAND_SCALE_MIN = 0.75;
const HAND_SCALE_MAX = 2.5;

// Element types resized via their own dedicated control-point drag rather
// than a generic bounding-box corner (line/arrow endpoints & curve handles).
const NON_CORNER_RESIZE_TYPES = new Set(['line', 'arrow']);

export class GestureCommandAdapter {
  private draggedId: string | null = null;
  private lastWorldPoint: GesturePoint | null = null;
  private cpElId: string | null = null;
  private cpDragOffset: GesturePoint | null = null;
  private resizeElId: string | null = null;
  private resizeHandle: HandlePosition | null = null;
  private resizeOrigEl: Element | null = null;
  private resizeOrigBounds: {
    x: number;
    y: number;
    w: number;
    h: number;
  } | null = null;
  private resizeAnchorX = 0;
  private resizeAnchorY = 0;
  private rotateElId: string | null = null;
  private rotateCenter: readonly [number, number] = [0, 0];
  private rotateInitialAngle = 0;
  private rotateInitialRotation = 0;
  private handScale = 1;
  private tapOriginWorld: GesturePoint | null = null;
  private pinchMoved = false;
  private lastTapElId: string | null = null;
  private lastTapAt = 0;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly history: History,
  ) {}

  /** Adjusts hit-test tolerances to the current hand's apparent size, so a smaller/farther hand doesn't feel less forgiving than a larger/closer one. */
  setHandScale(palmScale: number | null): void {
    this.handScale =
      palmScale === null
        ? 1
        : clamp(
            REFERENCE_PALM_SCALE / palmScale,
            HAND_SCALE_MIN,
            HAND_SCALE_MAX,
          );
  }

  private get hitPad(): number {
    return GESTURE_HIT_PAD_PX * this.handScale;
  }

  private get regrabPad(): number {
    return GESTURE_REGRAB_PAD_PX * this.handScale;
  }

  handle(event: GestureEvent): GestureCommandOutcome | null {
    switch (event.type) {
      case 'pinch-start':
        return this.startPinch(event.point, event.timestamp);
      case 'pinch-move':
        this.movePinch(event.point);
        return null;
      case 'pinch-end':
        this.endPinch(event.timestamp);
        return null;
      case 'stroke-end':
        return this.createStroke(event.points);
      case 'select-all':
        return this.selectAll();
      case 'stroke-start':
      case 'stroke-move':
        return null;
    }
  }

  private selectAll(): GestureCommandOutcome | null {
    const scene = this.history.present;
    const ids = scene.elements.filter((el) => !el.locked).map((el) => el.id);
    if (ids.length === 0) return null;
    this.history.dispatch({ type: 'SELECT_ELEMENTS', ids });
    return { type: 'selected-all' };
  }

  /** Updates the hover highlight while the hand rests open over the canvas without pinching. */
  updateHover(point: GesturePoint | null): void {
    if (!point || this.draggedId || this.cpElId) return;
    const world = this.toWorld(point);
    const scene = this.history.present;
    const hit = hitTest(
      scene.elements,
      world.x,
      world.y,
      scene.viewport,
      this.hitPad,
    );
    gestureHover.id = hit && !hit.locked ? hit.id : null;
  }

  dispose(): void {
    this.endPinch(0);
    gestureHover.id = null;
  }

  private startPinch(
    point: GesturePoint,
    timestamp: number,
  ): GestureCommandOutcome | null {
    gestureHover.id = null;
    this.pinchMoved = false;
    this.tapOriginWorld = null;
    const world = this.toWorld(point);
    const scene = this.history.present;

    // A double-tap-delete takes priority over any handle grab — otherwise
    // tapping a small selected element near one of its resize/rotation
    // handles (very plausible given how generous their tolerances are)
    // would grab that handle instead of ever registering as a delete.
    if (this.lastTapElId && timestamp - this.lastTapAt <= DOUBLE_TAP_MS) {
      const tapHit = hitTest(
        scene.elements,
        world.x,
        world.y,
        scene.viewport,
        this.hitPad,
      );
      if (tapHit && tapHit.id === this.lastTapElId) {
        this.lastTapElId = null;
        this.history.dispatch({ type: 'DELETE_ELEMENTS', ids: [tapHit.id] });
        gestureHover.id = null;
        return { type: 'deleted' };
      }
    }

    const selected = scene.elements.filter((el) =>
      scene.selectedIds.has(el.id),
    );
    if (selected.length === 1 && selected[0]!.type === 'line') {
      const line = selected[0]! as LineElement;
      const cpX = line.cx ?? (line.x + line.x2) / 2;
      const cpY = line.cy ?? (line.y + line.y2) / 2;
      const cpRadius = CP_GRAB_RADIUS_PX / scene.viewport.zoom;
      if (distance({ x: cpX, y: cpY }, world) <= cpRadius) {
        this.cpElId = line.id;
        this.cpDragOffset = { x: world.x - cpX, y: world.y - cpY };
        this.history.beginDrag();
        return null;
      }
    }

    if (selected.length === 1 && !selected[0]!.locked) {
      const el = selected[0]!;
      const screen = this.toScreen(point);
      const rotHandle = getRotationHandleScreen(
        [el],
        scene.viewport,
        scene.elements,
      );
      if (
        rotHandle &&
        Math.hypot(
          screen.x - rotHandle.screenX,
          screen.y - rotHandle.screenY,
        ) <=
          ROTATION_HANDLE_R + ROTATION_GRAB_PAD_PX * this.handScale
      ) {
        this.rotateElId = el.id;
        this.rotateCenter = getElementCenter(el);
        this.rotateInitialAngle = Math.atan2(
          world.y - this.rotateCenter[1],
          world.x - this.rotateCenter[0],
        );
        this.rotateInitialRotation = el.rotation ?? 0;
        this.history.beginDrag();
        return null;
      }
    }

    if (
      selected.length === 1 &&
      !selected[0]!.locked &&
      !NON_CORNER_RESIZE_TYPES.has(selected[0]!.type)
    ) {
      const el = selected[0]!;
      const screen = this.toScreen(point);
      const handles = getSelectionHandles([el], scene.viewport);
      const handle = hitTestHandle(handles, screen.x, screen.y, this.hitPad);
      if (handle) {
        this.resizeElId = el.id;
        this.resizeHandle = handle;
        this.resizeOrigEl = el;
        const bounds = getElementBounds(el);
        this.resizeOrigBounds = bounds;
        this.resizeAnchorX = anchorX(handle, bounds);
        this.resizeAnchorY = anchorY(handle, bounds);
        this.history.beginDrag();
        return null;
      }
    }

    let hit = hitTest(
      scene.elements,
      world.x,
      world.y,
      scene.viewport,
      this.hitPad,
    );
    // A pinch that misses the normal hit test but still lands near the
    // already-selected element is very likely an imprecise re-grab attempt,
    // not a request to deselect — hand tracking jitter makes exact re-hits hard.
    if ((!hit || hit.locked) && selected.length === 1) {
      hit = hitTest(selected, world.x, world.y, scene.viewport, this.regrabPad);
    }
    if (!hit || hit.locked) {
      this.history.dispatch({ type: 'CLEAR_SELECTION' });
      return null;
    }
    this.history.dispatch({ type: 'SELECT_ELEMENTS', ids: [hit.id] });
    this.draggedId = hit.id;
    this.lastWorldPoint = world;
    this.tapOriginWorld = world;
    this.history.beginDrag();
    return null;
  }

  private movePinch(point: GesturePoint): void {
    const world = this.toWorld(point);
    if (this.rotateElId) {
      const [cx, cy] = this.rotateCenter;
      const angle = Math.atan2(world.y - cy, world.x - cx);
      this.history.dispatch({
        type: 'SET_ROTATION',
        id: this.rotateElId,
        rotation:
          this.rotateInitialRotation + (angle - this.rotateInitialAngle),
      });
      return;
    }
    if (this.cpElId && this.cpDragOffset) {
      this.history.dispatch({
        type: 'RESIZE_ELEMENT',
        id: this.cpElId,
        cx: world.x - this.cpDragOffset.x,
        cy: world.y - this.cpDragOffset.y,
      });
      return;
    }
    if (
      this.resizeElId &&
      this.resizeHandle &&
      this.resizeOrigEl &&
      this.resizeOrigBounds
    ) {
      const resized = computeResize(
        this.resizeOrigEl,
        this.resizeHandle,
        this.resizeAnchorX,
        this.resizeAnchorY,
        world.x,
        world.y,
        this.resizeOrigBounds,
        false,
        1,
        1,
        this.history.present.viewport.zoom,
      );
      if (resized) {
        this.history.dispatch({
          type: 'RESIZE_ELEMENT',
          id: this.resizeElId,
          ...resized,
        });
      }
      return;
    }
    if (!this.draggedId || !this.lastWorldPoint) return;
    if (
      this.tapOriginWorld &&
      distance(this.tapOriginWorld, world) >
        TAP_MOVE_THRESHOLD_PX / this.history.present.viewport.zoom
    ) {
      this.pinchMoved = true;
    }
    this.history.dispatch({
      type: 'MOVE_ELEMENT',
      id: this.draggedId,
      dx: world.x - this.lastWorldPoint.x,
      dy: world.y - this.lastWorldPoint.y,
    });
    this.lastWorldPoint = world;
  }

  private endPinch(timestamp: number): void {
    if (this.draggedId || this.cpElId || this.resizeElId || this.rotateElId)
      this.history.endDrag();
    // A plain drag-select that never actually moved is a tap — remember it
    // so a second tap on the same element within the window deletes it.
    this.lastTapElId =
      this.draggedId && !this.pinchMoved ? this.draggedId : null;
    this.lastTapAt = timestamp;
    this.draggedId = null;
    this.lastWorldPoint = null;
    this.tapOriginWorld = null;
    this.cpElId = null;
    this.cpDragOffset = null;
    this.resizeElId = null;
    this.resizeHandle = null;
    this.resizeOrigEl = null;
    this.resizeOrigBounds = null;
    this.rotateElId = null;
  }

  private createStroke(
    points: ReadonlyArray<GesturePoint>,
  ): GestureCommandOutcome {
    const shape = classifyStroke(points);
    if (!shape) return { type: 'rejected' };
    const scene = this.history.present;
    const style = scene.appState;
    let element: Element;
    if (shape.type === 'line') {
      const start = this.toWorld(shape.start);
      const end = this.toWorld(shape.end);
      element = {
        ...baseElement('line', start.x, start.y, style),
        x2: end.x,
        y2: end.y,
        fillColor: 'transparent',
        arrowHead: 'end',
      } satisfies LineElement;
    } else if (shape.type === 'freehand') {
      const worldPoints = shape.points.map((point) => this.toWorld(point));
      const origin = worldPoints[0]!;
      element = {
        ...baseElement('freehand', origin.x, origin.y, style),
        fillColor: 'transparent',
        points: worldPoints.map((point) => [point.x, point.y] as const),
      } satisfies FreehandElement;
    } else {
      const start = this.toWorld({ x: shape.x, y: shape.y });
      const end = this.toWorld({
        x: shape.x + shape.width,
        y: shape.y + shape.height,
      });
      element = {
        ...baseElement(shape.type, start.x, start.y, style),
        width: end.x - start.x,
        height: end.y - start.y,
      } as Element;
    }
    this.history.dispatch({ type: 'CREATE_ELEMENT', element });
    return { type: 'created', shape };
  }

  private toWorld(point: GesturePoint): GesturePoint {
    const rect = this.canvas.getBoundingClientRect();
    const [x, y] = screenToWorld(
      this.history.present.viewport,
      point.x * rect.width,
      point.y * rect.height,
    );
    return { x, y };
  }

  /** Converts a normalized [0,1] camera-space point to CSS-pixel canvas-relative screen space, matching the coordinate space getSelectionHandles/hitTestHandle use for the mouse tool. */
  private toScreen(point: GesturePoint): GesturePoint {
    const rect = this.canvas.getBoundingClientRect();
    return { x: point.x * rect.width, y: point.y * rect.height };
  }
}

export type GestureCommandOutcome =
  | { type: 'created'; shape: StrokeShape }
  | { type: 'rejected' }
  | { type: 'deleted' }
  | { type: 'selected-all' };

function baseElement<T extends 'rectangle' | 'ellipse' | 'line' | 'freehand'>(
  type: T,
  x: number,
  y: number,
  style: History['present']['appState'],
) {
  return {
    id: crypto.randomUUID(),
    type,
    x,
    y,
    strokeColor: style.strokeColor,
    fillColor: style.fillColor,
    strokeWidth: style.strokeWidth,
    opacity: style.opacity,
    roughness: style.roughness,
    strokeStyle: style.strokeStyle,
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
