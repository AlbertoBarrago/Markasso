import type { ArrowHeadStyle } from '../elements/element';

export interface ConnectorEndpoints {
  readonly x: number;
  readonly y: number;
  readonly x2: number;
  readonly y2: number;
}

export interface QuadraticControlPoint {
  readonly cx?: number;
  readonly cy?: number;
}

export interface ArrowHeadVector {
  readonly fromX: number;
  readonly fromY: number;
  readonly tipX: number;
  readonly tipY: number;
}

export interface QuadraticSegment {
  readonly x: number;
  readonly y: number;
  readonly cx: number;
  readonly cy: number;
  readonly x2: number;
  readonly y2: number;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function quadraticExtremum(p0: number, p1: number, p2: number): number | null {
  const denom = p0 - 2 * p1 + p2;
  if (Math.abs(denom) < 0.000001) return null;
  const t = (p0 - p1) / denom;
  return t > 0 && t < 1 ? t : null;
}

function splitQuadraticAt(
  x: number,
  y: number,
  cx: number,
  cy: number,
  x2: number,
  y2: number,
  t: number,
): { left: QuadraticSegment; right: QuadraticSegment } {
  const p01x = lerp(x, cx, t);
  const p01y = lerp(y, cy, t);
  const p12x = lerp(cx, x2, t);
  const p12y = lerp(cy, y2, t);
  const p012x = lerp(p01x, p12x, t);
  const p012y = lerp(p01y, p12y, t);

  return {
    left: { x, y, cx: p01x, cy: p01y, x2: p012x, y2: p012y },
    right: { x: p012x, y: p012y, cx: p12x, cy: p12y, x2, y2 },
  };
}

export function getArrowHeadVector(
  endpoints: ConnectorEndpoints,
  control: QuadraticControlPoint,
  placement: 'start' | 'end',
): ArrowHeadVector {
  const tipX = placement === 'end' ? endpoints.x2 : endpoints.x;
  const tipY = placement === 'end' ? endpoints.y2 : endpoints.y;

  let fromX = placement === 'end' ? endpoints.x : endpoints.x2;
  let fromY = placement === 'end' ? endpoints.y : endpoints.y2;

  if (control.cx !== undefined && control.cy !== undefined) {
    fromX = control.cx;
    fromY = control.cy;
  }

  if (Math.hypot(tipX - fromX, tipY - fromY) < 0.001) {
    fromX = placement === 'end' ? endpoints.x : endpoints.x2;
    fromY = placement === 'end' ? endpoints.y : endpoints.y2;
  }

  return { fromX, fromY, tipX, tipY };
}

export function getQuadraticPoint(
  x: number,
  y: number,
  cx: number,
  cy: number,
  x2: number,
  y2: number,
  t: number,
): { x: number; y: number } {
  const mt = 1 - t;
  return {
    x: mt * mt * x + 2 * mt * t * cx + t * t * x2,
    y: mt * mt * y + 2 * mt * t * cy + t * t * y2,
  };
}

export function getQuadraticTangent(
  x: number,
  y: number,
  cx: number,
  cy: number,
  x2: number,
  y2: number,
  t: number,
): { x: number; y: number } {
  return {
    x: 2 * (1 - t) * (cx - x) + 2 * t * (x2 - cx),
    y: 2 * (1 - t) * (cy - y) + 2 * t * (y2 - cy),
  };
}

export function getQuadraticLength(
  x: number,
  y: number,
  cx: number,
  cy: number,
  x2: number,
  y2: number,
  steps = 24,
): number {
  let length = 0;
  let prev = { x, y };
  for (let i = 1; i <= steps; i++) {
    const point = getQuadraticPoint(x, y, cx, cy, x2, y2, i / steps);
    length += Math.hypot(point.x - prev.x, point.y - prev.y);
    prev = point;
  }
  return length;
}

export function getQuadraticBounds(
  x: number,
  y: number,
  cx: number,
  cy: number,
  x2: number,
  y2: number,
): { minX: number; minY: number; maxX: number; maxY: number } {
  const xs = [x, x2];
  const ys = [y, y2];

  const tx = quadraticExtremum(x, cx, x2);
  const ty = quadraticExtremum(y, cy, y2);
  if (tx !== null) xs.push(getQuadraticPoint(x, y, cx, cy, x2, y2, tx).x);
  if (ty !== null) ys.push(getQuadraticPoint(x, y, cx, cy, x2, y2, ty).y);

  return {
    minX: Math.min(...xs),
    minY: Math.min(...ys),
    maxX: Math.max(...xs),
    maxY: Math.max(...ys),
  };
}

export function distToQuadraticCurve(
  px: number,
  py: number,
  x: number,
  y: number,
  cx: number,
  cy: number,
  x2: number,
  y2: number,
  steps = 24,
): number {
  let minDist = Infinity;
  let prev = { x, y };
  for (let i = 1; i <= steps; i++) {
    const point = getQuadraticPoint(x, y, cx, cy, x2, y2, i / steps);
    const dist = distToSegment(px, py, prev.x, prev.y, point.x, point.y);
    if (dist < minDist) minDist = dist;
    prev = point;
  }
  return minDist;
}

function distToSegment(
  px: number,
  py: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(px - x1, py - y1);
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lenSq));
  const qx = x1 + t * dx;
  const qy = y1 + t * dy;
  return Math.hypot(px - qx, py - qy);
}

export function getQuadraticSegment(
  x: number,
  y: number,
  cx: number,
  cy: number,
  x2: number,
  y2: number,
  tStart: number,
  tEnd: number,
): QuadraticSegment | null {
  if (tEnd <= tStart) return null;
  if (tStart <= 0 && tEnd >= 1) return { x, y, cx, cy, x2, y2 };

  const clampedStart = Math.max(0, Math.min(1, tStart));
  const clampedEnd = Math.max(0, Math.min(1, tEnd));
  if (clampedEnd <= clampedStart) return null;

  const { left } = splitQuadraticAt(x, y, cx, cy, x2, y2, clampedEnd);
  if (clampedStart <= 0) return left;

  const localT = clampedStart / clampedEnd;
  const { right } = splitQuadraticAt(
    left.x,
    left.y,
    left.cx,
    left.cy,
    left.x2,
    left.y2,
    localT,
  );
  return right;
}

// ── Orthogonal (elbow) routing ────────────────────────────────────────────────

export type RoutePoint = readonly [number, number];

/** Axis-aligned unit direction a connector leaves (or enters) a shape by. */
export interface RouteDirection {
  readonly dx: -1 | 0 | 1;
  readonly dy: -1 | 0 | 1;
}

/** Length of the straight stub that clears the shape before the first turn. */
export const ELBOW_STUB = 16;

function sign(n: number): -1 | 0 | 1 {
  return n > 0 ? 1 : n < 0 ? -1 : 0;
}

/** Drops repeated points and the middle point of collinear triples. */
export function simplifyRoute(points: ReadonlyArray<RoutePoint>): RoutePoint[] {
  const deduped: RoutePoint[] = [];
  for (const p of points) {
    const last = deduped[deduped.length - 1];
    if (!last || Math.hypot(p[0] - last[0], p[1] - last[1]) > 0.5) {
      deduped.push(p);
    }
  }
  const out: RoutePoint[] = [];
  for (const p of deduped) {
    const a = out[out.length - 2];
    const b = out[out.length - 1];
    if (a && b) {
      const cross =
        (b[0] - a[0]) * (p[1] - b[1]) - (b[1] - a[1]) * (p[0] - b[0]);
      if (Math.abs(cross) < 0.01) out.pop();
    }
    out.push(p);
  }
  return out;
}

/**
 * Orthogonal route from `start` to `end`. `startDir` is the direction the
 * connector leaves its start shape, `endDir` the outward normal of the side
 * it enters the end shape by; null means the end is free (not attached).
 *
 * Attached ends get a stub of `stub` length so the first/last turn never
 * hugs the shape. Perpendicular stubs are joined with an L (the mirrored L
 * when the direct one would double back); parallel stubs with a Z through
 * the midpoint, or a detour when they face away from each other. No obstacle avoidance: the route is a pure function of the two
 * ends, which keeps it deterministic across live-session peers.
 */
export function computeElbowRoute(
  start: RoutePoint,
  startDir: RouteDirection | null,
  end: RoutePoint,
  endDir: RouteDirection | null,
  stub = ELBOW_STUB,
): RoutePoint[] {
  const p1: RoutePoint = startDir
    ? [start[0] + startDir.dx * stub, start[1] + startDir.dy * stub]
    : start;
  const p2: RoutePoint = endDir
    ? [end[0] + endDir.dx * stub, end[1] + endDir.dy * stub]
    : end;
  const dx = p2[0] - p1[0];
  const dy = p2[1] - p1[1];

  // Orientation of the leg leaving p1 and of the leg arriving at p2.
  let h1: boolean;
  let h2: boolean;
  if (startDir && endDir) {
    h1 = startDir.dx !== 0;
    h2 = endDir.dx !== 0;
  } else if (startDir) {
    h1 = startDir.dx !== 0;
    h2 = !h1;
  } else if (endDir) {
    h2 = endDir.dx !== 0;
    h1 = !h2;
  } else {
    h1 = Math.abs(dx) >= Math.abs(dy);
    h2 = h1;
  }

  // A leg is valid when it travels away from its start shape and toward the
  // outside of its end shape (i.e. against the end's outward normal).
  const startOk = (travel: -1 | 0 | 1, axis: 'x' | 'y'): boolean =>
    !startDir ||
    travel === 0 ||
    travel === (axis === 'x' ? startDir.dx : startDir.dy);
  const endOk = (travel: -1 | 0 | 1, axis: 'x' | 'y'): boolean =>
    !endDir ||
    travel === 0 ||
    travel === -(axis === 'x' ? endDir.dx : endDir.dy);

  const midX = (p1[0] + p2[0]) / 2;
  const midY = (p1[1] + p2[1]) / 2;
  // Detour level used when both stubs face away from each other on one axis.
  const detourY = Math.abs(dy) < 1 ? p1[1] - stub * 2 : midY;
  const detourX = Math.abs(dx) < 1 ? p1[0] - stub * 2 : midX;

  let middle: RoutePoint[];
  if (h1 && h2) {
    middle =
      startOk(sign(dx), 'x') && endOk(sign(dx), 'x')
        ? [
            [midX, p1[1]],
            [midX, p2[1]],
          ]
        : [
            [p1[0], detourY],
            [p2[0], detourY],
          ];
  } else if (!h1 && !h2) {
    middle =
      startOk(sign(dy), 'y') && endOk(sign(dy), 'y')
        ? [
            [p1[0], midY],
            [p2[0], midY],
          ]
        : [
            [detourX, p1[1]],
            [detourX, p2[1]],
          ];
  } else if (h1) {
    // The mirrored L turns right after each stub, so it is always valid.
    middle =
      startOk(sign(dx), 'x') && endOk(sign(dy), 'y')
        ? [[p2[0], p1[1]]]
        : [[p1[0], p2[1]]];
  } else {
    middle =
      startOk(sign(dy), 'y') && endOk(sign(dx), 'x')
        ? [[p1[0], p2[1]]]
        : [[p2[0], p1[1]]];
  }

  return simplifyRoute([start, p1, ...middle, p2, end]);
}

export function getRouteLength(points: ReadonlyArray<RoutePoint>): number {
  let len = 0;
  for (let i = 1; i < points.length; i++) {
    len += Math.hypot(
      points[i]![0] - points[i - 1]![0],
      points[i]![1] - points[i - 1]![1],
    );
  }
  return len;
}

/** Point at the given fraction (0-1) of the route's length. */
export function getRoutePointAt(
  points: ReadonlyArray<RoutePoint>,
  t: number,
): RoutePoint {
  const first = points[0] ?? [0, 0];
  let remaining = getRouteLength(points) * Math.max(0, Math.min(1, t));
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!;
    const b = points[i]!;
    const seg = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (remaining <= seg && seg > 0) {
      const k = remaining / seg;
      return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k];
    }
    remaining -= seg;
  }
  return points[points.length - 1] ?? first;
}

export function distToRoute(
  px: number,
  py: number,
  points: ReadonlyArray<RoutePoint>,
): number {
  let min = Infinity;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!;
    const b = points[i]!;
    min = Math.min(min, distToSegment(px, py, a[0], a[1], b[0], b[1]));
  }
  return min;
}

// ── Arrowheads ────────────────────────────────────────────────────────────────

export type ArrowHeadShape =
  | { readonly kind: 'polyline'; readonly points: RoutePoint[] }
  | {
      readonly kind: 'polygon';
      readonly points: RoutePoint[];
      readonly filled: boolean;
    }
  | {
      readonly kind: 'circle';
      readonly cx: number;
      readonly cy: number;
      readonly r: number;
    };

/** Head size, shared by every style so switching styles keeps the scale. */
export function getArrowHeadLength(strokeWidth: number): number {
  return Math.max(12, strokeWidth * 4);
}

/**
 * Geometry of an arrowhead whose tip sits at (tipX, tipY), pointing away
 * from (fromX, fromY). Closed styles extend backward over the connector, so
 * renderers mask the shaft out of their area instead of shortening it.
 */
export function getArrowHeadShape(
  style: ArrowHeadStyle,
  fromX: number,
  fromY: number,
  tipX: number,
  tipY: number,
  strokeWidth: number,
): ArrowHeadShape {
  const len = getArrowHeadLength(strokeWidth);
  const angle = Math.atan2(tipY - fromY, tipX - fromX);
  const ux = Math.cos(angle);
  const uy = Math.sin(angle);
  const back = (d: number, side: number): RoutePoint => [
    tipX - ux * d - uy * side,
    tipY - uy * d + ux * side,
  ];
  const tip: RoutePoint = [tipX, tipY];
  // ±30° wings, as in the original open head.
  const wingBack = len * Math.cos(Math.PI / 6);
  const wingSide = len * Math.sin(Math.PI / 6);

  switch (style) {
    case 'open':
      return {
        kind: 'polyline',
        points: [back(wingBack, wingSide), tip, back(wingBack, -wingSide)],
      };
    case 'triangle':
    case 'triangleFilled':
      return {
        kind: 'polygon',
        points: [tip, back(wingBack, wingSide), back(wingBack, -wingSide)],
        filled: style === 'triangleFilled',
      };
    case 'diamond':
    case 'diamondFilled':
      return {
        kind: 'polygon',
        points: [
          tip,
          back(len * 0.6, len * 0.35),
          back(len * 1.2, 0),
          back(len * 0.6, -len * 0.35),
        ],
        filled: style === 'diamondFilled',
      };
    case 'circle': {
      const r = len * 0.35;
      return { kind: 'circle', cx: tipX - ux * r, cy: tipY - uy * r, r };
    }
  }
}
