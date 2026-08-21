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

const DEFAULT_PREDICTION_HORIZON_MS = 40;
const DEFAULT_MAX_PREDICTION_PX = 40;
const VELOCITY_SMOOTHING = 0.45;

/**
 * Short-horizon visual predictor. It never changes recognition samples; it
 * only estimates where the already-filtered cursor is at render time.
 */
export class PointMotionPredictor {
  private point: GesturePoint | null = null;
  private timestamp: number | null = null;
  private velocityX = 0;
  private velocityY = 0;

  update(point: GesturePoint, timestamp: number): void {
    if (this.point && this.timestamp !== null) {
      const dt = timestamp - this.timestamp;
      if (dt > 0) {
        const velocityX = (point.x - this.point.x) / dt;
        const velocityY = (point.y - this.point.y) / dt;
        this.velocityX = lerp(this.velocityX, velocityX, VELOCITY_SMOOTHING);
        this.velocityY = lerp(this.velocityY, velocityY, VELOCITY_SMOOTHING);
      }
    }
    this.point = point;
    this.timestamp = timestamp;
  }

  predict(
    timestamp: number,
    viewportWidth: number,
    viewportHeight: number,
  ): GesturePoint | null {
    if (!this.point || this.timestamp === null) return null;
    const horizon = Math.min(
      Math.max(timestamp - this.timestamp, 0),
      DEFAULT_PREDICTION_HORIZON_MS,
    );
    let dx = this.velocityX * horizon;
    let dy = this.velocityY * horizon;
    const distancePx = Math.hypot(dx * viewportWidth, dy * viewportHeight);
    if (distancePx > DEFAULT_MAX_PREDICTION_PX) {
      const scale = DEFAULT_MAX_PREDICTION_PX / distancePx;
      dx *= scale;
      dy *= scale;
    }
    return {
      x: this.point.x + dx,
      y: this.point.y + dy,
      ...(this.point.z !== undefined && { z: this.point.z }),
    };
  }

  reset(): void {
    this.point = null;
    this.timestamp = null;
    this.velocityX = 0;
    this.velocityY = 0;
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
