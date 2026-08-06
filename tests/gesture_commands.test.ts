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
