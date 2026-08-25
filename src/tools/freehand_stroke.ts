export type FreehandPoint = readonly [number, number];

const RDP_EPSILON = 0.5;
const SMOOTH_PASSES = 2;

export function finishFreehandStroke(
  points: ReadonlyArray<FreehandPoint>,
  pressures?: ReadonlyArray<number>,
): { points: FreehandPoint[]; pressures?: number[] } {
  const smoothed = smoothCentered(points, pressures, SMOOTH_PASSES);
  return simplifyRDP(smoothed.points, smoothed.pressures, RDP_EPSILON);
}

function smoothCentered(
  points: ReadonlyArray<FreehandPoint>,
  pressures: ReadonlyArray<number> | undefined,
  passes: number,
): { points: FreehandPoint[]; pressures?: number[] } {
  if (points.length < 3) {
    return {
      points: [...points],
      ...(pressures && { pressures: [...pressures] }),
    };
  }

  let smoothedPoints = [...points];
  let smoothedPressures = pressures ? [...pressures] : undefined;
  for (let pass = 0; pass < passes; pass++) {
    const nextPoints: FreehandPoint[] = [smoothedPoints[0]!];
    const nextPressures = smoothedPressures
      ? [smoothedPressures[0]!]
      : undefined;
    for (let index = 1; index < smoothedPoints.length - 1; index++) {
      const previous = smoothedPoints[index - 1]!;
      const current = smoothedPoints[index]!;
      const next = smoothedPoints[index + 1]!;
      nextPoints.push([
        (previous[0] + 2 * current[0] + next[0]) / 4,
        (previous[1] + 2 * current[1] + next[1]) / 4,
      ]);
      if (nextPressures && smoothedPressures) {
        nextPressures.push(
          (smoothedPressures[index - 1]! +
            2 * smoothedPressures[index]! +
            smoothedPressures[index + 1]!) /
            4,
        );
      }
    }
    nextPoints.push(smoothedPoints.at(-1)!);
    if (nextPressures && smoothedPressures) {
      nextPressures.push(smoothedPressures.at(-1)!);
    }
    smoothedPoints = nextPoints;
    smoothedPressures = nextPressures;
  }
  return {
    points: smoothedPoints,
    ...(smoothedPressures && { pressures: smoothedPressures }),
  };
}

function simplifyRDP(
  points: ReadonlyArray<FreehandPoint>,
  pressures: ReadonlyArray<number> | undefined,
  epsilon: number,
): { points: FreehandPoint[]; pressures?: number[] } {
  if (points.length <= 2) {
    return {
      points: [...points],
      ...(pressures && { pressures: [...pressures] }),
    };
  }

  let maxDistance = 0;
  let maxIndex = 0;
  const first = points[0]!;
  const last = points.at(-1)!;
  for (let index = 1; index < points.length - 1; index++) {
    const distance = perpendicularDistance(points[index]!, first, last);
    if (distance > maxDistance) {
      maxDistance = distance;
      maxIndex = index;
    }
  }

  if (maxDistance > epsilon) {
    const left = simplifyRDP(
      points.slice(0, maxIndex + 1),
      pressures?.slice(0, maxIndex + 1),
      epsilon,
    );
    const right = simplifyRDP(
      points.slice(maxIndex),
      pressures?.slice(maxIndex),
      epsilon,
    );
    return {
      points: [...left.points.slice(0, -1), ...right.points],
      ...(left.pressures &&
        right.pressures && {
          pressures: [...left.pressures.slice(0, -1), ...right.pressures],
        }),
    };
  }

  return {
    points: [first, last],
    ...(pressures && { pressures: [pressures[0]!, pressures.at(-1)!] }),
  };
}

function perpendicularDistance(
  point: FreehandPoint,
  lineStart: FreehandPoint,
  lineEnd: FreehandPoint,
): number {
  const dx = lineEnd[0] - lineStart[0];
  const dy = lineEnd[1] - lineStart[1];
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) {
    return Math.hypot(point[0] - lineStart[0], point[1] - lineStart[1]);
  }
  const position =
    ((point[0] - lineStart[0]) * dx + (point[1] - lineStart[1]) * dy) /
    lengthSquared;
  return Math.hypot(
    point[0] - (lineStart[0] + position * dx),
    point[1] - (lineStart[1] + position * dy),
  );
}
