import { describe, expect, it } from 'vitest';
import { classifyHandPose } from '../src/gesture/landmark_geometry';
import { hand } from './gesture_fixtures';

describe('classifyHandPose', () => {
  it.each([
    ['open', 'open'],
    ['point', 'point'],
    ['pinch', 'pinch'],
    ['none', 'none'],
  ] as const)('recognizes a %s hand', (fixture, expected) => {
    expect(classifyHandPose(hand(fixture), 'none')).toBe(expected);
  });

  it('is invariant to hand rotation', () => {
    for (const rotation of [-Math.PI / 3, -Math.PI / 6, Math.PI / 4]) {
      expect(classifyHandPose(hand('open', 0, rotation), 'none')).toBe('open');
      expect(classifyHandPose(hand('point', 0, rotation), 'none')).toBe(
        'point',
      );
    }
  });

  it('uses hysteresis to retain an existing pinch near the boundary', () => {
    const borderline = [...hand('point')];
    borderline[4] = {
      x: borderline[8]!.x + 0.1,
      y: borderline[8]!.y,
    };
    expect(classifyHandPose(borderline, 'none')).not.toBe('pinch');
    expect(classifyHandPose(borderline, 'pinch')).toBe('pinch');
  });
});
