import { describe, expect, it } from 'vitest';
import {
  computeElbowRoute,
  distToQuadraticCurve,
  distToRoute,
  getArrowHeadLength,
  getArrowHeadShape,
  getArrowHeadVector,
  getQuadraticBounds,
  getQuadraticPoint,
  getQuadraticSegment,
  getQuadraticTangent,
  getRouteLength,
  getRoutePointAt,
  type RouteDirection,
  type RoutePoint,
  simplifyRoute,
} from '../src/rendering/connector_geometry';

describe('getArrowHeadVector', () => {
  it('uses the control point to orient the arrowhead at the end of a quadratic line', () => {
    const head = getArrowHeadVector(
      { x: 0, y: 0, x2: 100, y2: 0 },
      { cx: 80, cy: 40 },
      'end',
    );

    expect(head).toEqual({ fromX: 80, fromY: 40, tipX: 100, tipY: 0 });
  });

  it('uses the control point to orient the arrowhead at the start of a quadratic line', () => {
    const head = getArrowHeadVector(
      { x: 0, y: 0, x2: 100, y2: 0 },
      { cx: 20, cy: 40 },
      'start',
    );

    expect(head).toEqual({ fromX: 20, fromY: 40, tipX: 0, tipY: 0 });
  });

  it('falls back to the opposite endpoint when the control point collapses onto the tip', () => {
    const head = getArrowHeadVector(
      { x: 0, y: 0, x2: 100, y2: 0 },
      { cx: 100, cy: 0 },
      'end',
    );

    expect(head).toEqual({ fromX: 0, fromY: 0, tipX: 100, tipY: 0 });
  });

  it('computes the midpoint on a quadratic curve', () => {
    const point = getQuadraticPoint(0, 0, 50, 100, 100, 0, 0.5);
    expect(point.x).toBe(50);
    expect(point.y).toBe(50);
  });

  it('computes the tangent on a quadratic curve', () => {
    const tangent = getQuadraticTangent(0, 0, 50, 100, 100, 0, 0.5);
    expect(tangent.x).toBe(100);
    expect(tangent.y).toBe(0);
  });

  it('extracts a quadratic sub-segment without leaving the source curve', () => {
    const seg = getQuadraticSegment(0, 0, 50, 100, 100, 0, 0.25, 0.75);
    expect(seg).not.toBeNull();
    expect(seg?.x).toBe(25);
    expect(seg?.y).toBeCloseTo(37.5, 5);
    expect(seg?.x2).toBe(75);
    expect(seg?.y2).toBeCloseTo(37.5, 5);
  });

  it('computes tight quadratic bounds', () => {
    const bounds = getQuadraticBounds(0, 0, 50, 100, 100, 0);
    expect(bounds.minX).toBe(0);
    expect(bounds.maxX).toBe(100);
    expect(bounds.minY).toBe(0);
    expect(bounds.maxY).toBe(50);
  });

  it('measures distance to the actual quadratic curve', () => {
    const dist = distToQuadraticCurve(50, 50, 0, 0, 50, 100, 100, 0);
    expect(dist).toBeCloseTo(0, 4);
  });
});

const RIGHT: RouteDirection = { dx: 1, dy: 0 };
const LEFT: RouteDirection = { dx: -1, dy: 0 };
const UP: RouteDirection = { dx: 0, dy: -1 };
const DOWN: RouteDirection = { dx: 0, dy: 1 };

/** Every elbow route must be orthogonal and respect both end directions. */
function expectValidRoute(
  route: RoutePoint[],
  start: RoutePoint,
  startDir: RouteDirection | null,
  end: RoutePoint,
  endDir: RouteDirection | null,
): void {
  expect(route[0]).toEqual(start);
  expect(route[route.length - 1]).toEqual(end);
  for (let i = 1; i < route.length; i++) {
    const [ax, ay] = route[i - 1]!;
    const [bx, by] = route[i]!;
    expect(ax === bx || ay === by).toBe(true);
  }
  if (startDir) {
    const [ax, ay] = route[0]!;
    const [bx, by] = route[1]!;
    expect(Math.sign(bx - ax)).toBe(startDir.dx);
    expect(Math.sign(by - ay)).toBe(startDir.dy);
  }
  if (endDir) {
    const [ax, ay] = route[route.length - 2]!;
    const [bx, by] = route[route.length - 1]!;
    // The last leg travels into the shape, against its outward normal.
    expect(Math.sign(bx - ax)).toBe(-endDir.dx || 0);
    expect(Math.sign(by - ay)).toBe(-endDir.dy || 0);
  }
}

describe('computeElbowRoute', () => {
  it('joins facing horizontal stubs with a Z through the midpoint', () => {
    const route = computeElbowRoute([0, 0], RIGHT, [100, 50], LEFT);
    expect(route).toEqual([
      [0, 0],
      [50, 0],
      [50, 50],
      [100, 50],
    ]);
    expectValidRoute(route, [0, 0], RIGHT, [100, 50], LEFT);
  });

  it('joins perpendicular stubs with a single corner', () => {
    const route = computeElbowRoute([0, 0], RIGHT, [100, 100], UP);
    expect(route).toEqual([
      [0, 0],
      [100, 0],
      [100, 100],
    ]);
  });

  it('uses the mirrored corner when the direct one would double back', () => {
    const route = computeElbowRoute([0, 0], RIGHT, [-100, 100], UP);
    expect(route).toEqual([
      [0, 0],
      [16, 0],
      [16, 84],
      [-100, 84],
      [-100, 100],
    ]);
    expectValidRoute(route, [0, 0], RIGHT, [-100, 100], UP);
  });

  it('detours around when both stubs face away on the same line', () => {
    const route = computeElbowRoute([0, 0], LEFT, [100, 0], RIGHT);
    expectValidRoute(route, [0, 0], LEFT, [100, 0], RIGHT);
    expect(Math.min(...route.map((p) => p[1]))).toBeLessThan(0);
  });

  it('routes free ends along the dominant axis', () => {
    expect(computeElbowRoute([0, 0], null, [100, 40], null)).toEqual([
      [0, 0],
      [50, 0],
      [50, 40],
      [100, 40],
    ]);
    expect(computeElbowRoute([0, 0], null, [40, 100], null)).toEqual([
      [0, 0],
      [0, 50],
      [40, 50],
      [40, 100],
    ]);
  });

  it('turns once toward a free end', () => {
    expect(computeElbowRoute([0, 0], DOWN, [100, 100], null)).toEqual([
      [0, 0],
      [0, 100],
      [100, 100],
    ]);
  });

  it('produces valid routes for every pair of directions', () => {
    const dirs = [UP, RIGHT, DOWN, LEFT];
    const ends: RoutePoint[] = [
      [200, 120],
      [-150, 80],
      [60, -200],
      [-90, -40],
    ];
    for (const sd of dirs) {
      for (const ed of dirs) {
        for (const end of ends) {
          const route = computeElbowRoute([0, 0], sd, end, ed);
          expectValidRoute(route, [0, 0], sd, end, ed);
        }
      }
    }
  });
});

describe('route helpers', () => {
  const route: RoutePoint[] = [
    [0, 0],
    [100, 0],
    [100, 100],
  ];

  it('simplifies duplicates and collinear points', () => {
    expect(
      simplifyRoute([
        [0, 0],
        [0, 0],
        [50, 0],
        [100, 0],
        [100, 100],
      ]),
    ).toEqual(route);
  });

  it('measures and samples along the route', () => {
    expect(getRouteLength(route)).toBe(200);
    expect(getRoutePointAt(route, 0.5)).toEqual([100, 0]);
    expect(getRoutePointAt(route, 0.75)).toEqual([100, 50]);
  });

  it('measures the distance to the closest segment', () => {
    expect(distToRoute(110, 50, route)).toBe(10);
  });
});

describe('getArrowHeadShape', () => {
  // Horizontal connector pointing right, tip at (100, 0); head length 12.
  const shape = (style: Parameters<typeof getArrowHeadShape>[0]) =>
    getArrowHeadShape(style, 0, 0, 100, 0, 2);

  it('keeps the classic open head geometry', () => {
    const open = shape('open');
    expect(open.kind).toBe('polyline');
    if (open.kind !== 'polyline') return;
    const len = getArrowHeadLength(2);
    expect(open.points[1]).toEqual([100, 0]);
    expect(open.points[0]![0]).toBeCloseTo(100 - len * Math.cos(Math.PI / 6));
    expect(open.points[0]![1]).toBeCloseTo(len * Math.sin(Math.PI / 6));
    expect(open.points[2]![1]).toBeCloseTo(-len * Math.sin(Math.PI / 6));
  });

  it('closes triangles and fills only the filled variant', () => {
    const hollow = shape('triangle');
    const filled = shape('triangleFilled');
    expect(hollow).toMatchObject({ kind: 'polygon', filled: false });
    expect(filled).toMatchObject({ kind: 'polygon', filled: true });
  });

  it('builds a diamond that ends 1.2 head lengths behind the tip', () => {
    const diamond = shape('diamondFilled');
    expect(diamond.kind).toBe('polygon');
    if (diamond.kind !== 'polygon') return;
    const xs = diamond.points.map((p) => p[0]);
    expect(Math.max(...xs)).toBeCloseTo(100);
    expect(Math.min(...xs)).toBeCloseTo(100 - getArrowHeadLength(2) * 1.2);
  });

  it('places the circle so it touches the tip', () => {
    const circle = shape('circle');
    expect(circle.kind).toBe('circle');
    if (circle.kind !== 'circle') return;
    expect(circle.cx + circle.r).toBeCloseTo(100);
    expect(circle.cy).toBeCloseTo(0);
  });

  it('follows the connector direction', () => {
    const up = getArrowHeadShape('triangle', 0, 100, 0, 0, 2);
    if (up.kind !== 'polygon') throw new Error('expected polygon');
    // Pointing up: every back point sits below the tip.
    for (const [, y] of up.points.slice(1)) expect(y).toBeGreaterThan(0);
  });
});
