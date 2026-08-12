import type { History } from '../engine/history';
import {
  GestureCommandAdapter,
  type GestureCommandOutcome,
} from './gesture_commands';
import { GestureOverlay } from './gesture_overlay';
import { GestureRecognizer } from './gesture_recognizer';
import type { WorkerRequest, WorkerResponse } from './types';

// Upper bound only — actual throughput is still paced by how fast the worker
// finishes each inference (framePending backpressure below), so raising this
// just lets us ask for the next frame sooner once the pipeline is free.
const FRAME_INTERVAL_MS = 1000 / 60;

export class GestureController {
  private worker: Worker | null = null;
  private stream: MediaStream | null = null;
  private overlay: GestureOverlay | null = null;
  private animationFrame = 0;
  private framePending = false;
  private lastFrameAt = 0;
  private lifecycle = 0;
  private readonly recognizer = new GestureRecognizer();
  private readonly commands: GestureCommandAdapter;

  constructor(
    canvas: HTMLCanvasElement,
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
    this.overlay = new GestureOverlay();
    const lifecycle = ++this.lifecycle;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 640 },
          height: { ideal: 480 },
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
    this.commands.dispose();
    this.recognizer.reset();
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
      this.scheduleFrame();
      return;
    }
    if (event.data.type === 'error') {
      this.fail(event.data.message);
      return;
    }
    this.framePending = false;
    const frame = this.recognizer.update(
      event.data.landmarks,
      event.data.timestamp,
    );
    this.commands.setHandScale(frame.palmScale);
    this.commands.updateHover(frame.state === 'ready' ? frame.cursor : null);
    frame.events.forEach((gestureEvent) => {
      this.applyOutcome(this.commands.handle(gestureEvent));
    });
    this.overlay?.render(frame);
    this.scheduleFrame();
  };

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
    this.animationFrame = requestAnimationFrame(async (timestamp) => {
      if (!this.worker || !this.overlay || document.hidden) {
        this.scheduleFrame();
        return;
      }
      if (
        this.framePending ||
        timestamp - this.lastFrameAt < FRAME_INTERVAL_MS ||
        this.overlay.video.readyState < 2
      ) {
        this.scheduleFrame();
        return;
      }
      this.lastFrameAt = timestamp;
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
    });
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
