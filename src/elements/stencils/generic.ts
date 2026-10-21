import type { ShapeCommand } from '../shapes';

/**
 * Markasso's own architecture icon set. Icons are drawn on a 24x24 grid as
 * path commands, so they render natively on the canvas, follow the stroke
 * color and theme, support rough mode and export to SVG like shapes do.
 */
export interface GenericIcon {
  /** Closed areas painted with the element's fill color. */
  readonly fill?: ReadonlyArray<ShapeCommand>;
  /** Outline strokes, always drawn with the element's stroke color. */
  readonly strokes: ReadonlyArray<ShapeCommand>;
}

export const ICON_GRID = 24;

/** Cubic constant for quarter circles. */
const K = 0.5523;

function rect(
  x: number,
  y: number,
  w: number,
  h: number,
  r = 0,
): ShapeCommand[] {
  if (r <= 0) {
    return [
      ['M', x, y],
      ['L', x + w, y],
      ['L', x + w, y + h],
      ['L', x, y + h],
      ['Z'],
    ];
  }
  const k = r * K;
  return [
    ['M', x + r, y],
    ['L', x + w - r, y],
    ['C', x + w - r + k, y, x + w, y + r - k, x + w, y + r],
    ['L', x + w, y + h - r],
    ['C', x + w, y + h - r + k, x + w - r + k, y + h, x + w - r, y + h],
    ['L', x + r, y + h],
    ['C', x + r - k, y + h, x, y + h - r + k, x, y + h - r],
    ['L', x, y + r],
    ['C', x, y + r - k, x + r - k, y, x + r, y],
    ['Z'],
  ];
}

function ellipse(
  cx: number,
  cy: number,
  rx: number,
  ry: number,
): ShapeCommand[] {
  const kx = rx * K;
  const ky = ry * K;
  return [
    ['M', cx + rx, cy],
    ['C', cx + rx, cy + ky, cx + kx, cy + ry, cx, cy + ry],
    ['C', cx - kx, cy + ry, cx - rx, cy + ky, cx - rx, cy],
    ['C', cx - rx, cy - ky, cx - kx, cy - ry, cx, cy - ry],
    ['C', cx + kx, cy - ry, cx + rx, cy - ky, cx + rx, cy],
    ['Z'],
  ];
}

const circle = (cx: number, cy: number, r: number): ShapeCommand[] =>
  ellipse(cx, cy, r, r);

/** Lower half of an ellipse, from its left to its right extreme. */
function lowerArc(
  cx: number,
  cy: number,
  rx: number,
  ry: number,
): ShapeCommand[] {
  const kx = rx * K;
  const ky = ry * K;
  return [
    ['M', cx - rx, cy],
    ['C', cx - rx, cy + ky, cx - kx, cy + ry, cx, cy + ry],
    ['C', cx + kx, cy + ry, cx + rx, cy + ky, cx + rx, cy],
  ];
}

function line(x1: number, y1: number, x2: number, y2: number): ShapeCommand[] {
  return [
    ['M', x1, y1],
    ['L', x2, y2],
  ];
}

function polyline(...points: Array<[number, number]>): ShapeCommand[] {
  return points.map(([x, y], i) => [i === 0 ? 'M' : 'L', x, y] as const);
}

/** Short dash used as a status light on hardware icons. */
const dot = (x: number, y: number): ShapeCommand[] => line(x, y, x + 0.5, y);

export const GENERIC_ICONS = {
  server: {
    fill: [...rect(3, 3, 18, 8, 2), ...rect(3, 13, 18, 8, 2)],
    strokes: [
      ...rect(3, 3, 18, 8, 2),
      ...rect(3, 13, 18, 8, 2),
      ...dot(7, 7),
      ...dot(7, 17),
    ],
  },
  database: {
    fill: [
      ['M', 4, 5],
      ['L', 4, 19],
      ...lowerArc(12, 19, 8, 3).slice(1),
      ['L', 20, 5],
      ['Z'],
      ...ellipse(12, 5, 8, 3),
    ],
    strokes: [
      ...ellipse(12, 5, 8, 3),
      ...line(4, 5, 4, 19),
      ...line(20, 5, 20, 19),
      ...lowerArc(12, 19, 8, 3),
      ...lowerArc(12, 12, 8, 3),
    ],
  },
  cache: {
    fill: rect(6, 6, 12, 12, 2),
    strokes: [
      ...rect(6, 6, 12, 12, 2),
      ...rect(9.5, 9.5, 5, 5, 0.5),
      ...line(10, 2, 10, 6),
      ...line(14, 2, 14, 6),
      ...line(10, 18, 10, 22),
      ...line(14, 18, 14, 22),
      ...line(2, 10, 6, 10),
      ...line(2, 14, 6, 14),
      ...line(18, 10, 22, 10),
      ...line(18, 14, 22, 14),
    ],
  },
  queue: {
    fill: rect(2, 7, 20, 10, 2),
    strokes: [
      ...rect(2, 7, 20, 10, 2),
      ...line(8.5, 7, 8.5, 17),
      ...line(15, 7, 15, 17),
    ],
  },
  storage: {
    fill: [
      ['M', 4, 6],
      ['L', 6, 20],
      ...lowerArc(12, 20, 6, 1.5).slice(1),
      ['L', 20, 6],
      ['Z'],
      ...ellipse(12, 6, 8, 2.5),
    ],
    strokes: [
      ...ellipse(12, 6, 8, 2.5),
      ...line(4, 6, 6, 20),
      ...line(20, 6, 18, 20),
      ...lowerArc(12, 20, 6, 1.5),
    ],
  },
  loadBalancer: {
    fill: [
      ...circle(12, 5, 2.5),
      ...circle(5, 19, 2.5),
      ...circle(12, 19, 2.5),
      ...circle(19, 19, 2.5),
    ],
    strokes: [
      ...circle(12, 5, 2.5),
      ...circle(5, 19, 2.5),
      ...circle(12, 19, 2.5),
      ...circle(19, 19, 2.5),
      ...line(10.6, 7, 6.2, 16.8),
      ...line(12, 7.5, 12, 16.5),
      ...line(13.4, 7, 17.8, 16.8),
    ],
  },
  firewall: {
    fill: rect(3, 4, 18, 16, 1),
    strokes: [
      ...rect(3, 4, 18, 16, 1),
      ...line(3, 9.33, 21, 9.33),
      ...line(3, 14.66, 21, 14.66),
      ...line(9, 4, 9, 9.33),
      ...line(15, 4, 15, 9.33),
      ...line(12, 9.33, 12, 14.66),
      ...line(9, 14.66, 9, 20),
      ...line(15, 14.66, 15, 20),
    ],
  },
  router: {
    fill: rect(2, 13, 20, 8, 2),
    strokes: [
      ...rect(2, 13, 20, 8, 2),
      ...line(7, 13, 7, 8),
      ...line(17, 13, 17, 8),
      ...dot(6, 17),
      ...dot(10, 17),
      ...line(14, 17, 18, 17),
      ...polyline([4.5, 6], [7, 3.5], [9.5, 6]),
      ...polyline([14.5, 6], [17, 3.5], [19.5, 6]),
    ],
  },
  network: {
    fill: [
      ['M', 7, 18],
      ['L', 17, 18],
      ['C', 19.8, 18, 21.5, 15.5, 20.5, 13],
      ['C', 19.8, 11.2, 18, 10.2, 16.2, 10.4],
      ['C', 15.4, 7.4, 12.8, 5.5, 10, 5.8],
      ['C', 7.2, 6.1, 5.2, 8.4, 5.1, 11.1],
      ['C', 3.3, 11.6, 2.3, 13.4, 2.7, 15.2],
      ['C', 3.1, 16.9, 4.8, 18, 7, 18],
      ['Z'],
    ],
    strokes: [
      ['M', 7, 18],
      ['L', 17, 18],
      ['C', 19.8, 18, 21.5, 15.5, 20.5, 13],
      ['C', 19.8, 11.2, 18, 10.2, 16.2, 10.4],
      ['C', 15.4, 7.4, 12.8, 5.5, 10, 5.8],
      ['C', 7.2, 6.1, 5.2, 8.4, 5.1, 11.1],
      ['C', 3.3, 11.6, 2.3, 13.4, 2.7, 15.2],
      ['C', 3.1, 16.9, 4.8, 18, 7, 18],
      ['Z'],
    ],
  },
  api: {
    strokes: [
      ['M', 8, 4],
      ['C', 6, 4, 6, 5, 6, 7],
      ['L', 6, 10],
      ['C', 6, 11, 5, 12, 4, 12],
      ['C', 5, 12, 6, 13, 6, 14],
      ['L', 6, 17],
      ['C', 6, 19, 6, 20, 8, 20],
      ['M', 16, 4],
      ['C', 18, 4, 18, 5, 18, 7],
      ['L', 18, 10],
      ['C', 18, 11, 19, 12, 20, 12],
      ['C', 19, 12, 18, 13, 18, 14],
      ['L', 18, 17],
      ['C', 18, 19, 18, 20, 16, 20],
      ...dot(11.75, 12),
    ],
  },
  container: {
    fill: [
      ['M', 12, 2],
      ['L', 21, 7],
      ['L', 21, 17],
      ['L', 12, 22],
      ['L', 3, 17],
      ['L', 3, 7],
      ['Z'],
    ],
    strokes: [
      ['M', 12, 2],
      ['L', 21, 7],
      ['L', 21, 17],
      ['L', 12, 22],
      ['L', 3, 17],
      ['L', 3, 7],
      ['Z'],
      ...polyline([3, 7], [12, 12], [21, 7]),
      ...line(12, 12, 12, 22),
    ],
  },
  function: {
    strokes: [
      ...line(6, 20, 11.5, 9),
      ['M', 7, 4],
      ['L', 9.5, 4],
      ['C', 10.7, 4, 11.4, 4.6, 12, 5.8],
      ['L', 19, 20],
    ],
  },
  browser: {
    fill: rect(2, 4, 20, 16, 2),
    strokes: [
      ...rect(2, 4, 20, 16, 2),
      ...line(2, 9, 22, 9),
      ...dot(5, 6.5),
      ...dot(8, 6.5),
    ],
  },
  mobile: {
    fill: rect(7, 2, 10, 20, 2),
    strokes: [...rect(7, 2, 10, 20, 2), ...line(11, 18, 13, 18)],
  },
  desktop: {
    fill: rect(2, 3, 20, 13, 2),
    strokes: [
      ...rect(2, 3, 20, 13, 2),
      ...line(12, 16, 12, 20),
      ...line(8, 20.5, 16, 20.5),
    ],
  },
  user: {
    fill: circle(12, 8, 4),
    strokes: [
      ...circle(12, 8, 4),
      ['M', 4, 21],
      ['C', 4, 16.6, 7.6, 14, 12, 14],
      ['C', 16.4, 14, 20, 16.6, 20, 21],
    ],
  },
  users: {
    fill: circle(9, 8, 3.5),
    strokes: [
      ...circle(9, 8, 3.5),
      ['M', 2, 20],
      ['C', 2, 16.5, 5, 14, 9, 14],
      ['C', 13, 14, 16, 16.5, 16, 20],
      ['M', 15.5, 4.3],
      ['C', 17.3, 4.8, 18.5, 6.3, 18.5, 8],
      ['C', 18.5, 9.7, 17.3, 11.2, 15.5, 11.7],
      ['M', 17.5, 14.2],
      ['C', 20.2, 14.8, 22, 17, 22, 20],
    ],
  },
  externalSystem: {
    fill: rect(3, 7, 14, 14, 2),
    strokes: [
      ...rect(3, 7, 14, 14, 2),
      ...line(11, 13, 21, 3),
      ...polyline([15, 3], [21, 3], [21, 9]),
    ],
  },
  secret: {
    fill: rect(5, 11, 14, 10, 2),
    strokes: [
      ...rect(5, 11, 14, 10, 2),
      ['M', 8, 11],
      ['L', 8, 7],
      ['C', 8, 4.8, 9.8, 3, 12, 3],
      ['C', 14.2, 3, 16, 4.8, 16, 7],
      ['L', 16, 11],
      ...line(12, 15, 12, 17),
    ],
  },
  document: {
    fill: [
      ['M', 6, 2],
      ['L', 14, 2],
      ['L', 20, 8],
      ['L', 20, 22],
      ['L', 6, 22],
      ['Z'],
    ],
    strokes: [
      ['M', 6, 2],
      ['L', 14, 2],
      ['L', 20, 8],
      ['L', 20, 22],
      ['L', 6, 22],
      ['Z'],
      ...polyline([14, 2], [14, 8], [20, 8]),
      ...line(9, 13, 17, 13),
      ...line(9, 17, 15, 17),
    ],
  },
} satisfies Record<string, GenericIcon>;

export type GenericIconId = keyof typeof GENERIC_ICONS;

export const GENERIC_ICON_IDS = Object.keys(GENERIC_ICONS) as GenericIconId[];

export function isGenericIconId(id: string): id is GenericIconId {
  return Object.hasOwn(GENERIC_ICONS, id);
}
