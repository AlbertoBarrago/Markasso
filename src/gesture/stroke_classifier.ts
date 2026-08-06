import type { GesturePoint } from './types';

export type StrokeShape =
  | { type: 'line'; start: GesturePoint; end: GesturePoint }
  | { type: 'rectangle'; x: number; y: number; width: number; height: number }
  | { type: 'ellipse'; x: number; y: number; width: number; height: number };

export function classifyStroke(
  points: ReadonlyArray<GesturePoint>,
): StrokeShape | null {
  if (points.length < 8) return null;
  const bounds = getBounds(points);
  const diagonal = Math.hypot(bounds.width, bounds.height);
  if (diagonal < 0.04) return null;

  const start = points[0]!;
  const end = points.at(-1)!;
  const pathLength = polylineLength(points);
  const directness = distance(start, end) / Math.max(pathLength, 0.001);
  if (directness > 0.9) return { type: 'line', start, end };

  const closed = distance(start, end) < diagonal * 0.3;
  if (!closed || bounds.width < 0.035 || bounds.height < 0.035) return null;

  const edgeFit =
    points.reduce((sum, point) => {
      const horizontal =
        Math.min(
          Math.abs(point.x - bounds.x),
          Math.abs(point.x - bounds.x - bounds.width),
        ) / bounds.width;
      const vertical =
        Math.min(
          Math.abs(point.y - bounds.y),
          Math.abs(point.y - bounds.y - bounds.height),
        ) / bounds.height;
      return sum + Math.min(horizontal, vertical);
    }, 0) / points.length;

  if (edgeFit < 0.045) return { type: 'rectangle', ...bounds };
  return { type: 'ellipse', ...bounds };
}

function getBounds(points: ReadonlyArray<GesturePoint>) {
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
}

function polylineLength(points: ReadonlyArray<GesturePoint>): number {
  let length = 0;
  for (let index = 1; index < points.length; index++) {
    length += distance(points[index - 1]!, points[index]!);
  }
  return length;
}

function distance(a: GesturePoint, b: GesturePoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
