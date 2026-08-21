import { describe, expect, it } from 'vitest';
import {
  PointMotionPredictor,
  PointOneEuroFilter,
} from '../src/gesture/motion_filter';

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

describe('PointMotionPredictor', () => {
  it('projects recent motion without changing the measured point', () => {
    const predictor = new PointMotionPredictor();
    predictor.update({ x: 0.4, y: 0.5 }, 0);
    predictor.update({ x: 0.5, y: 0.5 }, 100);

    const predicted = predictor.predict(140, 1_000, 1_000);

    expect(predicted?.x).toBeGreaterThan(0.5);
    expect(predicted?.y).toBe(0.5);
  });

  it('caps prediction distance in screen pixels', () => {
    const predictor = new PointMotionPredictor();
    predictor.update({ x: 0, y: 0 }, 0);
    predictor.update({ x: 1, y: 0 }, 1);

    const predicted = predictor.predict(41, 1_000, 1_000)!;

    expect((predicted.x - 1) * 1_000).toBeCloseTo(40);
  });

  it('clears its velocity and position on reset', () => {
    const predictor = new PointMotionPredictor();
    predictor.update({ x: 0.4, y: 0.5 }, 0);
    predictor.reset();

    expect(predictor.predict(16, 1_000, 1_000)).toBeNull();
  });
});
