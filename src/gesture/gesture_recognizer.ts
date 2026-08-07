import { classifyHandPose, distance, type HandPose } from './landmark_geometry';
import { PointOneEuroFilter } from './motion_filter';
import { recognizeStroke } from './stroke_classifier';
import type {
  GestureEvent,
  GestureFrame,
  GesturePoint,
  GestureState,
  HandLandmarks,
} from './types';

const MIN_TRACE_POINTS = 8;
const ARM_DURATION_MS = 400;
const ARM_MOVEMENT_RADIUS = 0.025;
const DELETE_HOLD_MS = 600;
const DELETE_MOVEMENT_RADIUS = 0.03;
const TRACKING_GRACE_MS = 200;
const DRAWING_POSE_GRACE_MS = 1_300;
const DRAWING_TRACKING_GRACE_MS = 1_000;
const POSE_CONFIRMATION_FRAMES: Record<HandPose, number> = {
  pinch: 2,
  open: 3,
  point: 2,
  fist: 3,
  none: 4,
};
// While drawing, require more consecutive uncertain frames before dropping
// 'point' — losing the pose mid-stroke is costlier than a slow entry.
const DRAWING_NONE_CONFIRMATION_FRAMES = 6;

export class GestureRecognizer {
  private state: GestureState = 'absent';
  private stablePose: HandPose = 'none';
  private candidatePose: HandPose = 'none';
  private candidateFrames = 0;
  private trace: GesturePoint[] = [];
  private armStartedAt = 0;
  private armOrigin: GesturePoint | null = null;
  private lastCursor: GesturePoint | null = null;
  private lastLandmarks: HandLandmarks | null = null;
  private lastTrackedAt = 0;
  private poseUncertainSince: number | null = null;
  private deleteOrigin: GesturePoint | null = null;
  private deleteStartedAt = 0;
  private readonly cursorFilter = new PointOneEuroFilter();

  update(
    landmarks: HandLandmarks | null,
    timestamp = performance.now(),
  ): GestureFrame {
    if (!landmarks || landmarks.length < 21) {
      return this.handleTrackingLoss(timestamp);
    }

    this.lastTrackedAt = timestamp;
    this.lastLandmarks = landmarks.map(mirror);
    const cursor = this.cursorFilter.filter(mirror(landmarks[8]!), timestamp);
    this.lastCursor = cursor;
    const rawPose = classifyHandPose(landmarks, this.stablePose);
    const pose = this.stabilizePose(rawPose);
    const events: GestureEvent[] = [];
    let armProgress = 0;

    if (rawPose === 'none' || rawPose === 'fist') {
      this.poseUncertainSince ??= timestamp;
    } else {
      this.poseUncertainSince = null;
    }
    if (rawPose !== pose) return this.currentFrame(cursor, [], armProgress);

    switch (pose) {
      case 'pinch':
        this.cancelDrawing();
        events.push({
          type: this.state === 'pinching' ? 'pinch-move' : 'pinch-start',
          point: cursor,
        });
        this.state = 'pinching';
        break;

      case 'point':
        if (this.state === 'pinching') {
          events.push({ type: 'pinch-end', point: cursor });
        }
        armProgress = this.handlePointing(cursor, timestamp, events);
        break;

      case 'fist':
        if (this.state === 'pinching') {
          events.push({ type: 'pinch-end', point: cursor });
          this.state = 'absent';
          break;
        }
        // A fist is geometrically close to "no clear pose" — while drawing,
        // tolerate it the same way 'none' is tolerated, so a brief tracking
        // hiccup mid-stroke doesn't read as an accidental delete request.
        if (this.state === 'drawing') {
          if (
            timestamp - (this.poseUncertainSince ?? timestamp) <=
            DRAWING_POSE_GRACE_MS
          ) {
            break;
          }
          this.cancelDrawing();
          this.state = 'absent';
          break;
        }
        if (this.state === 'arming') this.cancelDrawing();
        armProgress = this.handleFist(cursor, timestamp, events);
        break;

      case 'open':
        if (this.state === 'pinching') {
          events.push({ type: 'pinch-end', point: cursor });
        }
        if (this.state === 'drawing') this.finishTrace(events);
        if (this.state === 'arming') this.cancelDrawing();
        this.state = 'ready';
        break;

      case 'none':
        if (this.state === 'pinching') {
          events.push({ type: 'pinch-end', point: cursor });
          this.state = 'absent';
        } else if (
          this.state === 'drawing' &&
          timestamp - (this.poseUncertainSince ?? timestamp) <=
            DRAWING_POSE_GRACE_MS
        ) {
          break;
        } else if (this.state !== 'drawing') {
          if (this.state === 'arming') this.cancelDrawing();
          this.state = 'absent';
        } else {
          this.cancelDrawing();
          this.state = 'absent';
        }
        break;
    }

    return this.currentFrame(cursor, events, armProgress);
  }

  reset(): void {
    this.state = 'absent';
    this.stablePose = 'none';
    this.candidatePose = 'none';
    this.candidateFrames = 0;
    this.trace = [];
    this.armOrigin = null;
    this.armStartedAt = 0;
    this.lastCursor = null;
    this.lastLandmarks = null;
    this.lastTrackedAt = 0;
    this.poseUncertainSince = null;
    this.deleteOrigin = null;
    this.deleteStartedAt = 0;
    this.cursorFilter.reset();
  }

  private stabilizePose(rawPose: HandPose): HandPose {
    if (rawPose === this.candidatePose) this.candidateFrames++;
    else {
      this.candidatePose = rawPose;
      this.candidateFrames = 1;
    }
    const requiredFrames =
      (rawPose === 'none' || rawPose === 'fist') && this.state === 'drawing'
        ? DRAWING_NONE_CONFIRMATION_FRAMES
        : POSE_CONFIRMATION_FRAMES[rawPose];
    if (rawPose !== this.stablePose && this.candidateFrames >= requiredFrames) {
      this.stablePose = rawPose;
    }
    return this.stablePose;
  }

  private handlePointing(
    cursor: GesturePoint,
    timestamp: number,
    events: GestureEvent[],
  ): number {
    if (this.state === 'drawing') {
      if (distance(this.trace.at(-1)!, cursor) > 0.004) {
        this.trace.push(cursor);
        events.push({ type: 'stroke-move', point: cursor });
      }
      return 1;
    }
    if (
      this.state !== 'arming' ||
      !this.armOrigin ||
      distance(this.armOrigin, cursor) > ARM_MOVEMENT_RADIUS
    ) {
      this.state = 'arming';
      this.armStartedAt = timestamp;
      this.armOrigin = cursor;
      return 0;
    }
    const progress = Math.min(
      1,
      (timestamp - this.armStartedAt) / ARM_DURATION_MS,
    );
    if (progress >= 1) {
      this.state = 'drawing';
      this.trace = [cursor];
      this.armOrigin = null;
      events.push({ type: 'stroke-start', point: cursor });
    }
    return progress;
  }

  private handleFist(
    cursor: GesturePoint,
    timestamp: number,
    events: GestureEvent[],
  ): number {
    if (
      this.state !== 'deleting' ||
      !this.deleteOrigin ||
      distance(this.deleteOrigin, cursor) > DELETE_MOVEMENT_RADIUS
    ) {
      this.state = 'deleting';
      this.deleteStartedAt = timestamp;
      this.deleteOrigin = cursor;
      return 0;
    }
    const progress = Math.min(
      1,
      (timestamp - this.deleteStartedAt) / DELETE_HOLD_MS,
    );
    if (progress >= 1) {
      events.push({ type: 'delete', point: cursor });
      this.deleteOrigin = null;
      this.state = 'ready';
    }
    return progress;
  }

  private handleTrackingLoss(timestamp: number): GestureFrame {
    const gracePeriod =
      this.state === 'drawing' ? DRAWING_TRACKING_GRACE_MS : TRACKING_GRACE_MS;
    if (
      this.lastCursor &&
      this.lastLandmarks &&
      timestamp - this.lastTrackedAt <= gracePeriod
    ) {
      return this.currentFrame(this.lastCursor, [], 0);
    }
    const events: GestureEvent[] = [];
    if (this.state === 'pinching' && this.lastCursor) {
      events.push({ type: 'pinch-end', point: this.lastCursor });
    }
    this.state = 'absent';
    this.stablePose = 'none';
    this.candidatePose = 'none';
    this.candidateFrames = 0;
    this.cancelDrawing();
    this.cursorFilter.reset();
    this.lastCursor = null;
    this.lastLandmarks = null;
    this.poseUncertainSince = null;
    this.deleteOrigin = null;
    this.deleteStartedAt = 0;
    return this.frame(null, null, events, 0, null, 0);
  }

  private currentFrame(
    cursor: GesturePoint,
    events: GestureEvent[],
    armProgress: number,
  ): GestureFrame {
    const recognition = recognizeStroke(this.trace);
    return this.frame(
      cursor,
      this.lastLandmarks,
      events,
      armProgress,
      recognition?.shape.type ?? null,
      recognition?.confidence ?? 0,
    );
  }

  private finishTrace(events: GestureEvent[]): void {
    if (this.trace.length >= MIN_TRACE_POINTS) {
      events.push({ type: 'stroke-end', points: [...this.trace] });
    }
    this.cancelDrawing();
  }

  private cancelDrawing(): void {
    this.trace = [];
    this.armOrigin = null;
    this.armStartedAt = 0;
  }

  private frame(
    cursor: GesturePoint | null,
    landmarks: HandLandmarks | null,
    events: GestureEvent[],
    armProgress: number,
    prediction: GestureFrame['prediction'],
    predictionConfidence: number,
  ): GestureFrame {
    return {
      state: this.state,
      cursor,
      landmarks,
      trace: [...this.trace],
      armProgress,
      prediction,
      predictionConfidence,
      events,
    };
  }
}

function mirror(point: GesturePoint): GesturePoint {
  return {
    x: 1 - point.x,
    y: point.y,
    ...(point.z !== undefined && { z: point.z }),
  };
}
