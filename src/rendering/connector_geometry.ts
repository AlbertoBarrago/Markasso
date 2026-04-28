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
