import { describe, expect, it } from 'vitest';
import { createViewport } from '../src/core/viewport';
import type {
  ArrowElement,
  LineElement,
  RectangleElement,
} from '../src/elements/element';
import type { Handle } from '../src/rendering/draw_selection';
import {
  distToShapeBoundary,
  getElementBorderPoint,
  getElementBounds,
  getElementCenter,
  getRotationHandleScreen,
  getSelectionHandles,
  hitTestEndpoint,
  hitTestHandle,
  resolveArrowEndpoints,
} from '../src/rendering/draw_selection';

function makeRect(
  id: string,
  x: number,
  y: number,
  w = 100,
  h = 60,
): RectangleElement {
  return {
    id,
    type: 'rectangle',
    x,
    y,
    width: w,
    height: h,
    strokeColor: '#000',
    fillColor: 'transparent',
    strokeWidth: 2,
    opacity: 1,
    roughness: 0,
  };
}

function makeArrow(overrides: Partial<ArrowElement> = {}): ArrowElement {
  return {
    id: 'a1',
    type: 'arrow',
    x: 0,
    y: 0,
    x2: 200,
    y2: 200,
    strokeColor: '#000',
    fillColor: 'transparent',
    strokeWidth: 2,
    opacity: 1,
    roughness: 0,
    ...overrides,
  };
}

function makeLine(overrides: Partial<LineElement> = {}): LineElement {
  return {
    id: 'l1',
    type: 'line',
    x: 0,
    y: 0,
    x2: 100,
    y2: 0,
    strokeColor: '#000',
    fillColor: 'transparent',
    strokeWidth: 2,
    opacity: 1,
    roughness: 0,
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
    expect(result.y).toBe(60); // bottom edge
    expect(result.x2).toBe(200); // end unchanged
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
    expect(result.y2).toBe(200); // top edge
    expect(result.x).toBe(0); // start unchanged
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
    expect(result.x).toBeCloseTo(930 / 13, 5); // ≈ 71.54 (r1 bottom-right)
    expect(result.y).toBe(60); // r1 bottom edge
    expect(result.x2).toBeCloseTo(12310 / 39, 5); // ≈ 315.64 (r2 top-left)
    expect(result.y2).toBe(400); // r2 top edge
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
    const arrow = makeArrow({
      x: 999,
      y: 999,
      x2: 999,
      y2: 999,
      startElementId: 'r1',
      endElementId: 'r2',
    });
    const b = getElementBounds(arrow, [r1, r2, arrow]);
    expect(b.x).toBe(70);
    expect(b.y).toBe(60);
    expect(b.w).toBe(160);
    expect(b.h).toBe(240);
  });

  it('uses quadratic bounds for bent lines', () => {
    const line = makeLine({ cx: 50, cy: 100 });
    const b = getElementBounds(line);
    expect(b.x).toBe(0);
    expect(b.y).toBe(0);
    expect(b.w).toBe(100);
    expect(b.h).toBe(50);
  });
});

// ── getSelectionHandles ───────────────────────────────────────────────────────

describe('getSelectionHandles', () => {
  const vp = createViewport(); // zoom=1, offset=(0,0)

  it('returns empty array for no elements', () => {
    expect(getSelectionHandles([], vp)).toEqual([]);
  });

  it('returns 8 handles for a single rect', () => {
    const rect = makeRect('r1', 100, 100, 200, 100);
    const handles = getSelectionHandles([rect], vp);
    expect(handles).toHaveLength(8);
  });

  it('handles cover all 8 positions', () => {
    const rect = makeRect('r1', 0, 0, 100, 60);
    const positions = getSelectionHandles([rect], vp).map((h) => h.position);
    expect(positions).toEqual(
      expect.arrayContaining(['nw', 'n', 'ne', 'w', 'e', 'sw', 's', 'se']),
    );
  });

  it('nw handle is at top-left corner in screen space', () => {
    const rect = makeRect('r1', 50, 30, 100, 60);
    const handles = getSelectionHandles([rect], vp);
    const nw = handles.find((h) => h.position === 'nw')!;
    expect(nw.screenX).toBe(50);
    expect(nw.screenY).toBe(30);
  });

  it('se handle is at bottom-right corner in screen space', () => {
    const rect = makeRect('r1', 50, 30, 100, 60);
    const handles = getSelectionHandles([rect], vp);
    const se = handles.find((h) => h.position === 'se')!;
    expect(se.screenX).toBe(150);
    expect(se.screenY).toBe(90);
  });

  it('multi-element selection returns handles covering union bounds', () => {
    const r1 = makeRect('r1', 0, 0, 50, 50);
    const r2 = makeRect('r2', 100, 100, 50, 50);
    const handles = getSelectionHandles([r1, r2], vp);
    const nw = handles.find((h) => h.position === 'nw')!;
    const se = handles.find((h) => h.position === 'se')!;
    expect(nw.screenX).toBe(0);
    expect(nw.screenY).toBe(0);
    expect(se.screenX).toBe(150);
    expect(se.screenY).toBe(150);
  });

  it('respects viewport zoom', () => {
    const rect = makeRect('r1', 0, 0, 100, 60);
    const zoomed = { offsetX: 0, offsetY: 0, zoom: 2 };
    const handles = getSelectionHandles([rect], zoomed);
    const se = handles.find((h) => h.position === 'se')!;
    expect(se.screenX).toBe(200);
    expect(se.screenY).toBe(120);
  });

  it('rotated single element has handles different from unrotated', () => {
    const base = makeRect('r1', 0, 0, 100, 100);
    const rotated: RectangleElement = { ...base, rotation: Math.PI / 4 };
    const baseHandles = getSelectionHandles([base], vp);
    const rotHandles = getSelectionHandles([rotated], vp);
    const baseNW = baseHandles.find((h) => h.position === 'nw')!;
    const rotNW = rotHandles.find((h) => h.position === 'nw')!;
    // After rotation the nw handle should move
    expect(rotNW.screenX).not.toBeCloseTo(baseNW.screenX, 0);
  });
});

// ── hitTestHandle ─────────────────────────────────────────────────────────────

describe('hitTestHandle', () => {
  const handles: Handle[] = [
    { position: 'nw', screenX: 0, screenY: 0 },
    { position: 'se', screenX: 100, screenY: 100 },
  ];

  it('returns the position of a directly hit handle', () => {
    expect(hitTestHandle(handles, 0, 0)).toBe('nw');
    expect(hitTestHandle(handles, 100, 100)).toBe('se');
  });

  it('returns null when no handle is hit', () => {
    expect(hitTestHandle(handles, 50, 50)).toBeNull();
  });

  it('returns handle when within default tolerance', () => {
    expect(hitTestHandle(handles, 7, 7)).toBe('nw');
  });

  it('returns null just outside default tolerance', () => {
    expect(hitTestHandle(handles, 13, 13)).toBeNull();
  });

  it('respects custom tolerance', () => {
    expect(hitTestHandle(handles, 20, 0, 16)).toBe('nw');
    expect(hitTestHandle(handles, 21, 0, 16)).toBeNull();
  });

  it('returns null for empty handle array', () => {
    expect(hitTestHandle([], 0, 0)).toBeNull();
  });
});

// ── hitTestEndpoint ───────────────────────────────────────────────────────────

describe('hitTestEndpoint', () => {
  const vp = createViewport();

  it('returns null for non-line/arrow elements', () => {
    const rect = makeRect('r1', 0, 0, 100, 60);
    expect(hitTestEndpoint(rect, vp, 0, 0)).toBeNull();
  });

  it('returns "start" when clicking near the start endpoint', () => {
    const line = makeLine({ x: 50, y: 50, x2: 200, y2: 200 });
    expect(hitTestEndpoint(line, vp, 50, 50)).toBe('start');
  });

  it('returns "end" when clicking near the end endpoint', () => {
    const line = makeLine({ x: 50, y: 50, x2: 200, y2: 200 });
    expect(hitTestEndpoint(line, vp, 200, 200)).toBe('end');
  });

  it('returns null when clicking in the middle', () => {
    const line = makeLine({ x: 0, y: 0, x2: 100, y2: 0 });
    expect(hitTestEndpoint(line, vp, 50, 0)).toBeNull();
  });
});

// ── getElementCenter ──────────────────────────────────────────────────────────

describe('getElementCenter', () => {
  it('returns center of a rectangle', () => {
    const rect = makeRect('r1', 0, 0, 100, 60);
    expect(getElementCenter(rect)).toEqual([50, 30]);
  });

  it('returns center with non-zero origin', () => {
    const rect = makeRect('r1', 20, 10, 80, 40);
    expect(getElementCenter(rect)).toEqual([60, 30]);
  });
});

// ── getRotationHandleScreen ───────────────────────────────────────────────────

describe('getRotationHandleScreen', () => {
  const vp = createViewport();

  it('returns null for empty selection', () => {
    expect(getRotationHandleScreen([], vp)).toBeNull();
  });

  it('returns handle above the bounding box center', () => {
    const rect = makeRect('r1', 0, 0, 100, 60);
    const h = getRotationHandleScreen([rect], vp)!;
    expect(h).not.toBeNull();
    expect(h.screenX).toBeCloseTo(50, 1);
    expect(h.screenY).toBeLessThan(0);
  });

  it('returns null-safe value for multi-element (no rotation)', () => {
    const r1 = makeRect('r1', 0, 0, 50, 50);
    const r2 = makeRect('r2', 100, 0, 50, 50);
    const h = getRotationHandleScreen([r1, r2], vp)!;
    expect(h).not.toBeNull();
    expect(h.screenX).toBeCloseTo(75, 1);
  });
});

// ── getElementBorderPoint ─────────────────────────────────────────────────────

describe('getElementBorderPoint', () => {
  it('returns right-border point for rect when target is to the right', () => {
    const rect = makeRect('r1', 0, 0, 100, 60);
    const [x, y] = getElementBorderPoint(rect, 200, 30);
    expect(x).toBe(100);
    expect(y).toBeCloseTo(30, 1);
  });

  it('returns top-border point for rect when target is above', () => {
    const rect = makeRect('r1', 0, 0, 100, 60);
    const [x, y] = getElementBorderPoint(rect, 50, -100);
    expect(y).toBe(0);
    expect(x).toBeCloseTo(50, 1);
  });

  it('falls back to top-center when target is exactly at center', () => {
    const rect = makeRect('r1', 0, 0, 100, 60);
    const [, y] = getElementBorderPoint(rect, 50, 30);
    expect(y).toBe(0);
  });

  it('works for ellipse elements', () => {
    const ellipse = {
      id: 'e1',
      type: 'ellipse' as const,
      x: 0,
      y: 0,
      width: 100,
      height: 60,
      strokeColor: '#000',
      fillColor: 'transparent',
      strokeWidth: 2,
      opacity: 1,
      roughness: 0,
    };
    const [bx, by] = getElementBorderPoint(ellipse, 100, 30);
    expect(bx).toBeGreaterThan(50);
    expect(by).toBeCloseTo(30, 0);
  });
});

// ── distToShapeBoundary ───────────────────────────────────────────────────────

describe('distToShapeBoundary', () => {
  const b = { x: 0, y: 0, w: 100, h: 60 };

  it('returns 0 for point on rect edge', () => {
    const rect = makeRect('r1', 0, 0, 100, 60);
    expect(distToShapeBoundary(rect, b, 0, 30)).toBeCloseTo(0, 1);
    expect(distToShapeBoundary(rect, b, 50, 0)).toBeCloseTo(0, 1);
  });

  it('returns small value for point inside rect (near edge)', () => {
    const rect = makeRect('r1', 0, 0, 100, 60);
    expect(distToShapeBoundary(rect, b, 1, 30)).toBeCloseTo(1, 1);
  });

  it('returns positive value for ellipse at center', () => {
    const ellipse = {
      id: 'e1',
      type: 'ellipse' as const,
      x: 0,
      y: 0,
      width: 100,
      height: 60,
      strokeColor: '#000',
      fillColor: 'transparent',
      strokeWidth: 2,
      opacity: 1,
      roughness: 0,
    };
    const dist = distToShapeBoundary(ellipse, b, 50, 30);
    expect(dist).toBeGreaterThan(0);
  });
});
