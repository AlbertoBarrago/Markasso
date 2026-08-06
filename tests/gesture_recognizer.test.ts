import { describe, expect, it } from 'vitest';
import { GestureRecognizer } from '../src/gesture/gesture_recognizer';
import type { GesturePoint } from '../src/gesture/types';

describe('GestureRecognizer', () => {
  it('maps an open hand to ready', () => {
    expect(new GestureRecognizer().update(hand('open')).state).toBe('ready');
  });

  it('emits pinch lifecycle events', () => {
    const recognizer = new GestureRecognizer();
    expect(recognizer.update(hand('pinch')).events[0]?.type).toBe(
      'pinch-start',
    );
    expect(recognizer.update(hand('pinch', 0.04)).events[0]?.type).toBe(
      'pinch-move',
    );
    expect(recognizer.update(hand('open')).events[0]?.type).toBe('pinch-end');
  });

  it('finishes an air stroke when the hand opens', () => {
    const recognizer = new GestureRecognizer();
    for (let index = 0; index < 12; index++)
      recognizer.update(hand('point', index * 0.01));
    expect(
      recognizer
        .update(hand('open'))
        .events.some((event) => event.type === 'stroke-end'),
    ).toBe(true);
  });
});

function hand(pose: 'open' | 'pinch' | 'point', offset = 0): GesturePoint[] {
  const points = Array.from({ length: 21 }, () => ({ x: 0.5, y: 0.55 }));
  points[0] = { x: 0.5, y: 0.8 };
  points[9] = { x: 0.5, y: 0.5 };
  for (const pip of [6, 10, 14, 18]) points[pip] = { x: 0.5, y: 0.42 };
  for (const tip of [8, 12, 16, 20])
    points[tip] = { x: 0.5, y: pose === 'open' ? 0.2 : 0.58 };
  points[8] = { x: 0.5 + offset, y: pose === 'point' ? 0.2 : points[8]!.y };
  points[4] =
    pose === 'pinch'
      ? { x: points[8]!.x + 0.01, y: points[8]!.y + 0.01 }
      : { x: 0.3, y: 0.5 };
  return points;
}
