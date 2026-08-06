import { recognizeStroke } from './stroke_classifier';
import type {
  GestureEvent,
  GestureFrame,
  GesturePoint,
  GestureState,
  HandLandmarks,
} from './types';

const PINCH_ENTER_RATIO = 0.32;
const PINCH_EXIT_RATIO = 0.46;
const MIN_TRACE_POINTS = 8;
const ARM_DURATION_MS = 400;
const ARM_MOVEMENT_RADIUS = 0.025;

export class GestureRecognizer {
  private state: GestureState = 'absent';
  private trace: GesturePoint[] = [];
  private smoothedCursor: GesturePoint | null = null;
  private armStartedAt = 0;
  private armOrigin: GesturePoint | null = null;

  update(
    landmarks: HandLandmarks | null,
    timestamp = performance.now(),
  ): GestureFrame {
    if (!landmarks || landmarks.length < 21) return this.handleAbsent();

    const cursor = this.smooth(mirror(landmarks[8]!));
    const thumb = landmarks[4]!;
    const index = landmarks[8]!;
    const palmScale = Math.max(distance(landmarks[0]!, landmarks[9]!), 0.001);
    const pinchRatio = distance(thumb, index) / palmScale;
    const isPinch =
      this.state === 'pinching'
        ? pinchRatio < PINCH_EXIT_RATIO
        : pinchRatio < PINCH_ENTER_RATIO;
    const isPointing =
      fingerExtended(landmarks, 8, 6) &&
      !fingerExtended(landmarks, 12, 10) &&
      !fingerExtended(landmarks, 16, 14) &&
      !fingerExtended(landmarks, 20, 18);
    const isOpen = [8, 12, 16, 20].every((tip, indexPosition) =>
      fingerExtended(landmarks, tip, [6, 10, 14, 18][indexPosition]!),
    );
    const events: GestureEvent[] = [];
    let armProgress = 0;

    if (isPinch) {
      this.cancelDrawing();
      events.push({
        type: this.state === 'pinching' ? 'pinch-move' : 'pinch-start',
        point: cursor,
      });
      this.state = 'pinching';
    } else if (isPointing) {
      if (this.state === 'pinching')
        events.push({ type: 'pinch-end', point: cursor });
      if (this.state === 'drawing') {
        if (distance(this.trace.at(-1)!, cursor) > 0.006) {
          this.trace.push(cursor);
          events.push({ type: 'stroke-move', point: cursor });
        }
      } else if (
        this.state !== 'arming' ||
        !this.armOrigin ||
        distance(this.armOrigin, cursor) > ARM_MOVEMENT_RADIUS
      ) {
        this.state = 'arming';
        this.armStartedAt = timestamp;
        this.armOrigin = cursor;
      } else {
        armProgress = Math.min(
          1,
          (timestamp - this.armStartedAt) / ARM_DURATION_MS,
        );
        if (armProgress >= 1) {
          this.state = 'drawing';
          this.trace = [cursor];
          this.armOrigin = null;
          events.push({ type: 'stroke-start', point: cursor });
        }
      }
      if (this.state === 'drawing' && this.trace.length === 0) {
        this.trace.push(cursor);
      }
    } else {
      if (this.state === 'pinching')
        events.push({ type: 'pinch-end', point: cursor });
      if (this.state === 'drawing' && isOpen) this.finishTrace(events);
      if (this.state === 'arming') this.cancelDrawing();
      this.state = isOpen ? 'ready' : 'absent';
    }

    const prediction = recognizeStroke(this.trace)?.shape.type ?? null;

    return {
      state: this.state,
      cursor,
      landmarks: landmarks.map(mirror),
      trace: [...this.trace],
      armProgress,
      prediction,
      events,
    };
  }

  reset(): void {
    this.state = 'absent';
    this.trace = [];
    this.smoothedCursor = null;
    this.armOrigin = null;
    this.armStartedAt = 0;
  }

  private handleAbsent(): GestureFrame {
    const events: GestureEvent[] = [];
    if (this.state === 'pinching') {
      const point = this.trace.at(-1) ?? { x: 0.5, y: 0.5 };
      events.push({ type: 'pinch-end', point });
    }
    this.state = 'absent';
    this.trace = [];
    this.smoothedCursor = null;
    return {
      state: 'absent',
      cursor: null,
      landmarks: null,
      trace: [],
      armProgress: 0,
      prediction: null,
      events,
    };
  }

  private finishTrace(events: GestureEvent[]): void {
    if (this.trace.length >= MIN_TRACE_POINTS) {
      events.push({ type: 'stroke-end', points: [...this.trace] });
    }
    this.trace = [];
    this.armOrigin = null;
  }

  private cancelDrawing(): void {
    this.trace = [];
    this.armOrigin = null;
    this.armStartedAt = 0;
  }

  private smooth(point: GesturePoint): GesturePoint {
    const previous = this.smoothedCursor;
    this.smoothedCursor = previous
      ? {
          x: previous.x + (point.x - previous.x) * 0.45,
          y: previous.y + (point.y - previous.y) * 0.45,
        }
      : point;
    return this.smoothedCursor;
  }
}

function fingerExtended(
  hand: HandLandmarks,
  tip: number,
  pip: number,
): boolean {
  return hand[tip]!.y < hand[pip]!.y - 0.015;
}

function mirror(point: GesturePoint): GesturePoint {
  return {
    x: 1 - point.x,
    y: point.y,
    ...(point.z !== undefined && { z: point.z }),
  };
}

function distance(a: GesturePoint, b: GesturePoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
