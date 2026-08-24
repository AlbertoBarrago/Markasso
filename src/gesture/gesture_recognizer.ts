import { classifyHandPose, distance, type HandPose } from './landmark_geometry';
import { PointOneEuroFilter } from './motion_filter';
import type {
  GestureEvent,
  GestureFrame,
  GesturePoint,
  GestureState,
  HandLandmarks,
} from './types';

const MIN_TRACE_POINTS = 8;
const MIN_TRACE_POINT_DISTANCE_PX = 2;
const SELECT_ALL_HOLD_MS = 600;
const SELECT_ALL_MOVEMENT_RADIUS = 0.045;
// The open hand also confirms/ends other gestures (pinch-end, stroke-end), so
// it's often briefly open right after finishing one — wait this long after
// settling into 'open' before letting the select-all hold start counting, so
// that natural resting doesn't read as a deliberate select-all request.
const OPEN_SETTLE_MS = 700;
const TRACKING_GRACE_MS = 200;
// Losing the 'point' pose to 'none' mid-stroke is usually a tracking hiccup.
// Keep the stroke pending instead of treating uncertain tracking as user intent.
const DRAWING_POSE_GRACE_MS = 500;
// A fist mid-stroke tolerates brief tracking noise before it cancels the
// drawing outright — kept short so an intentional fist-to-delete right after
// finishing a stroke doesn't have to wait out a long window.
const DRAWING_POSE_GRACE_RECENT_MS = 500;
const DRAWING_TRACKING_GRACE_MS = 350;
const DRAWING_RESUME_MAX_DISTANCE_PX = 96;
// Holding the pointing fingertip still is the primary, in-flow confirmation.
// A small radius absorbs camera jitter without turning a deliberate pause at a
// corner into an immediate finish.
const DRAWING_STILL_HOLD_MS = 550;
const DRAWING_STILL_RADIUS_PX = 10;
const DRAWING_REARM_DISTANCE_PX = 24;
const DRAWING_MIN_PATH_LENGTH_PX = 32;
// Keep the open hand as a deliberate fallback for users who already know it.
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
  private drawingSuspended = false;
  private drawingStillOrigin: GesturePoint | null = null;
  private drawingStillStartedAt: number | null = null;
  private drawingRearmPoint: GesturePoint | null = null;
  private drawingPathLengthPx = 0;
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
    const drawingCursor = mirror(landmarks[8]!);
    const cursor = this.cursorFilter.filter(drawingCursor, timestamp);
    this.lastCursor = cursor;
    const rawPalm = mirror(midpoint(landmarks[0]!, landmarks[9]!));
    const palm = this.palmFilter.filter(rawPalm, timestamp);
    const rawPose = classifyHandPose(landmarks, this.stablePose);
    const pose = this.stabilizePose(rawPose);
    const events: GestureEvent[] = [];
    let armProgress = 0;

    if (pose !== 'point') this.drawingRearmPoint = null;

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
    if (this.state === 'drawing' && rawPose !== 'point') {
      this.resetDrawingStill();
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
          drawingCursor,
          timestamp,
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
          this.drawingSuspended = true;
          this.cursorFilter.reset();
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
    this.drawingSuspended = false;
    this.drawingStillOrigin = null;
    this.drawingStillStartedAt = null;
    this.drawingRearmPoint = null;
    this.drawingPathLengthPx = 0;
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
    drawingCursor: GesturePoint,
    timestamp: number,
    events: GestureEvent[],
    viewportWidth: number,
    viewportHeight: number,
  ): number {
    if (this.drawingRearmPoint) {
      if (
        screenDistance(
          this.drawingRearmPoint,
          drawingCursor,
          viewportWidth,
          viewportHeight,
        ) < DRAWING_REARM_DISTANCE_PX
      ) {
        return 0;
      }
      this.drawingRearmPoint = null;
    }
    if (this.state === 'drawing') {
      if (
        this.drawingSuspended &&
        screenDistance(
          this.trace.at(-1)!,
          drawingCursor,
          viewportWidth,
          viewportHeight,
        ) > DRAWING_RESUME_MAX_DISTANCE_PX
      ) {
        this.cursorFilter.reset();
        return 0;
      }
      this.drawingSuspended = false;
      const sampleDistance = screenDistance(
        this.trace.at(-1)!,
        drawingCursor,
        viewportWidth,
        viewportHeight,
      );
      if (sampleDistance >= MIN_TRACE_POINT_DISTANCE_PX) {
        this.trace.push(drawingCursor);
        this.drawingPathLengthPx += sampleDistance;
        events.push({ type: 'stroke-move', point: drawingCursor });
      }
      return this.handleDrawingStill(
        drawingCursor,
        timestamp,
        events,
        viewportWidth,
        viewportHeight,
      );
    }
    this.state = 'drawing';
    this.drawingSuspended = false;
    this.drawingStillOrigin = drawingCursor;
    this.drawingStillStartedAt = timestamp;
    this.drawingPathLengthPx = 0;
    this.trace = [drawingCursor];
    events.push({ type: 'stroke-start', point: drawingCursor });
    return 0;
  }

  private handleDrawingStill(
    drawingCursor: GesturePoint,
    timestamp: number,
    events: GestureEvent[],
    viewportWidth: number,
    viewportHeight: number,
  ): number {
    if (
      this.trace.length < MIN_TRACE_POINTS ||
      this.drawingPathLengthPx < DRAWING_MIN_PATH_LENGTH_PX
    ) {
      this.drawingStillOrigin = drawingCursor;
      this.drawingStillStartedAt = timestamp;
      return 0;
    }
    if (
      !this.drawingStillOrigin ||
      this.drawingStillStartedAt === null ||
      screenDistance(
        this.drawingStillOrigin,
        drawingCursor,
        viewportWidth,
        viewportHeight,
      ) > DRAWING_STILL_RADIUS_PX
    ) {
      this.drawingStillOrigin = drawingCursor;
      this.drawingStillStartedAt = timestamp;
      return 0;
    }
    const progress = Math.min(
      1,
      (timestamp - this.drawingStillStartedAt) / DRAWING_STILL_HOLD_MS,
    );
    if (progress >= 1) {
      this.finishTrace(events);
      this.state = 'ready';
      this.drawingRearmPoint = drawingCursor;
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
    this.drawingReleaseStartedAt = null;
    this.resetDrawingStill();
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
    if (this.state === 'drawing') {
      this.drawingSuspended = true;
    } else {
      this.state = 'absent';
      this.drawingRearmPoint = null;
    }
    this.stablePose = 'none';
    this.candidatePose = 'none';
    this.candidateFrames = 0;
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
    return this.frame(timestamp, null, null, events, 0);
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
    return this.frame(
      timestamp,
      cursor,
      this.lastLandmarks,
      events,
      armProgress,
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
    this.drawingSuspended = false;
    this.resetDrawingStill();
    this.drawingPathLengthPx = 0;
  }

  private resetDrawingStill(): void {
    this.drawingStillOrigin = null;
    this.drawingStillStartedAt = null;
  }

  private frame(
    timestamp: number,
    cursor: GesturePoint | null,
    landmarks: HandLandmarks | null,
    events: GestureEvent[],
    armProgress: number,
  ): GestureFrame {
    return {
      timestamp,
      state: this.state,
      cursor,
      landmarks,
      palmScale: this.lastPalmScale,
      trace: [...this.trace],
      armProgress,
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
