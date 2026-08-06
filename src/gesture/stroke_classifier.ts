import { distance } from './landmark_geometry';
import type { GesturePoint } from './types';

export type StrokeShape =
  | { type: 'line'; start: GesturePoint; end: GesturePoint }
  | { type: 'rectangle'; x: number; y: number; width: number; height: number }
  | { type: 'ellipse'; x: number; y: number; width: number; height: number };

export interface StrokeRecognition {
  readonly shape: StrokeShape;
  readonly confidence: number;
}

const SAMPLE_COUNT = 32;
const MIN_DIAGONAL = 0.04;
const MIN_CONFIDENCE = 0.35;

export function classifyStroke(
  points: ReadonlyArray<GesturePoint>,
): StrokeShape | null {
  return recognizeStroke(points)?.shape ?? null;
}

export function recognizeStroke(
  input: ReadonlyArray<GesturePoint>,
): StrokeRecognition | null {
  if (input.length < 8) return null;
  const points = resample(input, SAMPLE_COUNT);
  const bounds = getBounds(points);
  const diagonal = Math.hypot(bounds.width, bounds.height);
  if (diagonal < MIN_DIAGONAL) return null;

  const start = points[0]!;
  const end = points.at(-1)!;
  const pathLength = polylineLength(points);
  const directness = distance(start, end) / Math.max(pathLength, 0.001);
  const lineError = rmsLineError(points, start, end) / diagonal;
  const lineScore = lineError * 0.7 + (1 - directness) * 0.3;
  const closure = distance(start, end) / diagonal;

  if (closure > 0.32 && lineScore < 0.12) {
    return {
      shape: { type: 'line', start, end },
      confidence: clamp(1 - lineScore / 0.12),
    };
  }

  if (
    closure >= 0.32 ||
    pathLength < diagonal * 1.8 ||
    bounds.width < 0.035 ||
    bounds.height < 0.035
  ) {
    return null;
  }

  const closedPoints = [...points.slice(0, -1), start];
  const simplified = simplify(closedPoints, diagonal * 0.045);
  const cornerCount = Math.max(0, simplified.length - 1);
  const rectangleScore =
    boundingEdgeError(points, bounds) + Math.abs(cornerCount - 4) * 0.035;
  const ellipseScore = ellipseFitError(points, bounds);
  const isRectangle = rectangleScore < ellipseScore;
  const bestScore = Math.min(rectangleScore, ellipseScore);
  const threshold = isRectangle ? 0.15 : 0.18;
  if (bestScore >= threshold) return null;

  const margin = Math.abs(rectangleScore - ellipseScore);
  const confidence =
    clamp(1 - bestScore / threshold) * 0.72 + clamp(margin / 0.12) * 0.28;
  if (confidence < MIN_CONFIDENCE) return null;

  return {
    shape: { type: isRectangle ? 'rectangle' : 'ellipse', ...bounds },
    confidence,
  };
}

function resample(
  points: ReadonlyArray<GesturePoint>,
  count: number,
): GesturePoint[] {
  const total = polylineLength(points);
  if (total === 0) return [...points];
  const result: GesturePoint[] = [points[0]!];
  const interval = total / (count - 1);
  let traversed = 0;
  let segmentStart = points[0]!;
  let index = 1;
  while (index < points.length && result.length < count - 1) {
    const segmentEnd = points[index]!;
    const length = distance(segmentStart, segmentEnd);
    if (length > 0 && traversed + length >= interval) {
      const ratio = (interval - traversed) / length;
      segmentStart = {
        x: segmentStart.x + (segmentEnd.x - segmentStart.x) * ratio,
        y: segmentStart.y + (segmentEnd.y - segmentStart.y) * ratio,
      };
      result.push(segmentStart);
      traversed = 0;
    } else {
      traversed += length;
      segmentStart = segmentEnd;
      index++;
    }
  }
  result.push(points.at(-1)!);
  return result;
}

function simplify(
  points: ReadonlyArray<GesturePoint>,
  tolerance: number,
): GesturePoint[] {
  if (points.length <= 2) return [...points];
  let furthestIndex = 0;
  let furthestDistance = 0;
  for (let index = 1; index < points.length - 1; index++) {
    const error = pointToSegmentDistance(
      points[index]!,
      points[0]!,
      points.at(-1)!,
    );
    if (error > furthestDistance) {
      furthestDistance = error;
      furthestIndex = index;
    }
  }
  if (furthestDistance <= tolerance) return [points[0]!, points.at(-1)!];
  const left = simplify(points.slice(0, furthestIndex + 1), tolerance);
  const right = simplify(points.slice(furthestIndex), tolerance);
  return [...left.slice(0, -1), ...right];
}

function rmsLineError(
  points: ReadonlyArray<GesturePoint>,
  start: GesturePoint,
  end: GesturePoint,
): number {
  return Math.sqrt(
    points.reduce(
      (sum, point) => sum + pointToSegmentDistance(point, start, end) ** 2,
      0,
    ) / points.length,
  );
}

function boundingEdgeError(
  points: ReadonlyArray<GesturePoint>,
  bounds: ReturnType<typeof getBounds>,
): number {
  return (
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
    }, 0) / points.length
  );
}

function ellipseFitError(
  points: ReadonlyArray<GesturePoint>,
  bounds: ReturnType<typeof getBounds>,
): number {
  const centerX = bounds.x + bounds.width / 2;
  const centerY = bounds.y + bounds.height / 2;
  const radiusX = bounds.width / 2;
  const radiusY = bounds.height / 2;
  return (
    points.reduce((sum, point) => {
      const normalizedRadius = Math.hypot(
        (point.x - centerX) / radiusX,
        (point.y - centerY) / radiusY,
      );
      return sum + Math.abs(normalizedRadius - 1);
    }, 0) / points.length
  );
}

function pointToSegmentDistance(
  point: GesturePoint,
  start: GesturePoint,
  end: GesturePoint,
): number {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) return distance(point, start);
  const position = clamp(
    ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared,
  );
  return distance(point, {
    x: start.x + position * dx,
    y: start.y + position * dy,
  });
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

function clamp(value: number): number {
  return Math.max(0, Math.min(1, value));
}
