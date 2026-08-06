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

export class GestureRecognizer {
  private state: GestureState = 'absent';
  private trace: GesturePoint[] = [];
  private smoothedCursor: GesturePoint | null = null;

  update(landmarks: HandLandmarks | null): GestureFrame {
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

    if (isPinch) {
      if (this.state === 'drawing') this.finishTrace(events);
      events.push({
        type: this.state === 'pinching' ? 'pinch-move' : 'pinch-start',
        point: cursor,
      });
      this.state = 'pinching';
    } else if (isPointing) {
      if (this.state === 'pinching')
        events.push({ type: 'pinch-end', point: cursor });
      if (this.state !== 'drawing') {
        this.trace = [cursor];
        events.push({ type: 'stroke-start', point: cursor });
      } else if (distance(this.trace.at(-1)!, cursor) > 0.006) {
        this.trace.push(cursor);
        events.push({ type: 'stroke-move', point: cursor });
      }
      this.state = 'drawing';
    } else {
      if (this.state === 'pinching')
        events.push({ type: 'pinch-end', point: cursor });
      if (this.state === 'drawing' && isOpen) this.finishTrace(events);
      this.state = isOpen ? 'ready' : 'absent';
    }

    return {
      state: this.state,
      cursor,
      landmarks: landmarks.map(mirror),
      trace: [...this.trace],
      events,
    };
  }

  reset(): void {
    this.state = 'absent';
    this.trace = [];
    this.smoothedCursor = null;
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
      events,
    };
  }

  private finishTrace(events: GestureEvent[]): void {
    if (this.trace.length >= MIN_TRACE_POINTS) {
      events.push({ type: 'stroke-end', points: [...this.trace] });
    }
    this.trace = [];
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
