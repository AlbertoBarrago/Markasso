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
const ARM_MOVEMENT_RADIUS = 0.04;
const SELECT_ALL_HOLD_MS = 600;
const SELECT_ALL_MOVEMENT_RADIUS = 0.045;
// The open hand also confirms/ends other gestures (pinch-end, stroke-end), so
// it's often briefly open right after finishing one — wait this long after
// settling into 'open' before letting the select-all hold start counting, so
// that natural resting doesn't read as a deliberate select-all request.
const OPEN_SETTLE_MS = 700;
const TRACKING_GRACE_MS = 200;
// Losing the 'point' pose to 'none' mid-stroke is usually a tracking hiccup
// (occluded fingertip, brief low-confidence frame) — tolerate it generously.
const DRAWING_POSE_GRACE_MS = 1_300;
// A fist mid-stroke tolerates brief tracking noise before it cancels the
// drawing outright — kept short so an intentional fist-to-delete right after
// finishing a stroke doesn't have to wait out a long window.
const DRAWING_POSE_GRACE_RECENT_MS = 500;
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
  private lastPalmScale: number | null = null;
  private lastTrackedAt = 0;
  private poseUncertainSince: number | null = null;
  private selectAllOrigin: GesturePoint | null = null;
  private selectAllStartedAt = 0;
  private openReadyAt = 0;
  private readonly cursorFilter = new PointOneEuroFilter();
  // The fingertip landmark is noisier than the palm center for poses that
  // hold roughly still (e.g. an open hand held for select-all) — the palm
  // stays put more reliably, so hold-based gestures track it instead.
  private readonly palmFilter = new PointOneEuroFilter();

  update(
    landmarks: HandLandmarks | null,
    timestamp = performance.now(),
  ): GestureFrame {
    if (!landmarks || landmarks.length < 21) {
      return this.handleTrackingLoss(timestamp);
    }

    this.lastTrackedAt = timestamp;
    this.lastLandmarks = landmarks.map(mirror);
    this.lastPalmScale = distance(landmarks[0]!, landmarks[9]!);
    const cursor = this.cursorFilter.filter(mirror(landmarks[8]!), timestamp);
    this.lastCursor = cursor;
    const rawPalm = mirror(midpoint(landmarks[0]!, landmarks[9]!));
    const palm = this.palmFilter.filter(rawPalm, timestamp);
    const rawPose = classifyHandPose(landmarks, this.stablePose);
    const pose = this.stabilizePose(rawPose);
    const events: GestureEvent[] = [];
    let armProgress = 0;

    if (rawPose === 'none' || rawPose === 'fist') {
      this.poseUncertainSince ??= timestamp;
    } else {
      this.poseUncertainSince = null;
    }
    // A raw misclassification for a single frame (e.g. the index finger's
    // angle to the camera shifting mid-curve) would otherwise stall an
    // in-progress stroke every time it happens — trace this frame using the
    // already-debounced pose instead of bailing, as long as we're mid-draw.
    if (rawPose !== pose && this.state !== 'drawing') {
      return this.currentFrame(cursor, [], armProgress);
    }

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
        // A fist cancels whatever's in progress — deletion itself is now a
        // swipe-and-confirm gesture handled at the hover level, not a hold.
        if (this.state === 'pinching') {
          events.push({ type: 'pinch-end', point: cursor });
          this.state = 'absent';
          break;
        }
        // A fist is geometrically close to "no clear pose" — while drawing,
        // tolerate it the same way 'none' is tolerated, so a brief tracking
        // hiccup mid-stroke doesn't read as an accidental cancel.
        if (this.state === 'drawing') {
          if (
            timestamp - (this.poseUncertainSince ?? timestamp) <=
            DRAWING_POSE_GRACE_RECENT_MS
          ) {
            break;
          }
          this.cancelDrawing();
          this.state = 'absent';
          break;
        }
        if (this.state === 'arming') this.cancelDrawing();
        this.state = 'ready';
        break;

      case 'open':
        if (this.state === 'pinching') {
          events.push({ type: 'pinch-end', point: cursor });
        }
        if (this.state === 'drawing') this.finishTrace(events);
        if (this.state === 'arming') this.cancelDrawing();
        if (this.state !== 'ready' && this.state !== 'selecting') {
          // First frame landing on 'open' from any other state — settle at
          // 'ready' rather than starting a select-all hold immediately, so
          // merely showing an open hand doesn't itself start the countdown.
          this.state = 'ready';
          this.selectAllOrigin = null;
          this.openReadyAt = timestamp;
          break;
        }
        if (timestamp - this.openReadyAt < OPEN_SETTLE_MS) break;
        armProgress = this.handleOpenHold(palm, timestamp, events);
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

    // While selecting, show the progress ring at the palm anchor that the
    // hold is actually measured against.
    return this.currentFrame(
      this.state === 'selecting' ? palm : cursor,
      events,
      armProgress,
    );
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
    this.lastPalmScale = null;
    this.lastTrackedAt = 0;
    this.poseUncertainSince = null;
    this.selectAllOrigin = null;
    this.selectAllStartedAt = 0;
    this.openReadyAt = 0;
    this.cursorFilter.reset();
    this.palmFilter.reset();
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

  private handleOpenHold(
    palmPoint: GesturePoint,
    timestamp: number,
    events: GestureEvent[],
  ): number {
    if (
      this.state !== 'selecting' ||
      !this.selectAllOrigin ||
      distance(this.selectAllOrigin, palmPoint) > SELECT_ALL_MOVEMENT_RADIUS
    ) {
      this.state = 'selecting';
      this.selectAllStartedAt = timestamp;
      this.selectAllOrigin = palmPoint;
      return 0;
    }
    const progress = Math.min(
      1,
      (timestamp - this.selectAllStartedAt) / SELECT_ALL_HOLD_MS,
    );
    if (progress >= 1) {
      events.push({ type: 'select-all' });
      this.selectAllOrigin = null;
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
    this.palmFilter.reset();
    this.lastCursor = null;
    this.lastLandmarks = null;
    this.lastPalmScale = null;
    this.poseUncertainSince = null;
    this.selectAllOrigin = null;
    this.selectAllStartedAt = 0;
    this.openReadyAt = 0;
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
      palmScale: this.lastPalmScale,
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

function midpoint(a: GesturePoint, b: GesturePoint): GesturePoint {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}
