import { describe, expect, it } from 'vitest';
import { createScene } from '../src/core/scene';
import { History } from '../src/engine/history';
import { GestureCommandAdapter } from '../src/gesture/gesture_commands';

describe('GestureCommandAdapter', () => {
  it('selects and drags an element as one undoable operation', () => {
    const scene = createScene();
    const history = new History({
      ...scene,
      elements: [
        {
          id: 'rect',
          type: 'rectangle',
          x: 10,
          y: 10,
          width: 30,
          height: 30,
          strokeColor: '#fff',
          fillColor: 'transparent',
          strokeWidth: 2,
          opacity: 1,
          roughness: 0,
        },
      ],
    });
    const adapter = new GestureCommandAdapter(canvas(), history);
    adapter.handle({ type: 'pinch-start', point: { x: 0.2, y: 0.2 } });
    adapter.handle({ type: 'pinch-move', point: { x: 0.3, y: 0.25 } });
    adapter.handle({ type: 'pinch-end', point: { x: 0.3, y: 0.25 } });
    expect(history.present.elements[0]).toMatchObject({ x: 20, y: 15 });
    history.undo();
    expect(history.present.elements[0]).toMatchObject({ x: 10, y: 10 });
  });

  it('keeps gesture drag deltas correct through pan and zoom', () => {
    const scene = createScene();
    const history = new History({
      ...scene,
      viewport: { offsetX: 40, offsetY: 20, zoom: 2 },
      elements: [
        {
          id: 'rect',
          type: 'rectangle',
          x: 10,
          y: 10,
          width: 30,
          height: 30,
          strokeColor: '#fff',
          fillColor: 'transparent',
          strokeWidth: 2,
          opacity: 1,
          roughness: 0,
        },
      ],
    });
    const adapter = new GestureCommandAdapter(canvas(), history);

    adapter.handle({ type: 'pinch-start', point: { x: 0.7, y: 0.4 } });
    adapter.handle({ type: 'pinch-move', point: { x: 0.9, y: 0.6 } });
    adapter.handle({ type: 'pinch-end', point: { x: 0.9, y: 0.6 } });

    expect(history.present.elements[0]).toMatchObject({ x: 20, y: 20 });
  });

  it('drags every selected element together when pinching an already-selected one', () => {
    const scene = createScene();
    const history = new History({
      ...scene,
      elements: [
        {
          id: 'rect1',
          type: 'rectangle',
          x: 10,
          y: 10,
          width: 20,
          height: 20,
          strokeColor: '#fff',
          fillColor: 'transparent',
          strokeWidth: 2,
          opacity: 1,
          roughness: 0,
        },
        {
          id: 'rect2',
          type: 'rectangle',
          x: 60,
          y: 60,
          width: 20,
          height: 20,
          strokeColor: '#fff',
          fillColor: 'transparent',
          strokeWidth: 2,
          opacity: 1,
          roughness: 0,
        },
      ],
      selectedIds: new Set(['rect1', 'rect2']),
    });
    const adapter = new GestureCommandAdapter(canvas(), history);
    // Pinch lands on rect1 (world 10..30, 10..30), already part of the
    // selection — the whole group should move together, not collapse to
    // just rect1.
    adapter.handle({ type: 'pinch-start', point: { x: 0.15, y: 0.15 } });
    adapter.handle({ type: 'pinch-move', point: { x: 0.25, y: 0.25 } });
    adapter.handle({ type: 'pinch-end', point: { x: 0.25, y: 0.25 } });
    expect(history.present.selectedIds).toEqual(new Set(['rect1', 'rect2']));
    expect(
      history.present.elements.find((el) => el.id === 'rect1'),
    ).toMatchObject({ x: 20, y: 20 });
    expect(
      history.present.elements.find((el) => el.id === 'rect2'),
    ).toMatchObject({ x: 70, y: 70 });
  });

  it('grabs an element slightly outside its bounds (gesture hit tolerance)', () => {
    const scene = createScene();
    const history = new History({
      ...scene,
      elements: [
        {
          id: 'rect',
          type: 'rectangle',
          x: 10,
          y: 10,
          width: 30,
          height: 30,
          strokeColor: '#fff',
          fillColor: 'transparent',
          strokeWidth: 2,
          opacity: 1,
          roughness: 0,
        },
      ],
    });
    const adapter = new GestureCommandAdapter(canvas(), history);
    // World (42, 25) is 2px past the rectangle's right edge (x: 10..40) —
    // a mouse click would miss, but the gesture's extra tolerance should hit.
    adapter.handle({ type: 'pinch-start', point: { x: 0.42, y: 0.25 } });
    expect(history.present.selectedIds.has('rect')).toBe(true);
  });

  it('deletes the selected element on a delete event', () => {
    const scene = createScene();
    const history = new History({
      ...scene,
      elements: [
        {
          id: 'rect',
          type: 'rectangle',
          x: 10,
          y: 10,
          width: 30,
          height: 30,
          strokeColor: '#fff',
          fillColor: 'transparent',
          strokeWidth: 2,
          opacity: 1,
          roughness: 0,
        },
      ],
      selectedIds: new Set(['rect']),
    });
    const adapter = new GestureCommandAdapter(canvas(), history);
    const outcome = adapter.handle({ type: 'delete' });
    expect(outcome?.type).toBe('deleted');
    expect(history.present.elements).toHaveLength(0);
  });

  it('does nothing on a delete event when nothing is selected', () => {
    const history = new History(createScene());
    const adapter = new GestureCommandAdapter(canvas(), history);
    const outcome = adapter.handle({ type: 'delete' });
    expect(outcome).toBeNull();
  });

  it('does not delete a locked element', () => {
    const scene = createScene();
    const history = new History({
      ...scene,
      elements: [
        {
          id: 'rect',
          type: 'rectangle',
          x: 10,
          y: 10,
          width: 30,
          height: 30,
          strokeColor: '#fff',
          fillColor: 'transparent',
          strokeWidth: 2,
          opacity: 1,
          roughness: 0,
          locked: true,
        },
      ],
      selectedIds: new Set(['rect']),
    });
    const adapter = new GestureCommandAdapter(canvas(), history);
    const outcome = adapter.handle({ type: 'delete' });
    expect(outcome).toBeNull();
    expect(history.present.elements).toHaveLength(1);
  });

  it('drags a line control point instead of the whole line when grabbed near it', () => {
    const scene = createScene();
    const history = new History({
      ...scene,
      elements: [
        {
          id: 'line',
          type: 'line',
          x: 10,
          y: 10,
          x2: 30,
          y2: 10,
          strokeColor: '#fff',
          fillColor: 'transparent',
          strokeWidth: 2,
          opacity: 1,
          roughness: 0,
        },
      ],
      selectedIds: new Set(['line']),
    });
    const adapter = new GestureCommandAdapter(canvas(), history);
    // Midpoint of the line is world (20, 10) — grab near it and drag down.
    adapter.handle({ type: 'pinch-start', point: { x: 0.2, y: 0.1 } });
    adapter.handle({ type: 'pinch-move', point: { x: 0.2, y: 0.3 } });
    adapter.handle({ type: 'pinch-end', point: { x: 0.2, y: 0.3 } });
    const line = history.present.elements[0];
    expect(line).toMatchObject({ x: 10, y: 10, x2: 30, y2: 10, cy: 30 });
  });

  it('always commits a valid air stroke as freehand', () => {
    const history = new History(createScene());
    const adapter = new GestureCommandAdapter(canvas(), history);
    const points = Array.from({ length: 12 }, (_, index) => ({
      x: 0.1 + index * 0.05,
      y: 0.2,
    }));
    const outcome = adapter.handle({ type: 'stroke-end', points });
    expect(outcome).toEqual({ type: 'created', points });
    expect(history.present.elements).toHaveLength(1);
    expect(history.present.elements[0]).toMatchObject({
      type: 'freehand',
      x: 10,
      y: 20,
      points: [
        [10, 20],
        [65, 20],
      ],
    });
    expect(
      adapter.handle({ type: 'stroke-end', points: points.slice(0, 1) }),
    ).toBeNull();
  });

  it('creates a smoothed freehand element for an ambiguous air stroke', () => {
    const history = new History(createScene());
    const adapter = new GestureCommandAdapter(canvas(), history);
    const points = Array.from({ length: 24 }, (_, index) => ({
      x: 0.2 + index * 0.02,
      y: 0.5 + Math.sin(index * 1.7) * 0.15,
    }));

    expect(adapter.handle({ type: 'stroke-end', points })?.type).toBe(
      'created',
    );
    expect(history.present.elements[0]).toMatchObject({
      type: 'freehand',
      fillColor: 'transparent',
    });
    const element = history.present.elements[0];
    expect(
      element?.type === 'freehand' && element.points.length,
    ).toBeGreaterThan(2);
  });
});

function canvas(): HTMLCanvasElement {
  return {
    getBoundingClientRect: () => ({ width: 100, height: 100 }),
  } as HTMLCanvasElement;
}
