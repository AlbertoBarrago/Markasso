import { describe, it, expect } from 'vitest';
import { resolveArrowEndpoints, getElementBounds } from '../src/rendering/draw_selection';
import type { ArrowElement, RectangleElement } from '../src/elements/element';

function makeRect(id: string, x: number, y: number, w = 100, h = 60): RectangleElement {
  return {
    id, type: 'rectangle', x, y, width: w, height: h,
    strokeColor: '#000', fillColor: 'transparent',
    strokeWidth: 2, opacity: 1, roughness: 0,
  };
}

function makeArrow(overrides: Partial<ArrowElement> = {}): ArrowElement {
  return {
    id: 'a1', type: 'arrow',
    x: 0, y: 0, x2: 200, y2: 200,
    strokeColor: '#000', fillColor: 'transparent',
    strokeWidth: 2, opacity: 1, roughness: 0,
    ...overrides,
  };
}

describe('resolveArrowEndpoints', () => {
  it('returns stored positions when no connections', () => {
    const arrow = makeArrow({ x: 10, y: 20, x2: 110, y2: 120 });
    const result = resolveArrowEndpoints(arrow, []);
    expect(result).toEqual({ x: 10, y: 20, x2: 110, y2: 120 });
  });

  it('resolves startElementId to element center', () => {
    // rect at (0,0) 100x60 → center (50, 30)
    const rect = makeRect('r1', 0, 0, 100, 60);
    const arrow = makeArrow({ x: 999, y: 999, startElementId: 'r1' });
    const result = resolveArrowEndpoints(arrow, [rect]);
    expect(result.x).toBe(50);
    expect(result.y).toBe(30);
    expect(result.x2).toBe(200); // end unchanged
  });

  it('resolves endElementId to element center', () => {
    // rect at (100, 200) 80x40 → center (140, 220)
    const rect = makeRect('r2', 100, 200, 80, 40);
    const arrow = makeArrow({ x2: 999, y2: 999, endElementId: 'r2' });
    const result = resolveArrowEndpoints(arrow, [rect]);
    expect(result.x2).toBe(140);
    expect(result.y2).toBe(220);
    expect(result.x).toBe(0); // start unchanged
  });

  it('resolves both endpoints', () => {
    const r1 = makeRect('r1', 0, 0, 100, 60);   // center (50, 30)
    const r2 = makeRect('r2', 300, 400, 60, 40); // center (330, 420)
    const arrow = makeArrow({ startElementId: 'r1', endElementId: 'r2' });
    const result = resolveArrowEndpoints(arrow, [r1, r2]);
    expect(result.x).toBe(50);
    expect(result.y).toBe(30);
    expect(result.x2).toBe(330);
    expect(result.y2).toBe(420);
  });

  it('falls back to stored position if connected element not found', () => {
    const arrow = makeArrow({ x: 5, y: 6, startElementId: 'missing' });
    const result = resolveArrowEndpoints(arrow, []);
    expect(result.x).toBe(5);
    expect(result.y).toBe(6);
  });
});

describe('getElementBounds with arrow connections', () => {
  it('returns bounds from stored positions when no allElements provided', () => {
    const arrow = makeArrow({ x: 10, y: 20, x2: 110, y2: 80 });
    const b = getElementBounds(arrow);
    expect(b).toEqual({ x: 10, y: 20, w: 100, h: 60 });
  });

  it('uses resolved endpoints when allElements provided', () => {
    // r1 at (0,0) 100x60 → center (50,30); r2 at (200,300) 100x60 → center (250,330)
    const r1 = makeRect('r1', 0, 0, 100, 60);
    const r2 = makeRect('r2', 200, 300, 100, 60);
    const arrow = makeArrow({ x: 999, y: 999, x2: 999, y2: 999, startElementId: 'r1', endElementId: 'r2' });
    const b = getElementBounds(arrow, [r1, r2, arrow]);
    expect(b.x).toBe(50);
    expect(b.y).toBe(30);
    expect(b.w).toBe(200); // 250 - 50
    expect(b.h).toBe(300); // 330 - 30
  });
});
