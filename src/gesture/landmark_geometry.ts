import type { GesturePoint, HandLandmarks } from './types';

export type HandPose = 'open' | 'pinch' | 'point' | 'fist' | 'none';

const FINGERS = [
  [5, 6, 8],
  [9, 10, 12],
  [13, 14, 16],
  [17, 18, 20],
] as const;
const EXTENSION_MIN_ANGLE = (105 * Math.PI) / 180;
const EXTENSION_MAX_ANGLE = (170 * Math.PI) / 180;
const OPEN_EXTENSION_SCORE = 0.77;
const POINT_INDEX_SCORE = 0.55;
const POINT_OTHER_EXTENSION_SCORE = 0.77;
const POINT_DOMINANCE = 0.12;
const PINCH_ENTER_RATIO = 0.32;
const PINCH_EXIT_RATIO = 0.46;
const FIST_MAX_EXTENSION = 0.3;

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

  const extensionScores = FINGERS.map(([mcp, pip, tip]) =>
    fingerExtensionScore(hand[mcp]!, hand[pip]!, hand[tip]!),
  );
  if (extensionScores.every((score) => score >= OPEN_EXTENSION_SCORE)) {
    return 'open';
  }

  const indexScore = extensionScores[0]!;
  const otherScores = extensionScores.slice(1);
  const averageOtherScore =
    otherScores.reduce((sum, score) => sum + score, 0) / otherScores.length;
  const extendedOtherFingers = otherScores.filter(
    (score) => score >= POINT_OTHER_EXTENSION_SCORE,
  ).length;
  if (
    indexScore >= POINT_INDEX_SCORE &&
    indexScore - averageOtherScore >= POINT_DOMINANCE &&
    extendedOtherFingers <= 1
  ) {
    return 'point';
  }
  if (extensionScores.every((score) => score <= FIST_MAX_EXTENSION)) {
    return 'fist';
  }
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

function fingerExtensionScore(
  mcp: GesturePoint,
  pip: GesturePoint,
  tip: GesturePoint,
): number {
  const angle = jointAngle(mcp, pip, tip);
  return clamp(
    (angle - EXTENSION_MIN_ANGLE) / (EXTENSION_MAX_ANGLE - EXTENSION_MIN_ANGLE),
  );
}

function clamp(value: number): number {
  return Math.max(0, Math.min(1, value));
}
