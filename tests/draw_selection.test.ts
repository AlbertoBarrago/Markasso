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

  it('resolves startElementId to element border facing the other endpoint', () => {
    // rect at (0,0) 100×60 → center (50, 30); other end at (200, 200)
    // direction from center toward (200,200): dx=150, dy=170
    // t = min(50/150, 30/170) = 30/170 → hits bottom edge
    // border: x = 50 + 150*(30/170) ≈ 76.47, y = 60
    const rect = makeRect('r1', 0, 0, 100, 60);
    const arrow = makeArrow({ x: 999, y: 999, startElementId: 'r1' });
    const result = resolveArrowEndpoints(arrow, [rect]);
    expect(result.x).toBeCloseTo(1300 / 17, 5); // ≈ 76.47
    expect(result.y).toBe(60);                   // bottom edge
    expect(result.x2).toBe(200);                 // end unchanged
  });

  it('resolves endElementId to element border facing the other endpoint', () => {
    // rect at (100,200) 80×40 → center (140, 220); other end at (0, 0)
    // direction from center toward (0,0): dx=-140, dy=-220
    // t = min(40/140, 20/220) = 20/220 → hits top edge
    // border: x2 ≈ 127.27, y2 = 200 (top edge)
    const rect = makeRect('r2', 100, 200, 80, 40);
    const arrow = makeArrow({ x2: 999, y2: 999, endElementId: 'r2' });
    const result = resolveArrowEndpoints(arrow, [rect]);
    expect(result.x2).toBeCloseTo(1400 / 11, 5); // ≈ 127.27
    expect(result.y2).toBe(200);                  // top edge
    expect(result.x).toBe(0);                     // start unchanged
  });

  it('resolves both endpoints to their respective borders facing each other', () => {
    // r1 at (0,0) 100×60 → center (50, 30)
    // r2 at (300,400) 60×40 → center (330, 420)
    // r1 border toward r2: t = min(50/280, 30/390) = 1/13 → x ≈ 71.54, y = 60
    // r2 border toward r1: t = min(30/280, 20/390) = 2/39 → x2 ≈ 315.64, y2 = 400
    const r1 = makeRect('r1', 0, 0, 100, 60);
    const r2 = makeRect('r2', 300, 400, 60, 40);
    const arrow = makeArrow({ startElementId: 'r1', endElementId: 'r2' });
    const result = resolveArrowEndpoints(arrow, [r1, r2]);
    expect(result.x).toBeCloseTo(930 / 13, 5);       // ≈ 71.54 (r1 bottom-right)
    expect(result.y).toBe(60);                        // r1 bottom edge
    expect(result.x2).toBeCloseTo(12310 / 39, 5);    // ≈ 315.64 (r2 top-left)
    expect(result.y2).toBe(400);                      // r2 top edge
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

  it('uses resolved border endpoints when allElements provided', () => {
    // r1 at (0,0) 100×60 → center (50,30); r2 at (200,300) 100×60 → center (250,330)
    // r1 border toward r2: dx=200, dy=300, t=min(50/200,30/300)=1/10 → (70, 60)
    // r2 border toward r1: dx=-200, dy=-300, t=1/10 → (230, 300)
    // bounds: x=70, y=60, w=160, h=240
    const r1 = makeRect('r1', 0, 0, 100, 60);
    const r2 = makeRect('r2', 200, 300, 100, 60);
    const arrow = makeArrow({ x: 999, y: 999, x2: 999, y2: 999, startElementId: 'r1', endElementId: 'r2' });
    const b = getElementBounds(arrow, [r1, r2, arrow]);
    expect(b.x).toBe(70);
    expect(b.y).toBe(60);
    expect(b.w).toBe(160);
    expect(b.h).toBe(240);
  });
});
