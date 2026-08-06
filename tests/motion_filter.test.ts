import { describe, expect, it } from 'vitest';
import { PointOneEuroFilter } from '../src/gesture/motion_filter';

describe('PointOneEuroFilter', () => {
  it('reduces stationary cursor jitter', () => {
    const filter = new PointOneEuroFilter();
    const output = Array.from({ length: 20 }, (_, index) =>
      filter.filter({ x: index % 2 === 0 ? 0.49 : 0.51, y: 0.5 }, index * 16),
    );
    const settled = output.slice(10).map((point) => point.x);
    expect(Math.max(...settled) - Math.min(...settled)).toBeLessThan(0.01);
  });

  it('resets without retaining the previous position', () => {
    const filter = new PointOneEuroFilter();
    filter.filter({ x: 0.2, y: 0.2 }, 0);
    filter.filter({ x: 0.3, y: 0.3 }, 16);
    filter.reset();
    expect(filter.filter({ x: 0.8, y: 0.8 }, 32)).toEqual({ x: 0.8, y: 0.8 });
  });
});
