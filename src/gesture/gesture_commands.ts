import { screenToWorld } from '../core/viewport';
import type { Element, LineElement } from '../elements/element';
import type { History } from '../engine/history';
import { hitTest } from '../tools/select_tool';
import { classifyStroke, type StrokeShape } from './stroke_classifier';
import type { GestureEvent, GesturePoint } from './types';

export class GestureCommandAdapter {
  private draggedId: string | null = null;
  private lastWorldPoint: GesturePoint | null = null;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly history: History,
  ) {}

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
      case 'stroke-start':
      case 'stroke-move':
        return null;
    }
  }

  dispose(): void {
    this.endPinch();
  }

  private startPinch(point: GesturePoint): void {
    const world = this.toWorld(point);
    const scene = this.history.present;
    const hit = hitTest(scene.elements, world.x, world.y, scene.viewport);
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
    if (!this.draggedId || !this.lastWorldPoint) return;
    const world = this.toWorld(point);
    this.history.dispatch({
      type: 'MOVE_ELEMENT',
      id: this.draggedId,
      dx: world.x - this.lastWorldPoint.x,
      dy: world.y - this.lastWorldPoint.y,
    });
    this.lastWorldPoint = world;
  }

  private endPinch(): void {
    if (this.draggedId) this.history.endDrag();
    this.draggedId = null;
    this.lastWorldPoint = null;
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
  | { type: 'rejected' };

function baseElement<T extends 'rectangle' | 'ellipse' | 'line'>(
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
