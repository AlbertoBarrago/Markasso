import type { ShapeKind } from '../elements/element';
import { DEFAULT_SHAPE_LABEL_FONT_SIZE } from '../elements/label_defaults';
import {
  SHAPE_DEFINITIONS,
  type ShapeBox,
  type ShapeCommand,
} from '../elements/shapes';

type Point = readonly [number, number];

/** Samples per cubic segment: enough for smooth snapping at any zoom. */
const CUBIC_STEPS = 16;

function cubicAt(
  p0: number,
  p1: number,
  p2: number,
  p3: number,
  t: number,
): number {
  const mt = 1 - t;
  return (
    mt * mt * mt * p0 +
    3 * mt * mt * t * p1 +
    3 * mt * t * t * p2 +
    t * t * t * p3
  );
}

/**
 * Flattens path commands into polylines, one per subpath. Closed subpaths
 * repeat their first point at the end so consecutive pairs cover every edge.
 */
export function flattenShapeCommands(
  commands: ReadonlyArray<ShapeCommand>,
): Point[][] {
  const subpaths: Point[][] = [];
  let current: Point[] = [];
  for (const cmd of commands) {
    switch (cmd[0]) {
      case 'M':
        if (current.length > 1) subpaths.push(current);
        current = [[cmd[1], cmd[2]]];
        break;
      case 'L':
        current.push([cmd[1], cmd[2]]);
        break;
      case 'C': {
        const start = current[current.length - 1] ?? [cmd[5], cmd[6]];
        for (let i = 1; i <= CUBIC_STEPS; i++) {
          const t = i / CUBIC_STEPS;
          current.push([
            cubicAt(start[0], cmd[1], cmd[3], cmd[5], t),
            cubicAt(start[1], cmd[2], cmd[4], cmd[6], t),
          ]);
        }
        break;
      }
      case 'Z': {
        const first = current[0];
        if (first) current.push(first);
        break;
      }
    }
  }
  if (current.length > 1) subpaths.push(current);
  return subpaths;
}

/** Closed outline polygon of a shape in box-local coordinates. */
export function getShapeOutlinePolygon(
  kind: ShapeKind,
  w: number,
  h: number,
): Point[] {
  return flattenShapeCommands(SHAPE_DEFINITIONS[kind].outline(w, h))[0] ?? [];
}

export function getShapeTextBox(
  kind: ShapeKind,
  w: number,
  h: number,
): ShapeBox {
  return SHAPE_DEFINITIONS[kind].textBox(w, h);
}

/** Horizontal room kept free on each side of a shape label, in total. */
export const LABEL_INSET = 16;

/** Share of an ellipse's or rhombus's width its label wraps in. */
export const ROUND_LABEL_AREA = 0.7;

/**
 * What {@link getLabelWrapWidth} needs to know about a labeled shape: an
 * element, or a description of one that is about to be created.
 */
export type LabeledShape = { readonly labelFontSize?: number } & (
  | { readonly type: 'rectangle' | 'ellipse' | 'rhombus' }
  | { readonly type: 'shape'; readonly kind: ShapeKind }
);

/**
 * Width a shape label wraps at, shared by the canvas, the SVG export and the
 * label editor so the text breaks at the same points in all three. Ellipses
 * and rhombi use {@link ROUND_LABEL_AREA} of their width, roughly the
 * inscribed area.
 */
export function getLabelWrapWidth(
  el: LabeledShape,
  w: number,
  h: number,
): number {
  let area: number;
  switch (el.type) {
    case 'rectangle':
      area = w;
      break;
    case 'ellipse':
    case 'rhombus':
      area = w * ROUND_LABEL_AREA;
      break;
    case 'shape':
      area = getShapeTextBox(el.kind, w, h).w;
      break;
  }
  return Math.max(
    area - LABEL_INSET,
    el.labelFontSize ?? DEFAULT_SHAPE_LABEL_FONT_SIZE,
  );
}

function nearestOnSegment(px: number, py: number, a: Point, b: Point): Point {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const lenSq = dx * dx + dy * dy;
  if (lenSq < 1e-12) return a;
  const t = Math.max(
    0,
    Math.min(1, ((px - a[0]) * dx + (py - a[1]) * dy) / lenSq),
  );
  return [a[0] + dx * t, a[1] + dy * t];
}

/**
 * Point on the outline where a ray from the box center along (dx, dy) exits.
 * Returns the top-center when the direction is degenerate, matching the
 * fallback used for the built-in shapes.
 */
export function getShapeBorderPointToward(
  kind: ShapeKind,
  w: number,
  h: number,
  dx: number,
  dy: number,
): Point {
  const cx = w / 2;
  const cy = h / 2;
  if (Math.abs(dx) < 0.001 && Math.abs(dy) < 0.001) return [cx, 0];

  const poly = getShapeOutlinePolygon(kind, w, h);
  // Every outline is star-shaped around its center, so the nearest crossing
  // is the single exit point (shared vertices only produce duplicates).
  let bestT = Infinity;
  for (let i = 1; i < poly.length; i++) {
    const a = poly[i - 1]!;
    const b = poly[i]!;
    const ex = b[0] - a[0];
    const ey = b[1] - a[1];
    const denom = dx * ey - dy * ex;
    if (Math.abs(denom) < 1e-12) continue;
    const ax = a[0] - cx;
    const ay = a[1] - cy;
    const t = (ax * ey - ay * ex) / denom;
    const u = (ax * dy - ay * dx) / denom;
    if (t > 1e-9 && u >= -1e-9 && u <= 1 + 1e-9 && t < bestT) bestT = t;
  }
  if (!Number.isFinite(bestT)) return [cx, 0];
  return [cx + dx * bestT, cy + dy * bestT];
}

/** Closest outline point to (px, py), both in box-local coordinates. */
export function getShapeNearestBorderPoint(
  kind: ShapeKind,
  w: number,
  h: number,
  px: number,
  py: number,
): Point {
  const poly = getShapeOutlinePolygon(kind, w, h);
  let best: Point = [w / 2, 0];
  let bestDist = Infinity;
  for (let i = 1; i < poly.length; i++) {
    const candidate = nearestOnSegment(px, py, poly[i - 1]!, poly[i]!);
    const d = Math.hypot(candidate[0] - px, candidate[1] - py);
    if (d < bestDist) {
      bestDist = d;
      best = candidate;
    }
  }
  return best;
}

/** Distance from (px, py) to the outline, in box-local coordinates. */
export function getShapeDistToBoundary(
  kind: ShapeKind,
  w: number,
  h: number,
  px: number,
  py: number,
): number {
  const [nx, ny] = getShapeNearestBorderPoint(kind, w, h, px, py);
  return Math.hypot(nx - px, ny - py);
}
