import { describe, expect, it } from 'vitest';
import { createViewport } from '../src/core/viewport';
import type {
  ArrowElement,
  LineElement,
  RectangleElement,
  ShapeElement,
} from '../src/elements/element';
import type { Handle } from '../src/rendering/draw_selection';
import {
  anchorToWorld,
  distToShapeBoundary,
  findConnectorSnapTarget,
  findNearestElementSnapTarget,
  getElementBorderPoint,
  getElementBounds,
  getElementCenter,
  getElementPorts,
  getNearestElementBorderPoint,
  getRotationHandleScreen,
  getSelectionHandles,
  hitTestEndpoint,
  hitTestHandle,
  resolveArrowEndpoints,
  resolveConnectorRoute,
  worldToAnchor,
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
    const arrow = makeArrow({
      x: 999,
      y: 999,
      x2: 999,
      y2: 999,
      startElementId: 'r1',
      endElementId: 'r2',
    });
    const result = resolveArrowEndpoints(arrow, [r1, r2]);
    expect(result.x).toBeCloseTo(930 / 13, 5); // ≈ 71.54 (r1 bottom-right)
    expect(result.y).toBe(60); // r1 bottom edge
    expect(result.x2).toBeCloseTo(12310 / 39, 5); // ≈ 315.64 (r2 top-left)
    expect(result.y2).toBe(400); // r2 top edge
  });

  it('preserves stored border anchors when connected endpoints were snapped by cursor', () => {
    const r1 = makeRect('r1', 0, 0, 100, 60);
    const r2 = makeRect('r2', 300, 400, 60, 40);
    const arrow = makeArrow({
      x: 0,
      y: 12,
      x2: 330,
      y2: 400,
      startElementId: 'r1',
      endElementId: 'r2',
    });
    const result = resolveArrowEndpoints(arrow, [r1, r2]);
    expect(result.x).toBe(0);
    expect(result.y).toBe(12);
    expect(result.x2).toBe(330);
    expect(result.y2).toBe(400);
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

describe('getNearestElementBorderPoint', () => {
  it('returns the nearest rect edge point under the cursor', () => {
    const rect = makeRect('r1', 0, 0, 100, 60);
    const [x, y] = getNearestElementBorderPoint(rect, -5, 12);
    expect(x).toBe(0);
    expect(y).toBe(12);
  });

  it('uses the nearest rect edge when cursor is inside the shape', () => {
    const rect = makeRect('r1', 0, 0, 100, 60);
    const [x, y] = getNearestElementBorderPoint(rect, 8, 20);
    expect(x).toBe(0);
    expect(y).toBe(20);
  });

  it('projects ellipse snap to the visual boundary', () => {
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
    const [x, y] = getNearestElementBorderPoint(ellipse, 100, 30);
    expect(x).toBeCloseTo(100, 1);
    expect(y).toBeCloseTo(30, 1);
  });
});

describe('findNearestElementSnapTarget', () => {
  it('returns the closest border snap target within radius', () => {
    const r1 = makeRect('r1', 0, 0, 100, 60);
    const r2 = makeRect('r2', 200, 0, 100, 60);
    const snap = findNearestElementSnapTarget([r1, r2], 104, 12, 20);
    expect(snap).toMatchObject({ elementId: 'r1', worldX: 100, worldY: 12 });
  });

  it('returns null when no border is within radius', () => {
    const rect = makeRect('r1', 0, 0, 100, 60);
    expect(findNearestElementSnapTarget([rect], 150, 30, 20)).toBeNull();
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

function makeShape(overrides: Partial<ShapeElement> = {}): ShapeElement {
  return {
    id: 's1',
    type: 'shape',
    kind: 'terminator',
    x: 0,
    y: 0,
    width: 200,
    height: 100,
    strokeColor: '#000',
    fillColor: 'transparent',
    strokeWidth: 2,
    opacity: 1,
    roughness: 0,
    ...overrides,
  };
}

describe('flowchart shape snapping', () => {
  it('uses the shape outline for the border point', () => {
    const data = makeShape({ kind: 'data', x: 100, y: 100 });
    const [x, y] = getElementBorderPoint(data, 1000, 150);
    expect(x).toBeCloseTo(280);
    expect(y).toBeCloseTo(150);
  });

  it('normalizes negative width/height boxes', () => {
    const flipped = makeShape({ x: 200, y: 100, width: -200, height: -100 });
    expect(getElementBounds(flipped)).toEqual({ x: 0, y: 0, w: 200, h: 100 });
    const [x, y] = getElementBorderPoint(flipped, 1000, 50);
    expect(x).toBeCloseTo(200);
    expect(y).toBeCloseTo(50);
  });

  it('accounts for rotation', () => {
    const rotated = makeShape({ rotation: Math.PI / 2 });
    // World "down" is local "right": the cap tip, rotated back below center.
    const [x, y] = getElementBorderPoint(rotated, 100, 500);
    expect(x).toBeCloseTo(100);
    expect(y).toBeCloseTo(150);
  });

  it('snaps the nearest border point onto the outline', () => {
    const db = makeShape({ kind: 'database' });
    const [x, y] = getNearestElementBorderPoint(db, 100, -10);
    expect(x).toBeCloseTo(100);
    expect(y).toBeCloseTo(0);
    expect(distToShapeBoundary(db, getElementBounds(db), 100, -10)).toBeCloseTo(
      10,
    );
  });

  it('is a snap target for connectors', () => {
    const shape = makeShape();
    const target = findNearestElementSnapTarget([shape], 205, 50, 10);
    expect(target?.elementId).toBe('s1');
    expect(target?.worldX).toBeCloseTo(200);
  });

  it('resolves bound connector endpoints on the outline', () => {
    const shape = makeShape({ kind: 'preparation' });
    const arrow = makeArrow({
      x: 500,
      y: 50,
      x2: 500,
      y2: 50,
      startElementId: 's1',
    });
    const pts = resolveArrowEndpoints(arrow, [shape, arrow]);
    expect(pts.x).toBeCloseTo(200);
    expect(pts.y).toBeCloseTo(50);
  });
});

describe('connector anchors', () => {
  it('exposes four cardinal ports on the outline', () => {
    const ports = getElementPorts(makeRect('r1', 0, 0, 100, 60));
    const expected = [
      [50, 0],
      [100, 30],
      [50, 60],
      [0, 30],
    ];
    ports.forEach((p, i) => {
      expect(p.worldX).toBeCloseTo(expected[i]![0]!);
      expect(p.worldY).toBeCloseTo(expected[i]![1]!);
    });
    expect(ports[1]!.anchor.x).toBeCloseTo(1);
    expect(ports[1]!.anchor.y).toBeCloseTo(0.5);
  });

  it('has no ports on connectors', () => {
    expect(getElementPorts(makeLine())).toEqual([]);
  });

  it('rotates ports with the element', () => {
    const rotated: RectangleElement = {
      ...makeRect('r1', 0, 0, 100, 60),
      rotation: Math.PI / 2,
    };
    const [north] = getElementPorts(rotated);
    // Local north of a 90deg-rotated box points to world east.
    expect(north!.worldX).toBeCloseTo(80);
    expect(north!.worldY).toBeCloseTo(30);
    expect(north!.anchor.x).toBeCloseTo(0.5);
    expect(north!.anchor.y).toBeCloseTo(0);
  });

  it('round-trips world points through anchors', () => {
    const rect = makeRect('r1', 10, 20, 100, 60);
    const anchor = worldToAnchor(rect, 110, 35);
    expect(anchor).toEqual({ x: 1, y: 0.25 });
    expect(anchorToWorld(rect, anchor)).toEqual([110, 35]);
  });

  it('prefers a port over the plain border inside the port radius', () => {
    const rect = makeRect('r1', 0, 0, 100, 60);
    const port = findConnectorSnapTarget([rect], 103, 28, 20, 10);
    expect(port).toMatchObject({ worldX: 100, worldY: 30 });
    expect(port?.anchor).toEqual({ x: 1, y: 0.5 });

    const border = findConnectorSnapTarget([rect], 103, 10, 20, 10);
    expect(border).toMatchObject({ worldX: 100, worldY: 10 });
    expect(border?.anchor).toBeUndefined();
  });

  it('keeps a pinned end on its port after the element moves', () => {
    const moved = makeRect('r1', 300, 300, 100, 60);
    const other = makeRect('r2', 0, 0, 100, 60);
    const line = makeLine({
      x: 50,
      y: 0,
      x2: 500,
      y2: 500,
      startElementId: 'r1',
      startAnchor: { x: 0.5, y: 0 },
      endElementId: 'r2',
    });
    const pts = resolveArrowEndpoints(line, [moved, other, line]);
    expect([pts.x, pts.y]).toEqual([350, 300]);
    // The floating end faces the pinned point, not the other center.
    const [ex, ey] = getElementBorderPoint(other, 350, 300);
    expect(pts.x2).toBeCloseTo(ex);
    expect(pts.y2).toBeCloseTo(ey);
  });

  it('keeps a pinned end on the outline after a resize', () => {
    const data = makeShape({ kind: 'data', width: 400, height: 100 });
    const line = makeLine({
      startElementId: 's1',
      startAnchor: { x: 0.9, y: 0.5 },
    });
    const pts = resolveArrowEndpoints(line, [data, line]);
    // skew = 50: (360, 50) projects onto the slanted side (400,0)→(350,100)
    expect(pts.x).toBeCloseTo(372);
    expect(pts.y).toBeCloseTo(56);
    expect(
      distToShapeBoundary(data, getElementBounds(data), pts.x, pts.y),
    ).toBeCloseTo(0);
  });
});

describe('resolveConnectorRoute', () => {
  const r1 = makeRect('r1', 0, 0, 100, 60);
  const r2 = makeRect('r2', 300, 200, 100, 60);

  const elbow = (extra: Partial<Parameters<typeof makeLine>[0]> = {}) =>
    makeLine({
      x: 50,
      y: 30,
      x2: 60,
      y2: 230,
      routing: 'elbow',
      startElementId: 'top',
      endElementId: 'bottom',
      ...extra,
    });

  it('runs straight between nearly aligned shapes instead of stepping', () => {
    const top = makeRect('top', 0, 0, 160, 70);
    const bottom = makeRect('bottom', 10, 200, 160, 70);
    const line = elbow();
    const route = resolveConnectorRoute(line, [top, bottom, line]);
    // The start's center (x = 80) lies on the bottom shape's top side.
    expect(route).toEqual([
      [80, 70],
      [80, 200],
    ]);
  });

  it('meets in the overlap when neither center fits the other side', () => {
    const top = makeRect('top', 0, 0, 100, 70);
    const bottom = makeRect('bottom', 80, 200, 100, 70);
    const line = elbow();
    const route = resolveConnectorRoute(line, [top, bottom, line]);
    expect(route).toEqual([
      [90, 70],
      [90, 200],
    ]);
  });

  it('keeps the stepped route when the sides do not overlap', () => {
    const top = makeRect('top', 0, 0, 100, 70);
    const bottom = makeRect('bottom', 140, 300, 100, 70);
    const line = elbow();
    const route = resolveConnectorRoute(line, [top, bottom, line]);
    expect(route.length).toBe(4);
    expect(route[0]).toEqual([50, 70]);
  });

  it('leaves pinned ends where they are', () => {
    const top = makeRect('top', 0, 0, 160, 70);
    const bottom = makeRect('bottom', 10, 200, 160, 70);
    const line = elbow({ startAnchor: { x: 0.5, y: 1 } });
    const route = resolveConnectorRoute(line, [top, bottom, line]);
    expect(route[0]).toEqual([80, 70]);
    expect(route[route.length - 1]).toEqual([90, 200]);
  });

  it('returns the two ends for straight connectors', () => {
    const line = makeLine({ x: 0, y: 0, x2: 50, y2: 50 });
    expect(resolveConnectorRoute(line, [line])).toEqual([
      [0, 0],
      [50, 50],
    ]);
  });

  it('attaches floating elbow ends to the facing mid-side ports', () => {
    const line = makeLine({
      x: 50,
      y: 30,
      x2: 350,
      y2: 230,
      routing: 'elbow',
      startElementId: 'r1',
      endElementId: 'r2',
    });
    const route = resolveConnectorRoute(line, [r1, r2, line]);
    expect(route.length).toBe(4);
    const rounded = route.map(([x, y]) => [Math.round(x), Math.round(y)]);
    // The horizontal gap (200) beats the vertical one (140): leave right,
    // enter left, turn in the corridor between the shapes.
    expect(rounded).toEqual([
      [100, 30],
      [200, 30],
      [200, 230],
      [300, 230],
    ]);
    expect(getElementBounds(line, [r1, r2, line])).toMatchObject({
      x: 100,
      w: 200,
    });
  });

  it('routes a wide shape sideways instead of across its neighbor below', () => {
    // Orders above Payments, Postgres to the right (the MCP e2e layout).
    const orders = makeRect('orders', 492, 2, 160, 70);
    const payments = makeRect('payments', 492, 132, 160, 70);
    const db = makeRect('db', 752, 124, 160, 80);
    const line = makeLine({
      routing: 'elbow',
      startElementId: 'orders',
      endElementId: 'db',
    });
    const route = resolveConnectorRoute(line, [orders, payments, db, line]);
    expect(route[0]).toEqual([652, 37]);
    // No point of the route enters the Payments box.
    for (const [x, y] of route) {
      const inside = x > 492 && x < 652 && y > 132 && y < 202;
      expect(inside).toBe(false);
    }
  });

  it('keeps vertical stacks on their top and bottom sides', () => {
    const top = makeRect('top', 0, 0, 160, 60);
    const below = makeRect('below', 20, 200, 160, 60);
    const line = makeLine({
      routing: 'elbow',
      startElementId: 'top',
      endElementId: 'below',
    });
    const route = resolveConnectorRoute(line, [top, below, line]);
    expect(route[0]).toEqual([80, 60]);
    // Enters through the top side, straight below the start (no step).
    expect(route[route.length - 1]).toEqual([80, 200]);
  });

  it('leaves a pinned elbow end by the side of its anchor', () => {
    const line = makeLine({
      x: 100,
      y: 30,
      x2: 350,
      y2: 230,
      routing: 'elbow',
      startElementId: 'r1',
      startAnchor: { x: 1, y: 0.5 },
      endElementId: 'r2',
    });
    const route = resolveConnectorRoute(line, [r1, r2, line]);
    expect(route[0]![0]).toBeCloseTo(100);
    expect(route[0]![1]).toBeCloseTo(30);
    // First leg heads right, out of the anchored side.
    expect(route[1]![0]).toBeGreaterThan(100);
    expect(route[1]![1]).toBeCloseTo(30);
  });
});
