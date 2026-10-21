import type { ShapeKind } from './element';

/**
 * Path commands in shape-local coordinates, where (0, 0) is the top-left
 * corner of the normalized bounding box and (w, h) the bottom-right one.
 * Only absolute move/line/cubic/close are used so the same data can drive
 * Canvas 2D, SVG export and the polygonal approximation used for hit/snap math.
 */
export type ShapeCommand =
  | readonly ['M', number, number]
  | readonly ['L', number, number]
  | readonly ['C', number, number, number, number, number, number]
  | readonly ['Z'];

export interface ShapeBox {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

export interface ShapeDefinition {
  /** Closed outline: filled, stroked, and used for connector snapping. */
  outline(w: number, h: number): ShapeCommand[];
  /** Inner strokes that are drawn but never filled (e.g. cylinder rim). */
  details?(w: number, h: number): ShapeCommand[];
  /** Area where the label is laid out, in shape-local coordinates. */
  textBox(w: number, h: number): ShapeBox;
}

/** Cubic bezier constant approximating a quarter circle. */
export const CUBIC_CIRCLE_K = 0.5523;
const K = CUBIC_CIRCLE_K;

/**
 * Quarter-ellipse arc from (x0, y0) to (x1, y1) that leaves the start point
 * along `startAxis`. Two of them make each half-ellipse cap below.
 */
function quarter(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  startAxis: 'x' | 'y',
): ShapeCommand {
  return startAxis === 'x'
    ? ['C', x0 + (x1 - x0) * K, y0, x1, y1 - (y1 - y0) * K, x1, y1]
    : ['C', x0, y0 + (y1 - y0) * K, x1 - (x1 - x0) * K, y1, x1, y1];
}

function rectCommands(w: number, h: number): ShapeCommand[] {
  return [['M', 0, 0], ['L', w, 0], ['L', w, h], ['L', 0, h], ['Z']];
}

export const SHAPE_DEFINITIONS: Readonly<Record<ShapeKind, ShapeDefinition>> = {
  // Start/end: stadium with half-circle caps.
  terminator: {
    outline(w, h) {
      const r = Math.min(w / 2, h / 2);
      return [
        ['M', r, 0],
        ['L', w - r, 0],
        quarter(w - r, 0, w, h / 2, 'x'),
        quarter(w, h / 2, w - r, h, 'y'),
        ['L', r, h],
        quarter(r, h, 0, h / 2, 'x'),
        quarter(0, h / 2, r, 0, 'y'),
        ['Z'],
      ];
    },
    textBox(w, h) {
      const r = Math.min(w / 2, h / 2);
      return { x: r * 0.4, y: 0, w: Math.max(0, w - r * 0.8), h };
    },
  },

  // Input/output: parallelogram leaning right.
  data: {
    outline(w, h) {
      const s = Math.min(w * 0.2, h * 0.5);
      return [['M', s, 0], ['L', w, 0], ['L', w - s, h], ['L', 0, h], ['Z']];
    },
    textBox(w, h) {
      const s = Math.min(w * 0.2, h * 0.5);
      return { x: s, y: 0, w: Math.max(0, w - s * 2), h };
    },
  },

  // Document: rectangle with a wavy bottom edge.
  document: {
    outline(w, h) {
      const a = h * 0.1;
      const base = h - a;
      return [
        ['M', 0, 0],
        ['L', w, 0],
        ['L', w, base],
        ['C', (w * 2) / 3, base - a * 1.8, w / 3, base + a * 1.8, 0, base],
        ['Z'],
      ];
    },
    textBox(w, h) {
      return { x: 0, y: 0, w, h: h * 0.82 };
    },
  },

  // Database: vertical cylinder, the visible front of the top rim is a detail.
  database: {
    outline(w, h) {
      const ry = Math.min(h * 0.15, w * 0.25);
      return [
        ['M', 0, ry],
        quarter(0, ry, w / 2, 0, 'y'),
        quarter(w / 2, 0, w, ry, 'x'),
        ['L', w, h - ry],
        quarter(w, h - ry, w / 2, h, 'y'),
        quarter(w / 2, h, 0, h - ry, 'x'),
        ['Z'],
      ];
    },
    details(w, h) {
      const ry = Math.min(h * 0.15, w * 0.25);
      return [
        ['M', 0, ry],
        quarter(0, ry, w / 2, ry * 2, 'y'),
        quarter(w / 2, ry * 2, w, ry, 'x'),
      ];
    },
    textBox(w, h) {
      const ry = Math.min(h * 0.15, w * 0.25);
      return { x: 0, y: ry * 2, w, h: Math.max(0, h - ry * 3) };
    },
  },

  // Predefined process (subroutine): rectangle with two inner side bars.
  predefinedProcess: {
    outline: rectCommands,
    details(w, h) {
      const d = Math.min(w * 0.1, 16);
      return [
        ['M', d, 0],
        ['L', d, h],
        ['M', w - d, 0],
        ['L', w - d, h],
      ];
    },
    textBox(w, h) {
      const d = Math.min(w * 0.1, 16);
      return { x: d, y: 0, w: Math.max(0, w - d * 2), h };
    },
  },

  // Preparation: elongated hexagon.
  preparation: {
    outline(w, h) {
      const s = Math.min(w * 0.2, h * 0.5);
      return [
        ['M', s, 0],
        ['L', w - s, 0],
        ['L', w, h / 2],
        ['L', w - s, h],
        ['L', s, h],
        ['L', 0, h / 2],
        ['Z'],
      ];
    },
    textBox(w, h) {
      const s = Math.min(w * 0.2, h * 0.5);
      return { x: s * 0.6, y: 0, w: Math.max(0, w - s * 1.2), h };
    },
  },

  // Manual input: quadrilateral with the top edge sloping up to the right.
  manualInput: {
    outline(w, h) {
      const t = h * 0.25;
      return [['M', 0, t], ['L', w, 0], ['L', w, h], ['L', 0, h], ['Z']];
    },
    textBox(w, h) {
      const t = h * 0.25;
      return { x: 0, y: t, w, h: h - t };
    },
  },

  // Delay: rectangle whose right side is a half ellipse ("D" shape).
  delay: {
    outline(w, h) {
      const r = Math.min(w / 2, h / 2);
      return [
        ['M', 0, 0],
        ['L', w - r, 0],
        quarter(w - r, 0, w, h / 2, 'x'),
        quarter(w, h / 2, w - r, h, 'y'),
        ['L', 0, h],
        ['Z'],
      ];
    },
    textBox(w, h) {
      const r = Math.min(w / 2, h / 2);
      return { x: 0, y: 0, w: Math.max(0, w - r * 0.4), h };
    },
  },
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Serializes shape commands to SVG path data, offset by (ox, oy). */
export function shapeCommandsToPathData(
  commands: ReadonlyArray<ShapeCommand>,
  ox: number,
  oy: number,
): string {
  return commands
    .map((cmd) => {
      if (cmd[0] === 'Z') return 'Z';
      if (cmd[0] === 'C') {
        return `C ${round2(cmd[1] + ox)} ${round2(cmd[2] + oy)} ${round2(cmd[3] + ox)} ${round2(cmd[4] + oy)} ${round2(cmd[5] + ox)} ${round2(cmd[6] + oy)}`;
      }
      return `${cmd[0]} ${round2(cmd[1] + ox)} ${round2(cmd[2] + oy)}`;
    })
    .join(' ');
}
