import type { GesturePoint, HandLandmarks } from './types';

export type HandPose = 'open' | 'pinch' | 'point' | 'none';

const FINGERS = [
  [5, 6, 8],
  [9, 10, 12],
  [13, 14, 16],
  [17, 18, 20],
] as const;
const EXTENDED_ANGLE = (155 * Math.PI) / 180;
const PINCH_ENTER_RATIO = 0.32;
const PINCH_EXIT_RATIO = 0.46;

export function classifyHandPose(
  hand: HandLandmarks,
  previousPose: HandPose,
): HandPose {
  if (hand.length < 21) return 'none';
  const palmScale = Math.max(distance(hand[0]!, hand[9]!), 0.001);
  const pinchRatio = distance(hand[4]!, hand[8]!) / palmScale;
  const pinchThreshold =
    previousPose === 'pinch' ? PINCH_EXIT_RATIO : PINCH_ENTER_RATIO;
  if (pinchRatio < pinchThreshold) return 'pinch';

  const extended = FINGERS.map(
    ([mcp, pip, tip]) =>
      jointAngle(hand[mcp]!, hand[pip]!, hand[tip]!) > EXTENDED_ANGLE,
  );
  if (extended.every(Boolean)) return 'open';
  if (extended[0] && extended.slice(1).every((value) => !value)) return 'point';
  return 'none';
}

export function distance(a: GesturePoint, b: GesturePoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function jointAngle(
  a: GesturePoint,
  vertex: GesturePoint,
  c: GesturePoint,
): number {
  const ax = a.x - vertex.x;
  const ay = a.y - vertex.y;
  const cx = c.x - vertex.x;
  const cy = c.y - vertex.y;
  const denominator = Math.max(Math.hypot(ax, ay) * Math.hypot(cx, cy), 1e-6);
  return Math.acos(
    Math.max(-1, Math.min(1, (ax * cx + ay * cy) / denominator)),
  );
}
