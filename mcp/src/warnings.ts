import type {
  ArrowElement,
  Element,
  LineElement,
} from '../../src/elements/element';
import {
  getQuadraticPoint,
  type RoutePoint,
} from '../../src/rendering/connector_geometry';
import { getConnectorLabelBoxes } from '../../src/rendering/connector_labels';
import {
  getConnectorBox,
  resolveConnectorRoute,
} from '../../src/rendering/draw_selection';
import { type Diagram, edgeShortId } from './diagram';

/**
 * Geometric checks of a diagram as it is drawn: connectors through nodes,
 * labels on top of things, crossing connectors and overlapping nodes. The
 * agent drawing a diagram often can't look at the result, so these tell it
 * when the picture is unclear and what to try.
 *
 * Everything is computed from the resolved geometry (the routes and label
 * boxes the renderer uses), never from stored connector points.
 */

type Connector = LineElement | ArrowElement;
type Rect = { x: number; y: number; w: number; h: number };
type Segment = readonly [RoutePoint, RoutePoint];

/** A connection between two keyed nodes, as the agent knows it. */
export interface EdgeName {
  readonly id: string;
  readonly from: string;
  readonly to: string;
}

export interface DiagramWarnings {
  /** A connector drawn across a node that is not one of its ends. */
  readonly throughNodes: ReadonlyArray<{ edge: EdgeName; node: string }>;
  /** A connector label on top of a node, or of another connector's label. */
  readonly labelOverlaps: ReadonlyArray<
    { edge: EdgeName; node: string } | { edge: EdgeName; label: EdgeName }
  >;
  /** Pairs of connectors whose strokes cross, with how many times. */
  readonly crossings: ReadonlyArray<{
    a: EdgeName;
    b: EdgeName;
    count: number;
  }>;
  /** Pairs of nodes whose boxes overlap (one inside the other excluded). */
  readonly nodeOverlaps: ReadonlyArray<readonly [string, string]>;
}

/** Shortest run of a connector inside a node that counts as crossing it. */
const MIN_INSIDE = 8;
/** Smallest overlap, in px on each axis, worth reporting. */
const MIN_OVERLAP = 2;
/** Crossings this close to a segment end are joins, not crossings. */
const END_SLACK = 3;
/** Samples used to treat a curved connector as a polyline. */
const CURVE_SAMPLES = 12;
/** Items listed per warning type before "and N more". */
const MAX_LISTED = 8;

function isConnector(el: Element): el is Connector {
  return el.type === 'line' || el.type === 'arrow';
}

/** Polyline the connector is drawn along (curves sampled). */
function polylineOf(
  el: Connector,
  elements: ReadonlyArray<Element>,
): RoutePoint[] {
  const route = resolveConnectorRoute(el, elements);
  if (
    el.type !== 'line' ||
    el.cx === undefined ||
    el.cy === undefined ||
    route.length !== 2
  )
    return route;
  const [[x1, y1], [x2, y2]] = route as [RoutePoint, RoutePoint];
  const { cx, cy } = el;
  return Array.from({ length: CURVE_SAMPLES + 1 }, (_, i) => {
    const p = getQuadraticPoint(x1, y1, cx, cy, x2, y2, i / CURVE_SAMPLES);
    return [p.x, p.y] as RoutePoint;
  });
}

function segmentsOf(points: ReadonlyArray<RoutePoint>): Segment[] {
  return points.slice(1).map((p, i) => [points[i]!, p] as const);
}

/**
 * Part of a node a connector must not cross: the rectangle inscribed in an
 * ellipse or rhombus (so passing near a corner of the bounding box is not
 * reported), the connector box otherwise, inset by a couple of pixels so
 * a stroke running along the border doesn't count.
 */
function coreRect(el: Element): Rect {
  const b = getConnectorBox(el);
  const scale =
    el.type === 'ellipse' ? Math.SQRT1_2 : el.type === 'rhombus' ? 0.5 : 1;
  const w = b.w * scale - 4;
  const h = b.h * scale - 4;
  return {
    x: b.x + (b.w - w) / 2,
    y: b.y + (b.h - h) / 2,
    w: Math.max(0, w),
    h: Math.max(0, h),
  };
}

/** Length of segment a-b inside `r` (Liang-Barsky clipping). */
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

function overlaps(a: Rect, b: Rect): boolean {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return w >= MIN_OVERLAP && h >= MIN_OVERLAP;
}

function contains(outer: Rect, inner: Rect): boolean {
  return (
    inner.x >= outer.x &&
    inner.y >= outer.y &&
    inner.x + inner.w <= outer.x + outer.w &&
    inner.y + inner.h <= outer.y + outer.h
  );
}

/**
 * Whether two segments cross away from their ends. Connectors that share a
 * node meet at its border, and an elbow's bends meet the next segment: both
 * are joins, not crossings. Collinear runs are left out too.
 */
function segmentsCross(s: Segment, t: Segment): boolean {
  const [[ax, ay], [bx, by]] = s;
  const [[cx, cy], [dx, dy]] = t;
  const rx = bx - ax;
  const ry = by - ay;
  const sx = dx - cx;
  const sy = dy - cy;
  const den = rx * sy - ry * sx;
  if (Math.abs(den) < 1e-9) return false;
  const u = ((cx - ax) * sy - (cy - ay) * sx) / den;
  const v = ((cx - ax) * ry - (cy - ay) * rx) / den;
  const lenS = Math.hypot(rx, ry);
  const lenT = Math.hypot(sx, sy);
  return (
    u * lenS > END_SLACK &&
    (1 - u) * lenS > END_SLACK &&
    v * lenT > END_SLACK &&
    (1 - v) * lenT > END_SLACK
  );
}

export function findWarnings(diagram: Diagram): DiagramWarnings {
  const elements = diagram.elements;
  const keys = diagram.nodeKeys();
  const nodes = elements.filter(
    (el) => keys.has(el.id) && el.visible !== false,
  );
  const boxes = new Map(nodes.map((el) => [el.id, getConnectorBox(el)]));
  // A node drawn around others is a frame or group: connectors and labels
  // inside it are expected, and so is the containment itself.
  const containers = new Set(
    nodes
      .filter((outer) =>
        nodes.some(
          (inner) =>
            inner !== outer &&
            contains(boxes.get(outer.id)!, boxes.get(inner.id)!),
        ),
      )
      .map((el) => el.id),
  );
  const solid = nodes.filter((el) => !containers.has(el.id));
  const cores = new Map(solid.map((el) => [el.id, coreRect(el)]));

  const edges: Array<{ name: EdgeName; el: Connector; segments: Segment[] }> =
    [];
  for (const el of elements) {
    if (!isConnector(el) || el.visible === false) continue;
    const from = el.startElementId ? keys.get(el.startElementId) : undefined;
    const to = el.endElementId ? keys.get(el.endElementId) : undefined;
    if (!from || !to) continue;
    edges.push({
      name: { id: edgeShortId(el), from, to },
      el,
      segments: segmentsOf(polylineOf(el, elements)),
    });
  }

  const throughNodes: Array<{ edge: EdgeName; node: string }> = [];
  for (const edge of edges) {
    for (const node of solid) {
      if (
        node.id === edge.el.startElementId ||
        node.id === edge.el.endElementId
      )
        continue;
      const core = cores.get(node.id)!;
      const inside = edge.segments.reduce(
        (sum, [a, b]) => sum + clippedLength(a, b, core),
        0,
      );
      if (inside >= MIN_INSIDE)
        throughNodes.push({ edge: edge.name, node: keys.get(node.id)! });
    }
  }

  const labels = getConnectorLabelBoxes(elements);
  const labelRects = edges.flatMap((edge) => {
    const box = labels.get(edge.el.id);
    return box
      ? [
          {
            edge: edge.name,
            rect: {
              x: box.x - box.w / 2,
              y: box.y - box.h / 2,
              w: box.w,
              h: box.h,
            },
          },
        ]
      : [];
  });
  const labelOverlaps: Array<
    { edge: EdgeName; node: string } | { edge: EdgeName; label: EdgeName }
  > = [];
  labelRects.forEach((label, i) => {
    for (const node of solid) {
      if (overlaps(label.rect, cores.get(node.id)!))
        labelOverlaps.push({ edge: label.edge, node: keys.get(node.id)! });
    }
    for (const other of labelRects.slice(i + 1)) {
      if (overlaps(label.rect, other.rect))
        labelOverlaps.push({ edge: label.edge, label: other.edge });
    }
  });

  const crossings: Array<{ a: EdgeName; b: EdgeName; count: number }> = [];
  edges.forEach((a, i) => {
    for (const b of edges.slice(i + 1)) {
      let count = 0;
      for (const s of a.segments)
        for (const t of b.segments) if (segmentsCross(s, t)) count++;
      if (count > 0) crossings.push({ a: a.name, b: b.name, count });
    }
  });

  const nodeOverlaps: Array<readonly [string, string]> = [];
  nodes.forEach((a, i) => {
    const ba = boxes.get(a.id)!;
    for (const b of nodes.slice(i + 1)) {
      const bb = boxes.get(b.id)!;
      if (overlaps(ba, bb) && !contains(ba, bb) && !contains(bb, ba))
        nodeOverlaps.push([keys.get(a.id)!, keys.get(b.id)!]);
    }
  });

  return { throughNodes, labelOverlaps, crossings, nodeOverlaps };
}

function edgeText(edge: EdgeName): string {
  return `${edge.from} -> ${edge.to} (id ${edge.id})`;
}

/** Up to MAX_LISTED items joined with "; ", then how many were left out. */
function listed(items: ReadonlyArray<string>): string {
  const shown = items.slice(0, MAX_LISTED).join('; ');
  const rest = items.length - MAX_LISTED;
  return rest > 0 ? `${shown}; and ${rest} more` : shown;
}

/**
 * Short text for the agent, one line per kind of problem with a hint, or
 * an empty string when the diagram is clear.
 */
export function formatWarnings(w: DiagramWarnings): string {
  const lines: string[] = [];
  if (w.throughNodes.length > 0) {
    const byEdge = new Map<string, { edge: EdgeName; nodes: string[] }>();
    for (const { edge, node } of w.throughNodes) {
      const entry = byEdge.get(edge.id) ?? { edge, nodes: [] };
      entry.nodes.push(node);
      byEdge.set(edge.id, entry);
    }
    lines.push(
      `- Connections through nodes: ${listed([...byEdge.values()].map((e) => `${edgeText(e.edge)} crosses ${e.nodes.join(', ')}`))}. Hint: move the crossed nodes off the line (diagram_update x/y) or try the other layout direction.`,
    );
  }
  if (w.labelOverlaps.length > 0)
    lines.push(
      `- Labels overlapping: ${listed(
        w.labelOverlaps.map((o) =>
          'node' in o
            ? `label of ${edgeText(o.edge)} on node ${o.node}`
            : `labels of ${edgeText(o.edge)} and ${edgeText(o.label)}`,
        ),
      )}. Hint: move the nodes apart or shorten the labels.`,
    );
  if (w.crossings.length > 0) {
    const total = w.crossings.reduce((sum, c) => sum + c.count, 0);
    lines.push(
      `- Crossing connections (${total}): ${listed(w.crossings.map((c) => `${edgeText(c.a)} x ${edgeText(c.b)}`))}. Hint: try the other layout direction, or routing "elbow" (diagram_update_edge).`,
    );
  }
  if (w.nodeOverlaps.length > 0)
    lines.push(
      `- Overlapping nodes: ${listed(w.nodeOverlaps.map(([a, b]) => `${a} and ${b}`))}. Hint: run diagram_layout, or move them (diagram_update x/y).`,
    );
  return lines.length > 0 ? `Warnings:\n${lines.join('\n')}` : '';
}

/** Warnings of the current diagram as text to append to a tool result. */
export function warningsSuffix(diagram: Diagram): string {
  const text = formatWarnings(findWarnings(diagram));
  return text ? `\n${text}` : '';
}
