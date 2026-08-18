// Builds a filled, variable-width outline polygon for a freehand stroke,
// instead of stroking a fixed-width line. The stored points are usually
// sparse (RDP-simplified in pen_tool.ts), so the polyline between them is
// first reconstructed as a Catmull-Rom curve, then flattened into a dense
// centerline with an interpolated per-sample radius (from pressure), and
// finally offset left/right along the local normal to form a ribbon with
// rounded caps.

const CATMULL_ROM_TENSION = 0.5;
const DEFAULT_SAMPLE_STEP = 3; // world units between flattened curve samples
const DEFAULT_MIN_RADIUS_RATIO = 0.15; // never taper below this fraction of full width
const CAP_SEGMENTS = 8;

type Point = readonly [number, number];

export interface FreehandOutlineOptions {
  sampleStep?: number;
  minRadiusRatio?: number;
}

export function buildFreehandOutline(
  points: ReadonlyArray<Point>,
  pressures: ReadonlyArray<number> | undefined,
  strokeWidth: number,
  options: FreehandOutlineOptions = {},
): Point[] {
  if (points.length === 0) return [];

  const sampleStep = options.sampleStep ?? DEFAULT_SAMPLE_STEP;
  const minRadiusRatio = options.minRadiusRatio ?? DEFAULT_MIN_RADIUS_RATIO;
  const halfWidth = strokeWidth / 2;
  const minRadius = Math.max(halfWidth * minRadiusRatio, 0.35);

  const p =
    pressures && pressures.length === points.length
      ? pressures
      : points.map(() => 0.7);

  if (points.length === 1) {
    const r = Math.max(halfWidth * p[0]!, minRadius);
    return circlePolygon(points[0]!, r);
  }

  const { centerline, radius } = flattenToCenterline(
    points,
    p,
    sampleStep,
    halfWidth,
    minRadius,
  );

  if (centerline.length < 2) {
    return circlePolygon(centerline[0] ?? points[0]!, radius[0] ?? minRadius);
  }

  return buildRibbon(centerline, radius);
}

function circlePolygon(center: Point, radius: number, segments = 16): Point[] {
  const out: Point[] = [];
  for (let i = 0; i < segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    out.push([
      center[0] + radius * Math.cos(a),
      center[1] + radius * Math.sin(a),
    ]);
  }
  return out;
}

function flattenToCenterline(
  points: ReadonlyArray<Point>,
  pressures: ReadonlyArray<number>,
  sampleStep: number,
  halfWidth: number,
  minRadius: number,
): { centerline: Point[]; radius: number[] } {
  const centerline: Point[] = [];
  const radius: number[] = [];
  const n = points.length;

  for (let i = 0; i < n - 1; i++) {
    const p0 = points[Math.max(0, i - 1)]!;
    const p1 = points[i]!;
    const p2 = points[i + 1]!;
    const p3 = points[Math.min(n - 1, i + 2)]!;

    const cp1x = p1[0] + ((p2[0] - p0[0]) * CATMULL_ROM_TENSION) / 3;
    const cp1y = p1[1] + ((p2[1] - p0[1]) * CATMULL_ROM_TENSION) / 3;
    const cp2x = p2[0] - ((p3[0] - p1[0]) * CATMULL_ROM_TENSION) / 3;
    const cp2y = p2[1] - ((p3[1] - p1[1]) * CATMULL_ROM_TENSION) / 3;

    const segLen = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
    const steps = Math.max(1, Math.round(segLen / sampleStep));
    const startK = i === 0 ? 0 : 1;

    for (let k = startK; k <= steps; k++) {
      const t = k / steps;
      const mt = 1 - t;
      const x =
        mt * mt * mt * p1[0] +
        3 * mt * mt * t * cp1x +
        3 * mt * t * t * cp2x +
        t * t * t * p2[0];
      const y =
        mt * mt * mt * p1[1] +
        3 * mt * mt * t * cp1y +
        3 * mt * t * t * cp2y +
        t * t * t * p2[1];
      const pr = pressures[i]! * mt + pressures[i + 1]! * t;
      centerline.push([x, y]);
      radius.push(Math.min(halfWidth, Math.max(minRadius, halfWidth * pr)));
    }
  }

  return { centerline, radius };
}

function buildRibbon(centerline: Point[], radius: number[]): Point[] {
  const n = centerline.length;
  const normals: Point[] = new Array(n);
  const tangents: Point[] = new Array(n);

  for (let i = 0; i < n; i++) {
    const a = centerline[Math.max(0, i - 1)]!;
    const b = centerline[Math.min(n - 1, i + 1)]!;
    let tx = b[0] - a[0];
    let ty = b[1] - a[1];
    const len = Math.hypot(tx, ty) || 1;
    tx /= len;
    ty /= len;
    tangents[i] = [tx, ty];
    normals[i] = [-ty, tx];
  }

  const left: Point[] = new Array(n);
  const right: Point[] = new Array(n);
  for (let i = 0; i < n; i++) {
    const c = centerline[i]!;
    const [nx, ny] = normals[i]!;
    const r = radius[i]!;
    left[i] = [c[0] + nx * r, c[1] + ny * r];
    right[i] = [c[0] - nx * r, c[1] - ny * r];
  }

  const endCap = roundCap(
    centerline[n - 1]!,
    normals[n - 1]!,
    tangents[n - 1]!,
    radius[n - 1]!,
    1,
  );
  const startCap = roundCap(
    centerline[0]!,
    normals[0]!,
    tangents[0]!,
    radius[0]!,
    -1,
  );

  const rightReversed = right.slice().reverse();
  return [...left, ...endCap, ...rightReversed, ...startCap];
}

/**
 * Semicircular cap bulging in `dir` * tangent direction, from the +normal
 * point to the -normal point (dir=1: forward/end cap, dir=-1: backward/start cap).
 */
function roundCap(
  center: Point,
  normal: Point,
  tangent: Point,
  r: number,
  dir: 1 | -1,
): Point[] {
  const out: Point[] = [];
  for (let k = 1; k < CAP_SEGMENTS; k++) {
    const theta = (Math.PI * k) / CAP_SEGMENTS;
    const cos = Math.cos(theta);
    const sin = Math.sin(theta) * dir;
    out.push([
      center[0] + r * (normal[0] * cos + tangent[0] * sin),
      center[1] + r * (normal[1] * cos + tangent[1] * sin),
    ]);
  }
  return out;
}
