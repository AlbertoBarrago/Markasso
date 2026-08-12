import { screenToWorld } from '../core/viewport';
import type {
  Element,
  FreehandElement,
  LineElement,
} from '../elements/element';
import type { History } from '../engine/history';
import { hitTest } from '../tools/select_tool';
import { gestureHover } from './gesture_hover';
import { distance } from './landmark_geometry';
import { classifyStroke, type StrokeShape } from './stroke_classifier';
import type { GestureEvent, GesturePoint } from './types';

// Hand tracking is far less precise than a mouse pointer, so gesture hit-testing
// gets extra screen-space tolerance beyond the mouse SelectTool's defaults.
const GESTURE_HIT_PAD_PX = 16;
const GESTURE_REGRAB_PAD_PX = 40;
const CP_GRAB_RADIUS_PX = 32;

// Typical wrist-to-middle-MCP distance (normalized image space) for a hand at
// a comfortable distance from the camera — the baseline the padding above was
// tuned against. A smaller palmScale (small hand, or hand farther from the
// camera) means the same absolute landmark jitter maps to a larger fraction
// of the hand, so hit tolerances scale up to compensate.
const REFERENCE_PALM_SCALE = 0.18;
const HAND_SCALE_MIN = 0.75;
const HAND_SCALE_MAX = 2.5;

export class GestureCommandAdapter {
  private draggedId: string | null = null;
  private lastWorldPoint: GesturePoint | null = null;
  private cpElId: string | null = null;
  private cpDragOffset: GesturePoint | null = null;
  private handScale = 1;

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
        this.startPinch(event.point);
        return null;
      case 'pinch-move':
        this.movePinch(event.point);
        return null;
      case 'pinch-end':
        this.endPinch();
        return null;
      case 'stroke-end':
        return this.createStroke(event.points);
      case 'delete':
        return this.deleteAt(event.point);
      case 'stroke-start':
      case 'stroke-move':
        return null;
    }
  }

  /** Updates the hover highlight while the hand points/rests over the canvas without pinching. */
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
    this.endPinch();
    gestureHover.id = null;
  }

  private deleteAt(point: GesturePoint): GestureCommandOutcome | null {
    const world = this.toWorld(point);
    const scene = this.history.present;
    const hit = hitTest(
      scene.elements,
      world.x,
      world.y,
      scene.viewport,
      this.hitPad,
    );
    if (!hit || hit.locked) return null;
    this.history.dispatch({ type: 'DELETE_ELEMENTS', ids: [hit.id] });
    gestureHover.id = null;
    return { type: 'deleted' };
  }

  private startPinch(point: GesturePoint): void {
    gestureHover.id = null;
    const world = this.toWorld(point);
    const scene = this.history.present;

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
        return;
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
      return;
    }
    this.history.dispatch({ type: 'SELECT_ELEMENTS', ids: [hit.id] });
    this.draggedId = hit.id;
    this.lastWorldPoint = world;
    this.history.beginDrag();
  }

  private movePinch(point: GesturePoint): void {
    const world = this.toWorld(point);
    if (this.cpElId && this.cpDragOffset) {
      this.history.dispatch({
        type: 'RESIZE_ELEMENT',
        id: this.cpElId,
        cx: world.x - this.cpDragOffset.x,
        cy: world.y - this.cpDragOffset.y,
      });
      return;
    }
    if (!this.draggedId || !this.lastWorldPoint) return;
    this.history.dispatch({
      type: 'MOVE_ELEMENT',
      id: this.draggedId,
      dx: world.x - this.lastWorldPoint.x,
      dy: world.y - this.lastWorldPoint.y,
    });
    this.lastWorldPoint = world;
  }

  private endPinch(): void {
    if (this.draggedId || this.cpElId) this.history.endDrag();
    this.draggedId = null;
    this.lastWorldPoint = null;
    this.cpElId = null;
    this.cpDragOffset = null;
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
}

export type GestureCommandOutcome =
  | { type: 'created'; shape: StrokeShape }
  | { type: 'rejected' }
  | { type: 'deleted' };

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
