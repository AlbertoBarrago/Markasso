import type { History } from '../engine/history';
import {
  GestureCommandAdapter,
  type GestureCommandOutcome,
} from './gesture_commands';
import { GestureOverlay } from './gesture_overlay';
import { GestureRecognizer } from './gesture_recognizer';
import { PointMotionPredictor } from './motion_filter';
import type {
  GestureDiagnostics,
  GestureFrame,
  GesturePoint,
  WorkerRequest,
  WorkerResponse,
} from './types';

// Fallback pacing for browsers without requestVideoFrameCallback. Actual
// throughput is still bounded by worker inference through framePending.
const FRAME_INTERVAL_MS = 1000 / 60;

export class GestureController {
  private worker: Worker | null = null;
  private stream: MediaStream | null = null;
  private overlay: GestureOverlay | null = null;
  private animationFrame = 0;
  private interactionAnimationFrame = 0;
  private videoFrameCallback = 0;
  private latestVideoFrameAt = 0;
  private submittedVideoFrameAt = 0;
  private framePending = false;
  private lastFrameAt = 0;
  private lifecycle = 0;
  private metricsWindowStartedAt = 0;
  private inferenceFrames = 0;
  private lastVideoFrames = 0;
  private latestFrame: GestureFrame | null = null;
  private lastInteractionCursor: GesturePoint | null = null;
  private diagnostics: GestureDiagnostics = {
    cameraFps: 0,
    inferenceFps: 0,
    inferenceDurationMs: 0,
    latencyMs: 0,
  };
  private readonly recognizer = new GestureRecognizer();
  private readonly cursorPredictor = new PointMotionPredictor();
  private readonly commands: GestureCommandAdapter;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    history: History,
    private readonly button: HTMLButtonElement,
  ) {
    this.commands = new GestureCommandAdapter(canvas, history);
  }

  toggle(): void {
    if (this.worker) this.disable();
    else void this.enable();
  }

  private async enable(): Promise<void> {
    if (
      !navigator.mediaDevices?.getUserMedia ||
      typeof Worker === 'undefined'
    ) {
      this.showTransientError('Gesture Mode is not supported by this browser.');
      return;
    }
    this.button.disabled = true;
    this.overlay = new GestureOverlay(this.cursorPredictor);
    const lifecycle = ++this.lifecycle;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          // Most cameras (especially laptop-integrated ones) are natively
          // 16:9 — requesting a 4:3 frame (640x480) makes the driver crop
          // the sides of the sensor to fit, narrowing the real horizontal
          // field of view a hand can move within before tracking is lost.
          // 640x360 keeps roughly the same pixel count (so no extra
          // inference cost) while matching the native aspect ratio.
          width: { ideal: 640 },
          height: { ideal: 360 },
          frameRate: { ideal: 60, max: 60 },
          facingMode: 'user',
        },
        audio: false,
      });
      if (lifecycle !== this.lifecycle) {
        stream.getTracks().forEach((track) => {
          track.stop();
        });
        return;
      }
      this.stream = stream;
      this.overlay.video.srcObject = this.stream;
      await this.overlay.video.play();
      this.worker = new Worker(
        new URL('./gesture_worker.ts', import.meta.url),
        { type: 'classic' },
      );
      this.worker.addEventListener('message', this.onWorkerMessage);
      this.worker.addEventListener('error', this.onWorkerError);
      this.post({ type: 'initialize' });
    } catch (error) {
      this.fail(
        error instanceof DOMException && error.name === 'NotAllowedError'
          ? 'Camera permission was denied.'
          : 'Unable to start Gesture Mode.',
      );
    }
  }

  disable(): void {
    this.lifecycle++;
    cancelAnimationFrame(this.animationFrame);
    cancelAnimationFrame(this.interactionAnimationFrame);
    if (this.videoFrameCallback && this.overlay) {
      this.overlay.video.cancelVideoFrameCallback(this.videoFrameCallback);
    }
    this.commands.dispose();
    this.recognizer.reset();
    this.cursorPredictor.reset();
    if (this.worker) {
      this.post({ type: 'dispose' });
      this.worker.terminate();
    }
    this.worker = null;
    this.stream?.getTracks().forEach((track) => {
      track.stop();
    });
    this.stream = null;
    this.overlay?.dispose();
    this.overlay = null;
    this.framePending = false;
    this.interactionAnimationFrame = 0;
    this.videoFrameCallback = 0;
    this.latestVideoFrameAt = 0;
    this.submittedVideoFrameAt = 0;
    this.latestFrame = null;
    this.lastInteractionCursor = null;
    this.button.disabled = false;
    this.button.classList.remove('active');
    this.button.setAttribute('aria-pressed', 'false');
  }

  private readonly onWorkerMessage = (
    event: MessageEvent<WorkerResponse>,
  ): void => {
    if (event.data.type === 'ready') {
      this.button.disabled = false;
      this.button.classList.add('active');
      this.button.setAttribute('aria-pressed', 'true');
      this.overlay?.setStatus('Gesture Mode active');
      this.resetMetrics();
      this.scheduleInteractionFrame();
      this.scheduleFrame();
      return;
    }
    if (event.data.type === 'error') {
      this.fail(event.data.message);
      return;
    }
    this.framePending = false;
    this.updateDiagnostics(
      event.data.inferenceDurationMs,
      event.data.timestamp,
    );
    const canvasRect = this.canvas.getBoundingClientRect();
    const frame = this.recognizer.update(
      event.data.landmarks,
      event.data.timestamp,
      { width: canvasRect.width, height: canvasRect.height },
    );
    this.updateMotion(frame, performance.now());
    this.commands.setHandScale(frame.palmScale);
    this.commands.updateHover(frame.state === 'ready' ? frame.cursor : null);
    frame.events.forEach((gestureEvent) => {
      this.handleEvent(gestureEvent);
    });
    this.overlay?.render(frame);
    this.overlay?.setDiagnostics(this.diagnostics);
    this.scheduleFrame();
  };

  private updateMotion(frame: GestureFrame, receivedAt: number): void {
    if (!frame.cursor || !frame.landmarks) {
      this.cursorPredictor.reset();
      this.lastInteractionCursor = null;
    } else {
      if (!this.latestFrame?.cursor || this.latestFrame.state !== frame.state) {
        this.cursorPredictor.reset();
      }
      this.cursorPredictor.update(frame.cursor, receivedAt);
    }
    this.latestFrame = frame;
  }

  private handleEvent(event: GestureFrame['events'][number]): void {
    if (event.type === 'pinch-move') return;
    if (event.type === 'pinch-start') {
      this.lastInteractionCursor = event.point;
    } else if (event.type === 'pinch-end') {
      this.lastInteractionCursor = null;
    }
    this.applyOutcome(this.commands.handle(event));
  }

  private scheduleInteractionFrame(): void {
    if (this.interactionAnimationFrame) return;
    this.interactionAnimationFrame = requestAnimationFrame((timestamp) => {
      this.interactionAnimationFrame = 0;
      if (!this.worker || !this.overlay) return;
      if (!document.hidden && this.latestFrame?.state === 'pinching') {
        const rect = this.canvas.getBoundingClientRect();
        const point = this.cursorPredictor.predict(
          timestamp,
          rect.width,
          rect.height,
        );
        if (point) this.moveInteraction(point, rect.width, rect.height);
      }
      this.scheduleInteractionFrame();
    });
  }

  private moveInteraction(
    point: GesturePoint,
    width: number,
    height: number,
  ): void {
    if (
      this.lastInteractionCursor &&
      Math.hypot(
        (point.x - this.lastInteractionCursor.x) * width,
        (point.y - this.lastInteractionCursor.y) * height,
      ) < 0.1
    ) {
      return;
    }
    this.commands.handle({ type: 'pinch-move', point });
    this.lastInteractionCursor = point;
  }

  private applyOutcome(outcome: GestureCommandOutcome | null): void {
    if (outcome?.type === 'created') {
      this.overlay?.showCreated(outcome.shape);
    } else if (outcome?.type === 'rejected') {
      this.overlay?.showRejected();
    } else if (outcome?.type === 'deleted') {
      this.overlay?.showDeleted();
    } else if (outcome?.type === 'selected-all') {
      this.overlay?.showSelectedAll();
    }
  }

  private readonly onWorkerError = (event: ErrorEvent): void =>
    this.fail(
      event.message
        ? `Hand tracking failed: ${event.message}`
        : 'Hand tracking failed to load.',
    );

  private scheduleFrame(): void {
    const video = this.overlay?.video;
    if (!video) return;
    if (typeof video.requestVideoFrameCallback === 'function') {
      if (!this.videoFrameCallback) this.watchVideoFrames(video);
      if (
        !this.framePending &&
        this.latestVideoFrameAt > this.submittedVideoFrameAt
      ) {
        void this.captureFrame(this.latestVideoFrameAt, false);
      }
      return;
    }
    this.animationFrame = requestAnimationFrame((timestamp) => {
      void this.captureFrame(timestamp, true);
    });
  }

  private watchVideoFrames(video: HTMLVideoElement): void {
    this.videoFrameCallback = video.requestVideoFrameCallback((timestamp) => {
      this.videoFrameCallback = 0;
      this.latestVideoFrameAt = timestamp;
      if (this.worker && this.overlay) this.watchVideoFrames(video);
      if (!this.framePending) void this.captureFrame(timestamp, false);
    });
  }

  private async captureFrame(
    timestamp: number,
    enforceInterval: boolean,
  ): Promise<void> {
    if (!this.worker || !this.overlay || document.hidden) {
      this.scheduleFrame();
      return;
    }
    if (
      this.framePending ||
      (enforceInterval && timestamp - this.lastFrameAt < FRAME_INTERVAL_MS) ||
      this.overlay.video.readyState < 2
    ) {
      this.scheduleFrame();
      return;
    }
    this.lastFrameAt = timestamp;
    this.submittedVideoFrameAt = timestamp;
    this.framePending = true;
    try {
      const frame = await createImageBitmap(this.overlay.video);
      if (!this.worker) {
        frame.close();
        return;
      }
      this.worker.postMessage(
        { type: 'detect', frame, timestamp } satisfies WorkerRequest,
        [frame],
      );
    } catch {
      this.framePending = false;
      this.scheduleFrame();
    }
  }

  private resetMetrics(): void {
    this.metricsWindowStartedAt = performance.now();
    this.inferenceFrames = 0;
    this.lastVideoFrames = this.getVideoFrameCount();
    const configuredFps = this.stream
      ?.getVideoTracks()[0]
      ?.getSettings().frameRate;
    this.diagnostics = {
      cameraFps: configuredFps ?? 0,
      inferenceFps: 0,
      inferenceDurationMs: 0,
      latencyMs: 0,
    };
  }

  private updateDiagnostics(
    inferenceDurationMs: number,
    captureTimestamp: number,
  ): void {
    const now = performance.now();
    const smoothing = 0.15;
    this.inferenceFrames++;
    this.diagnostics = {
      ...this.diagnostics,
      inferenceDurationMs: movingAverage(
        this.diagnostics.inferenceDurationMs,
        inferenceDurationMs,
        smoothing,
      ),
      latencyMs: movingAverage(
        this.diagnostics.latencyMs,
        now - captureTimestamp,
        smoothing,
      ),
    };
    const elapsed = now - this.metricsWindowStartedAt;
    if (elapsed < 1_000) return;
    const videoFrames = this.getVideoFrameCount();
    this.diagnostics = {
      ...this.diagnostics,
      cameraFps:
        videoFrames > this.lastVideoFrames
          ? ((videoFrames - this.lastVideoFrames) * 1_000) / elapsed
          : this.diagnostics.cameraFps,
      inferenceFps: (this.inferenceFrames * 1_000) / elapsed,
    };
    this.metricsWindowStartedAt = now;
    this.inferenceFrames = 0;
    this.lastVideoFrames = videoFrames;
  }

  private getVideoFrameCount(): number {
    return (
      this.overlay?.video.getVideoPlaybackQuality?.().totalVideoFrames ?? 0
    );
  }

  private post(message: WorkerRequest): void {
    this.worker?.postMessage(message);
  }

  private fail(message: string): void {
    console.error(`[Gesture Mode] ${message}`);
    this.disable();
    this.showTransientError(message);
  }

  private showTransientError(message: string): void {
    const overlay = new GestureOverlay();
    overlay.setStatus(message, 'error');
    window.setTimeout(() => overlay.dispose(), 6000);
  }
}

function movingAverage(
  current: number,
  sample: number,
  amount: number,
): number {
  return current === 0 ? sample : current + (sample - current) * amount;
}
