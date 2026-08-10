import type { GesturePoint } from './types';

export class PointOneEuroFilter {
  private readonly x = new OneEuroFilter();
  private readonly y = new OneEuroFilter();

  filter(point: GesturePoint, timestamp: number): GesturePoint {
    return {
      x: this.x.filter(point.x, timestamp),
      y: this.y.filter(point.y, timestamp),
      ...(point.z !== undefined && { z: point.z }),
    };
  }

  reset(): void {
    this.x.reset();
    this.y.reset();
  }
}

class OneEuroFilter {
  private rawValue: number | null = null;
  private filteredValue: number | null = null;
  private filteredDerivative = 0;
  private timestamp: number | null = null;

  filter(value: number, timestamp: number): number {
    if (
      this.rawValue === null ||
      this.filteredValue === null ||
      this.timestamp === null
    ) {
      this.rawValue = value;
      this.filteredValue = value;
      this.timestamp = timestamp;
      return value;
    }
    const dt = Math.max((timestamp - this.timestamp) / 1000, 1 / 120);
    const rawDerivative = (value - this.rawValue) / dt;
    this.filteredDerivative = lerp(
      this.filteredDerivative,
      rawDerivative,
      alpha(1, dt),
    );
    // Higher mincutoff (was 0.8) trims lag when the hand is nearly still;
    // higher beta (was 0.035) lets the cutoff open up faster during quick
    // motion, so the cursor keeps pace with the fingertip instead of trailing.
    const cutoff = 1.4 + 0.09 * Math.abs(this.filteredDerivative);
    this.filteredValue = lerp(this.filteredValue, value, alpha(cutoff, dt));
    this.rawValue = value;
    this.timestamp = timestamp;
    return this.filteredValue;
  }

  reset(): void {
    this.rawValue = null;
    this.filteredValue = null;
    this.filteredDerivative = 0;
    this.timestamp = null;
  }
}

function alpha(cutoff: number, dt: number): number {
  const timeConstant = 1 / (2 * Math.PI * cutoff);
  return 1 / (1 + timeConstant / dt);
}

function lerp(from: number, to: number, amount: number): number {
  return from + (to - from) * amount;
}
