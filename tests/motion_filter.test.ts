import { describe, expect, it } from 'vitest';
import {
  PointMotionPredictor,
  PointOneEuroFilter,
  TraceSmoothingFilter,
} from '../src/gesture/motion_filter';

describe('TraceSmoothingFilter', () => {
  it('averages the last three samples', () => {
    const filter = new TraceSmoothingFilter();
    filter.filter({ x: 0.1, y: 0.1 });
    filter.filter({ x: 0.2, y: 0.2 });
    const output = filter.filter({ x: 0.3, y: 0.3 });

    expect(output.x).toBeCloseTo(0.2);
    expect(output.y).toBeCloseTo(0.2);
  });

  it('slides the window instead of growing unbounded', () => {
    const filter = new TraceSmoothingFilter();
    filter.filter({ x: 0, y: 0 });
    filter.filter({ x: 0, y: 0 });
    filter.filter({ x: 0, y: 0 });
    const output = filter.filter({ x: 0.3, y: 0.3 });

    expect(output.x).toBeCloseTo(0.1);
    expect(output.y).toBeCloseTo(0.1);
  });

  it('preserves z from the latest sample only', () => {
    const filter = new TraceSmoothingFilter();
    filter.filter({ x: 0, y: 0, z: 1 });
    const output = filter.filter({ x: 0.2, y: 0.2, z: 5 });

    expect(output.z).toBe(5);
  });

  it('omits z when the latest sample has none', () => {
    const filter = new TraceSmoothingFilter();
    filter.filter({ x: 0, y: 0, z: 1 });
    const output = filter.filter({ x: 0.2, y: 0.2 });

    expect(output.z).toBeUndefined();
  });

  it('returns the raw point on the first sample', () => {
    const filter = new TraceSmoothingFilter();
    expect(filter.filter({ x: 0.42, y: 0.73 })).toEqual({ x: 0.42, y: 0.73 });
  });

  it('discards history on reset', () => {
    const filter = new TraceSmoothingFilter();
    filter.filter({ x: 0.9, y: 0.9 });
    filter.filter({ x: 0.9, y: 0.9 });
    filter.reset();

    expect(filter.filter({ x: 0.1, y: 0.1 })).toEqual({ x: 0.1, y: 0.1 });
  });
});

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

  it('ignores out-of-order samples without corrupting the timeline', () => {
    const filter = new PointOneEuroFilter();
    filter.filter({ x: 0.2, y: 0.2 }, 100);
    const current = filter.filter({ x: 0.3, y: 0.3 }, 116);

    expect(filter.filter({ x: 0.9, y: 0.9 }, 100)).toEqual(current);
    expect(filter.filter({ x: 0.31, y: 0.31 }, 132).x).toBeLessThan(0.4);
  });

  it('does not bridge a long sampling pause', () => {
    const filter = new PointOneEuroFilter();
    filter.filter({ x: 0.2, y: 0.2 }, 0);
    filter.filter({ x: 0.3, y: 0.3 }, 16);

    expect(filter.filter({ x: 0.8, y: 0.8 }, 600)).toEqual({ x: 0.8, y: 0.8 });
  });

  it('produces comparable smoothing at 30 and 60 fps', () => {
    const run = (frameDuration: number): number => {
      const filter = new PointOneEuroFilter();
      let output = { x: 0.2, y: 0.5 };
      for (let timestamp = 0; timestamp <= 1_000; timestamp += frameDuration) {
        output = filter.filter(
          { x: 0.2 + timestamp * 0.0006, y: 0.5 },
          timestamp,
        );
      }
      return output.x;
    };

    expect(Math.abs(run(1_000 / 30) - run(1_000 / 60))).toBeLessThan(0.02);
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
    predictor.update({ x: 0.5, y: 0 }, 1);

    const predicted = predictor.predict(41, 1_000, 1_000)!;

    expect((predicted.x - 0.5) * 1_000).toBeCloseTo(40);
  });

  it('clears its velocity and position on reset', () => {
    const predictor = new PointMotionPredictor();
    predictor.update({ x: 0.4, y: 0.5 }, 0);
    predictor.reset();

    expect(predictor.predict(16, 1_000, 1_000)).toBeNull();
  });

  it('settles back to the measured point when samples become stale', () => {
    const predictor = new PointMotionPredictor();
    predictor.update({ x: 0.4, y: 0.5 }, 0);
    predictor.update({ x: 0.5, y: 0.5 }, 50);

    expect(predictor.predict(90, 1_000, 1_000)?.x).toBeGreaterThan(0.5);
    expect(predictor.predict(250, 1_000, 1_000)).toEqual({ x: 0.5, y: 0.5 });
  });

  it('ignores out-of-order samples', () => {
    const predictor = new PointMotionPredictor();
    predictor.update({ x: 0.4, y: 0.5 }, 100);
    predictor.update({ x: 0.5, y: 0.5 }, 116);
    predictor.update({ x: 0.9, y: 0.9 }, 100);

    const predicted = predictor.predict(116, 1_000, 1_000);
    expect(predicted?.x).toBe(0.5);
    expect(predicted?.y).toBe(0.5);
  });

  it('drops stale velocity after a long sampling pause', () => {
    const predictor = new PointMotionPredictor();
    predictor.update({ x: 0.2, y: 0.5 }, 0);
    predictor.update({ x: 0.3, y: 0.5 }, 16);
    predictor.update({ x: 0.8, y: 0.5 }, 300);

    expect(predictor.predict(320, 1_000, 1_000)).toEqual({ x: 0.8, y: 0.5 });
  });

  it('keeps predicted coordinates inside the canvas', () => {
    const predictor = new PointMotionPredictor();
    predictor.update({ x: 0.9, y: 0.1 }, 0);
    predictor.update({ x: 1, y: 0 }, 16);

    expect(predictor.predict(56, 1_000, 1_000)).toEqual({ x: 1, y: 0 });
  });

  it('produces comparable prediction at 30 and 60 fps', () => {
    const run = (frameDuration: number): number => {
      const predictor = new PointMotionPredictor();
      for (let timestamp = 0; timestamp <= 1_000; timestamp += frameDuration) {
        predictor.update({ x: timestamp * 0.0005, y: 0.5 }, timestamp);
      }
      return predictor.predict(1_020, 1_000, 1_000)!.x;
    };

    expect(Math.abs(run(1_000 / 30) - run(1_000 / 60))).toBeLessThan(0.02);
  });
});
