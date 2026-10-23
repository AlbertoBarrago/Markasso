import { measureTextBlock } from '../core/text_metrics';
import type { ArrowElement, Element, LineElement } from '../elements/element';
import {
  getQuadraticPoint,
  getRoutePointAt,
  type RoutePoint,
} from './connector_geometry';
import { getConnectorBox, resolveConnectorRoute } from './draw_selection';

/**
 * Where connector labels go. Each label sits on a stretch of its own
 * connector, chosen to stay off other connectors' strokes, other labels and
 * nodes; it prefers the middle of the route. Placement is a pure function of
 * the scene, computed once per elements array, so the canvas, the SVG export
 * and every live peer agree on it.
 */

export interface LabelBox {
  /** Center of the label. */
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

type Connector = LineElement | ArrowElement;
type Rect = { x: number; y: number; w: number; h: number };
type Segment = readonly [RoutePoint, RoutePoint];

const DEFAULT_FONT_SIZE = 12;
const DEFAULT_FONT = 'Arial, sans-serif';
/** Candidate positions along each segment, as fractions of its length. */
const FRACTIONS = [0.5, 0.3, 0.7, 0.15, 0.85] as const;
/** Samples used to treat a curved connector as a polyline. */
const CURVE_SAMPLES = 12;

/** Label box size, padding included (matches the gap the shaft leaves). */
export function getConnectorLabelSize(el: Connector): {
  w: number;
  h: number;
} {
  const fontSize = el.labelFontSize ?? DEFAULT_FONT_SIZE;
  const pad = fontSize * 0.4;
  const block = measureTextBlock(
    (el.label ?? '').split('\n'),
    fontSize,
    el.labelFontFamily ?? DEFAULT_FONT,
  );
  return { w: block.width + pad * 2, h: block.height + pad * 2 };
}

function isCurved(
  el: Connector,
): el is LineElement & { cx: number; cy: number } {
  return el.type === 'line' && el.cx !== undefined && el.cy !== undefined;
}

/** Polyline the connector is drawn along (curves sampled). */
function polylineOf(
  el: Connector,
  elements: ReadonlyArray<Element>,
): RoutePoint[] {
  const route = resolveConnectorRoute(el, elements);
  if (!isCurved(el) || route.length !== 2) return route;
  const [[x1, y1], [x2, y2]] = route as [RoutePoint, RoutePoint];
  return Array.from({ length: CURVE_SAMPLES + 1 }, (_, i) => {
    const p = getQuadraticPoint(
      x1,
      y1,
      el.cx,
      el.cy,
      x2,
      y2,
      i / CURVE_SAMPLES,
    );
    return [p.x, p.y] as RoutePoint;
  });
}

function segmentsOf(points: ReadonlyArray<RoutePoint>): Segment[] {
  return points.slice(1).map((p, i) => [points[i]!, p] as const);
}

/** Length of the part of segment a→b inside `r` (Liang-Barsky clipping). */
function clippedLength(a: RoutePoint, b: RoutePoint, r: Rect): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  let t0 = 0;
  let t1 = 1;
  const edges: Array<[number, number]> = [
    [-dx, a[0] - r.x],
    [dx, r.x + r.w - a[0]],
    [-dy, a[1] - r.y],
    [dy, r.y + r.h - a[1]],
  ];
  for (const [p, q] of edges) {
    if (Math.abs(p) < 1e-9) {
      if (q < 0) return 0;
      continue;
    }
    const t = q / p;
    if (p < 0) t0 = Math.max(t0, t);
    else t1 = Math.min(t1, t);
    if (t0 > t1) return 0;
  }
  return (t1 - t0) * Math.hypot(dx, dy);
}

function overlapArea(a: Rect, b: Rect): number {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? w * h : 0;
}

const rectOf = (b: LabelBox): Rect => ({
  x: b.x - b.w / 2,
  y: b.y - b.h / 2,
  w: b.w,
  h: b.h,
});

function isConnector(el: Element): el is Connector {
  return el.type === 'line' || el.type === 'arrow';
}

const cache = new WeakMap<ReadonlyArray<Element>, Map<string, LabelBox>>();

/** Label boxes of every labeled, visible connector in the scene. */
export function getConnectorLabelBoxes(
  elements: ReadonlyArray<Element>,
): Map<string, LabelBox> {
  const cached = cache.get(elements);
  if (cached) return cached;

  const connectors = elements.filter(
    (el): el is Connector => isConnector(el) && el.visible !== false,
  );
  const polylines = new Map(
    connectors.map((el) => [el.id, polylineOf(el, elements)]),
  );
  const strokes = connectors.flatMap((el) =>
    segmentsOf(polylines.get(el.id)!).map((seg) => ({ owner: el.id, seg })),
  );
  const nodes = elements
    .filter(
      (el) =>
        !isConnector(el) && el.visible !== false && el.type !== 'freehand',
    )
    .map((el) => getConnectorBox(el));

  const placed: LabelBox[] = [];
  const result = new Map<string, LabelBox>();
  for (const el of connectors) {
    if (!el.label) continue;
    const { w, h } = getConnectorLabelSize(el);
    const points = polylines.get(el.id)!;
    const box = isCurved(el)
      ? curveMidpointBox(points, w, h)
      : bestBox(el.id, points, w, h, strokes, placed, nodes);
    placed.push(box);
    result.set(el.id, box);
  }
  cache.set(elements, result);
  return result;
}

/** Curved connectors keep their label on the curve's midpoint. */
function curveMidpointBox(
  points: ReadonlyArray<RoutePoint>,
  w: number,
  h: number,
): LabelBox {
  const [x, y] = getRoutePointAt(points, 0.5);
  return { x, y, w, h };
}

function bestBox(
  ownerId: string,
  points: ReadonlyArray<RoutePoint>,
  w: number,
  h: number,
  strokes: ReadonlyArray<{ owner: string; seg: Segment }>,
  placed: ReadonlyArray<LabelBox>,
  nodes: ReadonlyArray<Rect>,
): LabelBox {
  const [mx, my] = getRoutePointAt(points, 0.5);
  const segments = segmentsOf(points);
  const total = segments.reduce(
    (sum, [a, b]) => sum + Math.hypot(b[0] - a[0], b[1] - a[1]),
    0,
  );
  if (total < 1) return { x: mx, y: my, w, h };

  let best: LabelBox = { x: mx, y: my, w, h };
  let bestCost = Infinity;
  let walked = 0;
  const consider = (x: number, y: number, along: number, room: number) => {
    const box: LabelBox = { x, y, w, h };
    const r = rectOf(box);
    // Shrunk so strokes that only touch the edge don't count.
    const inner = { x: r.x + 1, y: r.y + 1, w: r.w - 2, h: r.h - 2 };
    let cost = 0;
    for (const s of strokes)
      if (s.owner !== ownerId)
        cost += clippedLength(s.seg[0], s.seg[1], inner) * 20;
    for (const other of placed) cost += overlapArea(r, rectOf(other)) * 2;
    for (const node of nodes) cost += overlapArea(inner, node) * 2;
    // A label wider than its stretch spills over the bends.
    cost += Math.max(0, -room) * 2;
    // Mild preference for the middle of the route, so the common case
    // (nothing nearby) stays where it always was.
    cost += Math.abs(along - total / 2) * 0.05;
    if (cost < bestCost - 1e-6) {
      bestCost = cost;
      best = box;
    }
  };

  consider(mx, my, total / 2, Infinity);
  for (const [a, b] of segments) {
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (len >= 1) {
      const horizontal = Math.abs(b[0] - a[0]) >= Math.abs(b[1] - a[1]);
      const extent = horizontal ? w : h;
      for (const f of FRACTIONS) {
        const x = a[0] + (b[0] - a[0]) * f;
        const y = a[1] + (b[1] - a[1]) * f;
        const room = Math.min(f, 1 - f) * len * 2 - extent;
        consider(x, y, walked + f * len, room);
      }
    }
    walked += len;
  }
  return best;
}
