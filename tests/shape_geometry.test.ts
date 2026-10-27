import { describe, expect, it } from 'vitest';
import { type Element, SHAPE_KINDS } from '../src/elements/element';
import {
  SHAPE_DEFINITIONS,
  shapeCommandsToPathData,
} from '../src/elements/shapes';
import {
  flattenShapeCommands,
  getLabelWrapWidth,
  getShapeBorderPointToward,
  getShapeDistToBoundary,
  getShapeNearestBorderPoint,
  getShapeOutlinePolygon,
  getShapeTextBox,
} from '../src/rendering/shape_geometry';

const W = 200;
const H = 100;
const EPS = 1e-6;

describe('shape definitions', () => {
  for (const kind of SHAPE_KINDS) {
    describe(kind, () => {
      it('has a closed outline that stays inside its box', () => {
        const poly = getShapeOutlinePolygon(kind, W, H);
        expect(poly.length).toBeGreaterThan(3);
        const first = poly[0]!;
        const last = poly[poly.length - 1]!;
        expect(last[0]).toBeCloseTo(first[0]);
        expect(last[1]).toBeCloseTo(first[1]);
        for (const [x, y] of poly) {
          expect(x).toBeGreaterThanOrEqual(-EPS);
          expect(x).toBeLessThanOrEqual(W + EPS);
          expect(y).toBeGreaterThanOrEqual(-EPS);
          expect(y).toBeLessThanOrEqual(H + EPS);
        }
      });

      it('has a non-empty text box inside its box', () => {
        const box = getShapeTextBox(kind, W, H);
        expect(box.w).toBeGreaterThan(0);
        expect(box.h).toBeGreaterThan(0);
        expect(box.x).toBeGreaterThanOrEqual(0);
        expect(box.y).toBeGreaterThanOrEqual(0);
        expect(box.x + box.w).toBeLessThanOrEqual(W + EPS);
        expect(box.y + box.h).toBeLessThanOrEqual(H + EPS);
      });

      it('touches all four sides of its box', () => {
        const poly = getShapeOutlinePolygon(kind, W, H);
        const xs = poly.map((p) => p[0]);
        const ys = poly.map((p) => p[1]);
        expect(Math.min(...xs)).toBeCloseTo(0);
        expect(Math.max(...xs)).toBeCloseTo(W);
        expect(Math.min(...ys)).toBeCloseTo(0);
        // The document's wavy bottom never quite reaches the box edge.
        expect(Math.max(...ys)).toBeGreaterThan(H * 0.9);
      });

      it('does not produce NaN for a degenerate 0x0 box', () => {
        const poly = getShapeOutlinePolygon(kind, 0, 0);
        for (const [x, y] of poly) {
          expect(Number.isFinite(x) && Number.isFinite(y)).toBe(true);
        }
      });
    });
  }
});

describe('flattenShapeCommands', () => {
  it('closes subpaths by repeating the first point', () => {
    const [poly] = flattenShapeCommands([
      ['M', 0, 0],
      ['L', 10, 0],
      ['L', 10, 10],
      ['Z'],
    ]);
    expect(poly).toEqual([
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 0],
    ]);
  });

  it('splits open subpaths at each move', () => {
    const paths = flattenShapeCommands(
      SHAPE_DEFINITIONS.predefinedProcess.details!(W, H),
    );
    expect(paths).toHaveLength(2);
  });

  it('samples cubic segments ending exactly on their end point', () => {
    const [poly] = flattenShapeCommands([
      ['M', 0, 0],
      ['C', 0, 10, 10, 10, 10, 0],
    ]);
    expect(poly!.length).toBeGreaterThan(2);
    expect(poly![poly!.length - 1]).toEqual([10, 0]);
  });
});

describe('getShapeBorderPointToward', () => {
  it('hits the cap tip of a terminator', () => {
    const [x, y] = getShapeBorderPointToward('terminator', W, H, 1, 0);
    expect(x).toBeCloseTo(W);
    expect(y).toBeCloseTo(H / 2);
  });

  it('hits the top edge straight up', () => {
    const [x, y] = getShapeBorderPointToward('terminator', W, H, 0, -1);
    expect(x).toBeCloseTo(W / 2);
    expect(y).toBeCloseTo(0);
  });

  it('hits the slanted side of a data parallelogram', () => {
    // skew = min(0.2w, 0.5h) = 40, right edge goes (200,0) → (160,100)
    const [x, y] = getShapeBorderPointToward('data', W, H, 1, 0);
    expect(x).toBeCloseTo(180);
    expect(y).toBeCloseTo(H / 2);
  });

  it('follows the wavy bottom of a document', () => {
    const [x, y] = getShapeBorderPointToward('document', W, H, 0, 1);
    expect(x).toBeCloseTo(W / 2);
    expect(y).toBeCloseTo(H * 0.9);
  });

  it('falls back to top-center for a zero direction', () => {
    expect(getShapeBorderPointToward('delay', W, H, 0, 0)).toEqual([W / 2, 0]);
  });
});

describe('getShapeNearestBorderPoint / getShapeDistToBoundary', () => {
  it('projects an outside point onto the closest edge', () => {
    const [x, y] = getShapeNearestBorderPoint('delay', W, H, W + 10, H / 2);
    expect(x).toBeCloseTo(W);
    expect(y).toBeCloseTo(H / 2);
  });

  it('measures the distance from the center of a stadium', () => {
    expect(
      getShapeDistToBoundary('terminator', W, H, W / 2, H / 2),
    ).toBeCloseTo(H / 2);
  });

  it('is zero on the outline', () => {
    expect(getShapeDistToBoundary('preparation', W, H, W, H / 2)).toBeCloseTo(
      0,
    );
  });
});

describe('shapeCommandsToPathData', () => {
  it('serializes and offsets every command', () => {
    expect(
      shapeCommandsToPathData(
        [['M', 0, 0], ['L', 1.234, 2], ['C', 1, 2, 3, 4, 5, 6], ['Z']],
        10,
        20,
      ),
    ).toBe('M 10 20 L 11.23 22 C 11 22 13 24 15 26 Z');
  });
});

describe('getLabelWrapWidth', () => {
  const base = {
    id: 'el',
    x: 0,
    y: 0,
    width: W,
    height: H,
    strokeColor: '#000',
    fillColor: 'transparent',
    strokeWidth: 1,
    opacity: 1,
    roughness: 0,
  } as const;

  it('keeps the widths the renderer used before it was shared', () => {
    expect(getLabelWrapWidth({ ...base, type: 'rectangle' }, W, H)).toBe(
      W - 16,
    );
    expect(getLabelWrapWidth({ ...base, type: 'ellipse' }, W, H)).toBe(
      W * 0.7 - 16,
    );
    expect(getLabelWrapWidth({ ...base, type: 'rhombus' }, W, H)).toBe(
      W * 0.7 - 16,
    );
    for (const kind of SHAPE_KINDS) {
      expect(getLabelWrapWidth({ ...base, type: 'shape', kind }, W, H)).toBe(
        getShapeTextBox(kind, W, H).w - 16,
      );
    }
  });

  it('never goes below the label font size', () => {
    const tiny: Element = {
      ...base,
      type: 'rectangle',
      width: 10,
      labelFontSize: 24,
    };
    expect(getLabelWrapWidth(tiny, 10, H)).toBe(24);
  });
});
