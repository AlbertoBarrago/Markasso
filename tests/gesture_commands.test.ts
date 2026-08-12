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
    adapter.handle({
      type: 'pinch-start',
      point: { x: 0.2, y: 0.2 },
      timestamp: 0,
    });
    adapter.handle({ type: 'pinch-move', point: { x: 0.3, y: 0.25 } });
    adapter.handle({
      type: 'pinch-end',
      point: { x: 0.3, y: 0.25 },
      timestamp: 16,
    });
    expect(history.present.elements[0]).toMatchObject({ x: 20, y: 15 });
    history.undo();
    expect(history.present.elements[0]).toMatchObject({ x: 10, y: 10 });
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
    adapter.handle({
      type: 'pinch-start',
      point: { x: 0.42, y: 0.25 },
      timestamp: 0,
    });
    expect(history.present.selectedIds.has('rect')).toBe(true);
  });

  it('deletes an element on a double-pinch tap without dragging it', () => {
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
    adapter.handle({
      type: 'pinch-start',
      point: { x: 0.2, y: 0.2 },
      timestamp: 0,
    });
    adapter.handle({
      type: 'pinch-end',
      point: { x: 0.2, y: 0.2 },
      timestamp: 16,
    });
    expect(history.present.elements).toHaveLength(1);

    const outcome = adapter.handle({
      type: 'pinch-start',
      point: { x: 0.2, y: 0.2 },
      timestamp: 200,
    });
    expect(outcome?.type).toBe('deleted');
    expect(history.present.elements).toHaveLength(0);
  });

  it('does not delete when the second pinch comes after the double-tap window', () => {
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
    adapter.handle({
      type: 'pinch-start',
      point: { x: 0.2, y: 0.2 },
      timestamp: 0,
    });
    adapter.handle({
      type: 'pinch-end',
      point: { x: 0.2, y: 0.2 },
      timestamp: 16,
    });

    const outcome = adapter.handle({
      type: 'pinch-start',
      point: { x: 0.2, y: 0.2 },
      timestamp: 2_000,
    });
    expect(outcome?.type).not.toBe('deleted');
    expect(history.present.elements).toHaveLength(1);
  });

  it('does not delete when the element was dragged between the two pinches', () => {
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
    adapter.handle({
      type: 'pinch-start',
      point: { x: 0.2, y: 0.2 },
      timestamp: 0,
    });
    adapter.handle({ type: 'pinch-move', point: { x: 0.4, y: 0.2 } });
    adapter.handle({
      type: 'pinch-end',
      point: { x: 0.4, y: 0.2 },
      timestamp: 16,
    });

    const outcome = adapter.handle({
      type: 'pinch-start',
      point: { x: 0.4, y: 0.2 },
      timestamp: 100,
    });
    expect(outcome?.type).not.toBe('deleted');
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
    adapter.handle({
      type: 'pinch-start',
      point: { x: 0.2, y: 0.1 },
      timestamp: 0,
    });
    adapter.handle({ type: 'pinch-move', point: { x: 0.2, y: 0.3 } });
    adapter.handle({
      type: 'pinch-end',
      point: { x: 0.2, y: 0.3 },
      timestamp: 16,
    });
    const line = history.present.elements[0];
    expect(line).toMatchObject({ x: 10, y: 10, x2: 30, y2: 10, cy: 30 });
  });

  it('reports whether an air stroke was committed', () => {
    const history = new History(createScene());
    const adapter = new GestureCommandAdapter(canvas(), history);
    const points = Array.from({ length: 12 }, (_, index) => ({
      x: 0.1 + index * 0.05,
      y: 0.2,
    }));
    expect(adapter.handle({ type: 'stroke-end', points })?.type).toBe(
      'created',
    );
    expect(history.present.elements).toHaveLength(1);
    expect(
      adapter.handle({ type: 'stroke-end', points: points.slice(0, 2) })?.type,
    ).toBe('rejected');
  });
});

function canvas(): HTMLCanvasElement {
  return {
    getBoundingClientRect: () => ({ width: 100, height: 100 }),
  } as HTMLCanvasElement;
}
