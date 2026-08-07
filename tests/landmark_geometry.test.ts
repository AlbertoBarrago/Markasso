import { describe, expect, it } from 'vitest';
import { classifyHandPose } from '../src/gesture/landmark_geometry';
import { hand } from './gesture_fixtures';

describe('classifyHandPose', () => {
  it.each([
    ['open', 'open'],
    ['point', 'point'],
    ['pinch', 'pinch'],
    ['none', 'fist'],
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

  it('recognizes pointing when one resting finger is partly extended', () => {
    const realisticPoint = [...hand('point')];
    realisticPoint[12] = { x: 0.52, y: 0.3 };
    expect(classifyHandPose(realisticPoint, 'none')).toBe('point');
  });

  it('does not mistake multiple extended fingers for pointing', () => {
    const ambiguousHand = [...hand('point')];
    ambiguousHand[12] = { x: 0.47, y: 0.18 };
    ambiguousHand[16] = { x: 0.54, y: 0.18 };
    expect(classifyHandPose(ambiguousHand, 'none')).toBe('none');
  });
});
