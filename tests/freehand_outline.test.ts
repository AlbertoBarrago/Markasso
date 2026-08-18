import { describe, expect, it } from 'vitest';
import { buildFreehandOutline } from '../src/rendering/freehand_outline';

function dist(
  a: readonly [number, number],
  b: readonly [number, number],
): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}

describe('buildFreehandOutline', () => {
  it('returns an empty outline for no points', () => {
    expect(buildFreehandOutline([], undefined, 4)).toEqual([]);
  });

  it('returns a circular dot for a single point', () => {
    const outline = buildFreehandOutline([[10, 10]], [1], 8);
    expect(outline.length).toBeGreaterThan(4);
    for (const p of outline) {
      expect(dist(p, [10, 10])).toBeCloseTo(4, 1); // halfWidth = 4 at pressure 1
    }
  });

  it('produces a ribbon roughly as wide as strokeWidth for a straight two-point stroke', () => {
    const outline = buildFreehandOutline(
      [
        [0, 0],
        [100, 0],
      ],
      [1, 1],
      10,
    );
    expect(outline.length).toBeGreaterThan(2);

    // Sample a point near the middle of the stroke and check it's offset
    // from the centerline (y=0) by roughly half the stroke width.
    const midOffsets = outline
      .filter((p) => p[0] > 40 && p[0] < 60)
      .map((p) => Math.abs(p[1]));
    expect(midOffsets.length).toBeGreaterThan(0);
    for (const offset of midOffsets) {
      expect(offset).toBeGreaterThan(3);
      expect(offset).toBeLessThanOrEqual(5.01);
    }
  });

  it('tapers a low-pressure stroke thinner than a high-pressure one', () => {
    const thin = buildFreehandOutline(
      [
        [0, 0],
        [100, 0],
      ],
      [0.1, 0.1],
      10,
    );
    const thick = buildFreehandOutline(
      [
        [0, 0],
        [100, 0],
      ],
      [1, 1],
      10,
    );

    const maxOffset = (outline: readonly (readonly [number, number])[]) =>
      Math.max(...outline.map((p) => Math.abs(p[1])));

    expect(maxOffset(thin)).toBeLessThan(maxOffset(thick));
  });

  it('never fully vanishes even at zero pressure', () => {
    const outline = buildFreehandOutline(
      [
        [0, 0],
        [100, 0],
      ],
      [0, 0],
      10,
    );
    const maxOffset = Math.max(...outline.map((p) => Math.abs(p[1])));
    expect(maxOffset).toBeGreaterThan(0);
  });

  it('falls back to a default pressure when the pressures array length mismatches', () => {
    expect(() =>
      buildFreehandOutline(
        [
          [0, 0],
          [10, 0],
          [20, 0],
        ],
        [1], // mismatched length
        6,
      ),
    ).not.toThrow();
  });

  it('handles a multi-point curved stroke without throwing and stays within bounds', () => {
    const points: [number, number][] = [
      [0, 0],
      [10, 20],
      [30, 15],
      [50, 40],
      [70, 10],
    ];
    const pressures = [0.5, 0.8, 0.3, 0.9, 0.6];
    const outline = buildFreehandOutline(points, pressures, 6);
    expect(outline.length).toBeGreaterThan(points.length);
    for (const [x, y] of outline) {
      expect(Number.isFinite(x)).toBe(true);
      expect(Number.isFinite(y)).toBe(true);
    }
  });
});
