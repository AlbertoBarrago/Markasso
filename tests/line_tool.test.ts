import { describe, expect, it } from 'vitest';
import type { Command } from '../src/commands/commands';
import { createScene } from '../src/core/scene';
import type { LineElement } from '../src/elements/element';
import {
  distToPerimeterBounds,
  LineTool,
  snap45,
} from '../src/tools/line_tool';
import type { ToolContext } from '../src/tools/tool';

function makeToolContext(dispatched: Command[]): ToolContext {
  return {
    history: {
      present: createScene(),
      dispatch: (command: Command) => {
        dispatched.push(command);
      },
    },
    canvas: {} as HTMLCanvasElement,
  } as ToolContext;
}

describe('snap45', () => {
  it('snaps to 0° (right) — output y is zero', () => {
    const [, y] = snap45(0, 0, 100, 5);
    expect(y).toBeCloseTo(0, 3);
  });

  it('snaps to 90° (down) — output x is zero', () => {
    const [x] = snap45(0, 0, 5, 100);
    expect(x).toBeCloseTo(0, 3);
  });

  it('snaps to 45° — x and y are equal', () => {
    const [x, y] = snap45(0, 0, 80, 80);
    expect(x).toBeCloseTo(y, 5);
  });

  it('snaps to 135° — x and y are equal in magnitude, opposite sign', () => {
    const [x, y] = snap45(0, 0, -80, 80);
    expect(Math.abs(x)).toBeCloseTo(Math.abs(y), 5);
    expect(x).toBeLessThan(0);
    expect(y).toBeGreaterThan(0);
  });

  it('snaps to 180° (left) — output y is zero, x negative', () => {
    const [x, y] = snap45(0, 0, -100, 5);
    expect(y).toBeCloseTo(0, 3);
    expect(x).toBeLessThan(0);
  });

  it('snaps to 270° (up) — output x is zero, y negative', () => {
    const [x, y] = snap45(0, 0, 5, -100);
    expect(x).toBeCloseTo(0, 3);
    expect(y).toBeLessThan(0);
  });

  it('preserves distance from start point', () => {
    const [x, y] = snap45(10, 20, 90, 95);
    const snappedDist = Math.hypot(x - 10, y - 20);
    const originalDist = Math.hypot(90 - 10, 95 - 20);
    expect(snappedDist).toBeCloseTo(originalDist, 5);
  });

  it('works with non-origin start point — snaps to 0°', () => {
    const [x, y] = snap45(50, 50, 150, 55);
    expect(y).toBeCloseTo(50, 1);
    expect(x).toBeGreaterThan(50);
  });
});

describe('distToPerimeterBounds', () => {
  const box = { x: 0, y: 0, w: 100, h: 60 };

  it('returns 0 for a point on the boundary', () => {
    expect(distToPerimeterBounds(box, 0, 30)).toBe(0);
    expect(distToPerimeterBounds(box, 100, 30)).toBe(0);
    expect(distToPerimeterBounds(box, 50, 0)).toBe(0);
    expect(distToPerimeterBounds(box, 50, 60)).toBe(0);
  });

  it('returns 0 for a point inside the box', () => {
    expect(distToPerimeterBounds(box, 50, 30)).toBe(0);
  });

  it('returns correct distance for a point outside (right side)', () => {
    expect(distToPerimeterBounds(box, 110, 30)).toBeCloseTo(10);
  });

  it('returns correct distance for a point outside (top)', () => {
    expect(distToPerimeterBounds(box, 50, -20)).toBeCloseTo(20);
  });

  it('returns correct distance for a point outside (corner)', () => {
    expect(distToPerimeterBounds(box, 110, 70)).toBeCloseTo(Math.hypot(10, 10));
  });
});

describe('LineTool', () => {
  it('creates lines with an end arrowhead by default', () => {
    const dispatched: Command[] = [];
    const ctx = makeToolContext(dispatched);
    const tool = new LineTool();

    tool.onMouseDown({} as MouseEvent, 0, 0, ctx);
    tool.onMouseUp({ shiftKey: false } as MouseEvent, 100, 0, ctx);

    const createCommand = dispatched.find(
      (cmd) => cmd.type === 'CREATE_ELEMENT',
    );
    expect(createCommand?.type).toBe('CREATE_ELEMENT');
    expect((createCommand!.element as LineElement).arrowHead).toBe('end');
  });
});
