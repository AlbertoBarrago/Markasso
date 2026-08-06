import type { GesturePoint, HandLandmarks } from '../src/gesture/types';

export type FixturePose = 'open' | 'pinch' | 'point' | 'none';

export function hand(
  pose: FixturePose,
  offsetX = 0,
  rotation = 0,
): HandLandmarks {
  const points: GesturePoint[] = Array.from({ length: 21 }, () => ({
    x: 0.5,
    y: 0.55,
  }));
  points[0] = { x: 0.5, y: 0.82 };
  setFinger(points, [5, 6, 7, 8], 0.4, pose === 'open' || pose === 'point');
  setFinger(points, [9, 10, 11, 12], 0.47, pose === 'open');
  setFinger(points, [13, 14, 15, 16], 0.54, pose === 'open');
  setFinger(points, [17, 18, 19, 20], 0.61, pose === 'open');
  points[1] = { x: 0.43, y: 0.66 };
  points[2] = { x: 0.37, y: 0.61 };
  points[3] = { x: 0.31, y: 0.55 };
  points[4] =
    pose === 'pinch'
      ? { x: points[8]!.x + 0.01, y: points[8]!.y + 0.01 }
      : { x: 0.27, y: 0.49 };

  return points.map((point) =>
    rotate({ x: point.x + offsetX, y: point.y }, rotation),
  );
}

function setFinger(
  points: GesturePoint[],
  indices: readonly [number, number, number, number],
  x: number,
  extended: boolean,
): void {
  const [mcp, pip, dip, tip] = indices;
  points[mcp] = { x, y: 0.57 };
  points[pip] = { x, y: 0.43 };
  points[dip] = { x, y: extended ? 0.3 : 0.49 };
  points[tip] = { x, y: extended ? 0.18 : 0.56 };
}

function rotate(point: GesturePoint, radians: number): GesturePoint {
  const x = point.x - 0.5;
  const y = point.y - 0.5;
  return {
    x: 0.5 + x * Math.cos(radians) - y * Math.sin(radians),
    y: 0.5 + x * Math.sin(radians) + y * Math.cos(radians),
  };
}
