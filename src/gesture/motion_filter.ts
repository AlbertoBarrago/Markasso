import type { GesturePoint } from './types';

const MAX_SAMPLE_GAP_MS = 500;

export class PointOneEuroFilter {
  private readonly x = new OneEuroFilter();
  private readonly y = new OneEuroFilter();
  private timestamp: number | null = null;

  filter(point: GesturePoint, timestamp: number): GesturePoint {
    if (this.timestamp !== null && timestamp <= this.timestamp) {
      return {
        x: this.x.value ?? point.x,
        y: this.y.value ?? point.y,
        ...(point.z !== undefined && { z: point.z }),
      };
    }
    if (
      this.timestamp !== null &&
      timestamp - this.timestamp > MAX_SAMPLE_GAP_MS
    ) {
      this.reset();
    }
    this.timestamp = timestamp;
    return {
      x: this.x.filter(point.x, timestamp),
      y: this.y.filter(point.y, timestamp),
      ...(point.z !== undefined && { z: point.z }),
    };
  }

  reset(): void {
    this.x.reset();
    this.y.reset();
    this.timestamp = null;
  }
}

const DRAWING_TRACE_WINDOW = 3;

/**
 * Small fixed-window moving average for the live freehand trace. Much
 * lighter than PointOneEuroFilter's cutoff-based smoothing (which was
 * deliberately dropped from drawing — see "fix: remove gesture drawing lag")
 * — it only tempers single-frame landmark jitter over 2-3 samples, so it
 * doesn't reintroduce perceptible lag while still straightening the stroke.
 */
export class TraceSmoothingFilter {
  private readonly samples: GesturePoint[] = [];

  filter(point: GesturePoint): GesturePoint {
    this.samples.push(point);
    if (this.samples.length > DRAWING_TRACE_WINDOW) this.samples.shift();
    const n = this.samples.length;
    const x = this.samples.reduce((sum, sample) => sum + sample.x, 0) / n;
    const y = this.samples.reduce((sum, sample) => sum + sample.y, 0) / n;
    return { x, y, ...(point.z !== undefined && { z: point.z }) };
  }

  reset(): void {
    this.samples.length = 0;
  }
}

const DEFAULT_PREDICTION_HORIZON_MS = 40;
const DEFAULT_MAX_PREDICTION_PX = 40;
const PREDICTION_STALE_AFTER_MS = 80;
const PREDICTION_SETTLE_MS = 120;
const MAX_PREDICTOR_SAMPLE_GAP_MS = 250;
const VELOCITY_SMOOTHING = 0.45;

/**
 * Short-horizon interaction predictor. It never changes recognition samples;
 * it estimates where the filtered cursor is between camera frames so visual
 * feedback and direct manipulation can share the same responsive position.
 */
export class PointMotionPredictor {
  private point: GesturePoint | null = null;
  private timestamp: number | null = null;
  private velocityX = 0;
  private velocityY = 0;

  update(point: GesturePoint, timestamp: number): void {
    if (this.point && this.timestamp !== null) {
      const dt = timestamp - this.timestamp;
      if (dt <= 0) return;
      if (dt > MAX_PREDICTOR_SAMPLE_GAP_MS) {
        this.velocityX = 0;
        this.velocityY = 0;
      } else {
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
    const age = Math.max(timestamp - this.timestamp, 0);
    const staleFactor =
      age <= PREDICTION_STALE_AFTER_MS
        ? 1
        : Math.max(
            0,
            1 - (age - PREDICTION_STALE_AFTER_MS) / PREDICTION_SETTLE_MS,
          );
    let dx = this.velocityX * horizon * staleFactor;
    let dy = this.velocityY * horizon * staleFactor;
    const distancePx = Math.hypot(dx * viewportWidth, dy * viewportHeight);
    if (distancePx > DEFAULT_MAX_PREDICTION_PX) {
      const scale = DEFAULT_MAX_PREDICTION_PX / distancePx;
      dx *= scale;
      dy *= scale;
    }
    return {
      x: clamp(this.point.x + dx, 0, 1),
      y: clamp(this.point.y + dy, 0, 1),
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

  get value(): number | null {
    return this.filteredValue;
  }

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

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
