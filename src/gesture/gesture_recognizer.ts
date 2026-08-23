import { classifyHandPose, distance, type HandPose } from './landmark_geometry';
import { PointOneEuroFilter } from './motion_filter';
import { recognizeStroke, type StrokeRecognition } from './stroke_classifier';
import type {
  GestureEvent,
  GestureFrame,
  GesturePoint,
  GestureState,
  HandLandmarks,
} from './types';

const MIN_TRACE_POINTS = 8;
const MIN_TRACE_POINT_DISTANCE_PX = 2;
const LIVE_RECOGNITION_INTERVAL_MS = 100;
const SELECT_ALL_HOLD_MS = 600;
const SELECT_ALL_MOVEMENT_RADIUS = 0.045;
// The open hand also confirms/ends other gestures (pinch-end, stroke-end), so
// it's often briefly open right after finishing one — wait this long after
// settling into 'open' before letting the select-all hold start counting, so
// that natural resting doesn't read as a deliberate select-all request.
const OPEN_SETTLE_MS = 700;
const TRACKING_GRACE_MS = 200;
// Losing the 'point' pose to 'none' mid-stroke is usually a tracking hiccup.
// Keep a short grace period, then commit the valid partial trace rather than
// freezing and bridging a large jump when tracking eventually recovers.
const DRAWING_POSE_GRACE_MS = 500;
// A fist mid-stroke tolerates brief tracking noise before it cancels the
// drawing outright — kept short so an intentional fist-to-delete right after
// finishing a stroke doesn't have to wait out a long window.
const DRAWING_POSE_GRACE_RECENT_MS = 500;
const DRAWING_TRACKING_GRACE_MS = 350;
// Ending a stroke is destructive from the user's perspective: once committed,
// the trace can no longer be extended. Require a deliberate open hand for a
// fixed duration so release timing stays consistent across camera frame rates.
const DRAWING_RELEASE_HOLD_MS = 180;
const POSE_CONFIRMATION_FRAMES: Record<HandPose, number> = {
  pinch: 2,
  open: 3,
  point: 1,
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
  private lastCursor: GesturePoint | null = null;
  private lastLandmarks: HandLandmarks | null = null;
  private lastPalmScale: number | null = null;
  private lastTrackedAt: number | null = null;
  private poseUncertainSince: number | null = null;
  private drawingReleaseStartedAt: number | null = null;
  private selectAllOrigin: GesturePoint | null = null;
  private selectAllStartedAt = 0;
  private openReadyAt = 0;
  private lastRecognitionAt = Number.NEGATIVE_INFINITY;
  private cachedRecognition: StrokeRecognition | null = null;
  private readonly cursorFilter = new PointOneEuroFilter();
  // The fingertip landmark is noisier than the palm center for poses that
  // hold roughly still (e.g. an open hand held for select-all) — the palm
  // stays put more reliably, so hold-based gestures track it instead.
  private readonly palmFilter = new PointOneEuroFilter();

  update(
    landmarks: HandLandmarks | null,
    timestamp = performance.now(),
    viewport = { width: 1_000, height: 1_000 },
  ): GestureFrame {
    if (!isValidHand(landmarks)) {
      return this.handleTrackingLoss(timestamp);
    }
    if (
      this.lastTrackedAt !== null &&
      timestamp - this.lastTrackedAt > this.trackingGracePeriod()
    ) {
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
    if (this.state === 'drawing' && rawPose === 'open') {
      this.drawingReleaseStartedAt ??= timestamp;
    } else {
      this.drawingReleaseStartedAt = null;
    }
    // A raw misclassification for a single frame (e.g. the index finger's
    // angle to the camera shifting mid-curve) would otherwise stall an
    // in-progress stroke every time it happens — trace this frame using the
    // already-debounced pose instead of bailing, as long as we're mid-draw.
    if (rawPose !== pose && this.state !== 'drawing') {
      return this.currentFrame(cursor, [], armProgress, timestamp);
    }

    switch (pose) {
      case 'pinch':
        this.cancelDrawing();
        if (this.state === 'pinching') {
          events.push({ type: 'pinch-move', point: cursor });
        } else {
          events.push({ type: 'pinch-start', point: cursor });
        }
        this.state = 'pinching';
        break;

      case 'point':
        if (this.state === 'pinching') {
          events.push({ type: 'pinch-end', point: cursor });
        }
        // Do not append release-pose fingertip movement to the trace while
        // waiting for the stable pose to catch up with a raw open hand.
        if (this.state === 'drawing' && rawPose === 'open') break;
        armProgress = this.handlePointing(
          cursor,
          events,
          viewport.width,
          viewport.height,
        );
        break;

      case 'fist':
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
        // Deletion is instant, not a hold: fire once on the frame the fist
        // is first confirmed (not on every subsequent frame it's held), the
        // same "act immediately, don't make the user hold still" principle
        // that fixed drawing. GestureCommandAdapter deletes whatever's
        // currently selected — a fist needs no target coordinate.
        if (this.state !== 'ready' && this.state !== 'selecting') {
          events.push({ type: 'delete' });
        }
        this.state = 'ready';
        break;

      case 'open':
        if (this.state === 'pinching') {
          events.push({ type: 'pinch-end', point: cursor });
        }
        if (this.state === 'drawing') {
          if (
            timestamp - (this.drawingReleaseStartedAt ?? timestamp) <
            DRAWING_RELEASE_HOLD_MS
          ) {
            break;
          }
          this.finishTrace(events);
        }
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
          this.state = 'absent';
        } else {
          this.finishTrace(events);
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
      timestamp,
    );
  }

  reset(): void {
    this.state = 'absent';
    this.stablePose = 'none';
    this.candidatePose = 'none';
    this.candidateFrames = 0;
    this.trace = [];
    this.lastCursor = null;
    this.lastLandmarks = null;
    this.lastPalmScale = null;
    this.lastTrackedAt = null;
    this.poseUncertainSince = null;
    this.drawingReleaseStartedAt = null;
    this.selectAllOrigin = null;
    this.selectAllStartedAt = 0;
    this.openReadyAt = 0;
    this.lastRecognitionAt = Number.NEGATIVE_INFINITY;
    this.cachedRecognition = null;
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
    events: GestureEvent[],
    viewportWidth: number,
    viewportHeight: number,
  ): number {
    if (this.state === 'drawing') {
      if (
        screenDistance(
          this.trace.at(-1)!,
          cursor,
          viewportWidth,
          viewportHeight,
        ) >= MIN_TRACE_POINT_DISTANCE_PX
      ) {
        this.trace.push(cursor);
        events.push({ type: 'stroke-move', point: cursor });
      }
      return 1;
    }
    this.state = 'drawing';
    this.trace = [cursor];
    events.push({ type: 'stroke-start', point: cursor });
    return 1;
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
    this.drawingReleaseStartedAt = null;
    if (
      this.lastCursor &&
      this.lastLandmarks &&
      this.lastTrackedAt !== null &&
      timestamp - this.lastTrackedAt <= this.trackingGracePeriod()
    ) {
      return this.currentFrame(this.lastCursor, [], 0, timestamp);
    }
    const events: GestureEvent[] = [];
    if (this.state === 'pinching' && this.lastCursor) {
      events.push({ type: 'pinch-end', point: this.lastCursor });
    }
    if (this.state === 'drawing') this.finishTrace(events);
    this.state = 'absent';
    this.stablePose = 'none';
    this.candidatePose = 'none';
    this.candidateFrames = 0;
    if (this.trace.length > 0) this.cancelDrawing();
    this.cursorFilter.reset();
    this.palmFilter.reset();
    this.lastCursor = null;
    this.lastLandmarks = null;
    this.lastPalmScale = null;
    this.lastTrackedAt = null;
    this.poseUncertainSince = null;
    this.selectAllOrigin = null;
    this.selectAllStartedAt = 0;
    this.openReadyAt = 0;
    return this.frame(timestamp, null, null, events, 0, null, 0);
  }

  private trackingGracePeriod(): number {
    return this.state === 'drawing'
      ? DRAWING_TRACKING_GRACE_MS
      : TRACKING_GRACE_MS;
  }

  private currentFrame(
    cursor: GesturePoint,
    events: GestureEvent[],
    armProgress: number,
    timestamp: number,
  ): GestureFrame {
    if (
      this.trace.length >= MIN_TRACE_POINTS &&
      timestamp - this.lastRecognitionAt >= LIVE_RECOGNITION_INTERVAL_MS
    ) {
      this.cachedRecognition = recognizeStroke(this.trace);
      this.lastRecognitionAt = timestamp;
    }
    return this.frame(
      timestamp,
      cursor,
      this.lastLandmarks,
      events,
      armProgress,
      this.cachedRecognition?.shape.type ?? null,
      this.cachedRecognition?.confidence ?? 0,
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
    this.drawingReleaseStartedAt = null;
    this.lastRecognitionAt = Number.NEGATIVE_INFINITY;
    this.cachedRecognition = null;
  }

  private frame(
    timestamp: number,
    cursor: GesturePoint | null,
    landmarks: HandLandmarks | null,
    events: GestureEvent[],
    armProgress: number,
    prediction: GestureFrame['prediction'],
    predictionConfidence: number,
  ): GestureFrame {
    return {
      timestamp,
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

function screenDistance(
  from: GesturePoint,
  to: GesturePoint,
  viewportWidth: number,
  viewportHeight: number,
): number {
  return Math.hypot(
    (to.x - from.x) * viewportWidth,
    (to.y - from.y) * viewportHeight,
  );
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

function isValidHand(
  landmarks: HandLandmarks | null,
): landmarks is HandLandmarks {
  return (
    landmarks !== null &&
    landmarks.length >= 21 &&
    landmarks.every(
      (point) =>
        Number.isFinite(point.x) &&
        Number.isFinite(point.y) &&
        (point.z === undefined || Number.isFinite(point.z)),
    )
  );
}
