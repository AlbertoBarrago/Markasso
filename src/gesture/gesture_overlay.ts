import { t } from '../i18n';
import { PointMotionPredictor } from './motion_filter';
import type { GestureDiagnostics, GestureFrame, GesturePoint } from './types';

const MAX_FEEDBACK_DPR = 1.5;

const CONNECTIONS: ReadonlyArray<readonly [number, number]> = [
  [0, 1],
  [1, 2],
  [2, 3],
  [3, 4],
  [0, 5],
  [5, 6],
  [6, 7],
  [7, 8],
  [5, 9],
  [9, 10],
  [10, 11],
  [11, 12],
  [9, 13],
  [13, 14],
  [14, 15],
  [15, 16],
  [13, 17],
  [17, 18],
  [18, 19],
  [19, 20],
  [0, 17],
];

export class GestureOverlay {
  readonly video: HTMLVideoElement;
  private readonly root: HTMLElement;
  private readonly feedback: HTMLCanvasElement;
  private readonly status: HTMLElement;
  private readonly diagnostics: HTMLElement | null;
  private latestFrame: GestureFrame | null = null;
  private latestDiagnostics: GestureDiagnostics | null = null;
  private animationFrame = 0;
  private dpr = 1;
  private outcome:
    | { type: 'created'; points: ReadonlyArray<GesturePoint>; until: number }
    | { type: 'deleted'; until: number }
    | { type: 'selected-all'; until: number }
    | null = null;

  constructor(private readonly cursorPredictor = new PointMotionPredictor()) {
    this.root = document.createElement('div');
    this.root.className = 'gesture-overlay';
    this.root.innerHTML = `<div class="gesture-status"><span></span><strong>${t('gestureLoading')}</strong></div>`;
    this.status = this.root.querySelector('.gesture-status strong')!;
    this.status.parentElement?.setAttribute('role', 'status');
    this.status.parentElement?.setAttribute('aria-live', 'polite');
    const preview = document.createElement('div');
    preview.className = 'gesture-preview';
    this.video = document.createElement('video');
    this.video.autoplay = true;
    this.video.muted = true;
    this.video.playsInline = true;
    preview.appendChild(this.video);
    this.feedback = document.createElement('canvas');
    this.feedback.className = 'gesture-feedback';
    this.root.append(preview, this.feedback);
    this.diagnostics = this.createDiagnostics();
    document.body.appendChild(this.root);
    this.resize();
    window.addEventListener('resize', this.resize);
    this.animationFrame = requestAnimationFrame(this.tick);
  }

  setStatus(
    message: string,
    state: 'loading' | 'active' | 'error' = 'active',
  ): void {
    if (this.status.textContent !== message) this.status.textContent = message;
    this.root.dataset.status = state;
  }

  render(frame: GestureFrame): void {
    this.latestFrame = frame;
  }

  setDiagnostics(diagnostics: GestureDiagnostics): void {
    this.latestDiagnostics = diagnostics;
  }

  private readonly tick = (now: number): void => {
    if (this.latestFrame) this.draw(this.latestFrame, now);
    this.animationFrame = requestAnimationFrame(this.tick);
  };

  private draw(frame: GestureFrame, now: number): void {
    if (!this.outcome || now >= this.outcome.until) {
      this.outcome = null;
      delete this.root.dataset.outcome;
      this.setStatus(labelForFrame(frame));
    }
    if (this.diagnostics) {
      const metrics = this.latestDiagnostics;
      const metricLabel = metrics
        ? ` · cam ${metrics.cameraFps.toFixed(0)} · infer ${metrics.inferenceFps.toFixed(0)} fps/${metrics.inferenceDurationMs.toFixed(0)} ms · latency ${metrics.latencyMs.toFixed(0)} ms`
        : '';
      const label = `${frame.state}${metricLabel}`;
      if (this.diagnostics.textContent !== label) {
        this.diagnostics.textContent = label;
      }
    }
    const ctx = this.feedback.getContext('2d')!;
    const dpr = this.dpr;
    const width = this.feedback.width / dpr;
    const height = this.feedback.height / dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    const predictedCursor =
      this.cursorPredictor.predict(now, width, height) ?? frame.cursor;
    // Predict during 'drawing' too, not just 'pinching' — inference frames
    // can land below 60fps, and without prediction the trace tip only moves
    // once per inference frame, reading as a stutter instead of a smooth line.
    const displayCursor = predictedCursor ?? frame.trace.at(-1) ?? frame.cursor;
    // Append the predicted point as a live tip so the drawn line itself
    // advances smoothly between inference frames, not just the cursor dot.
    const renderedTrace =
      frame.state === 'drawing' && predictedCursor
        ? [...frame.trace, predictedCursor]
        : frame.trace;
    if (renderedTrace.length > 1) {
      drawSmoothTrace(ctx, renderedTrace, width, height);
      ctx.strokeStyle = 'rgba(196, 32, 32, .8)';
      ctx.lineWidth = 4;
      ctx.lineCap = 'round';
      ctx.stroke();
    }
    if (frame.landmarks) this.drawHand(ctx, frame.landmarks, width, height);
    if (frame.state === 'selecting' && displayCursor) {
      this.drawArmProgress(
        ctx,
        displayCursor,
        frame.armProgress,
        width,
        height,
        '#3a8bff',
      );
    } else if (
      frame.state === 'drawing' &&
      frame.armProgress > 0 &&
      displayCursor
    ) {
      this.drawArmProgress(
        ctx,
        displayCursor,
        frame.armProgress,
        width,
        height,
        '#c42020',
      );
    }
    if (this.outcome?.type === 'created') {
      this.drawCommittedTrace(ctx, this.outcome.points, width, height, now);
    }
    if (displayCursor) {
      ctx.beginPath();
      ctx.arc(
        displayCursor.x * width,
        displayCursor.y * height,
        frame.state === 'pinching' ? 8 : 12,
        0,
        Math.PI * 2,
      );
      ctx.fillStyle =
        frame.state === 'pinching' ? '#c42020' : 'rgba(255,255,255,.2)';
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }

  showDeleted(): void {
    this.outcome = { type: 'deleted', until: performance.now() + 700 };
    this.root.dataset.outcome = 'deleted';
    this.setStatus(t('gestureDeleted'));
  }

  showCreated(points: ReadonlyArray<GesturePoint>): void {
    this.outcome = { type: 'created', points, until: performance.now() + 1100 };
    this.root.dataset.outcome = 'created';
    this.setStatus(t('gestureFreehandAdded'));
  }

  showSelectedAll(): void {
    this.outcome = { type: 'selected-all', until: performance.now() + 700 };
    this.root.dataset.outcome = 'selected-all';
    this.setStatus(t('gestureSelectedAll'));
  }

  dispose(): void {
    cancelAnimationFrame(this.animationFrame);
    window.removeEventListener('resize', this.resize);
    this.root.remove();
  }

  private readonly resize = (): void => {
    this.dpr = Math.min(window.devicePixelRatio, MAX_FEEDBACK_DPR);
    this.feedback.width = Math.round(window.innerWidth * this.dpr);
    this.feedback.height = Math.round(window.innerHeight * this.dpr);
  };

  private createDiagnostics(): HTMLElement | null {
    if (!new URLSearchParams(window.location.search).has('gestureDebug')) {
      return null;
    }
    const diagnostics = document.createElement('output');
    diagnostics.className = 'gesture-diagnostics';
    this.root.appendChild(diagnostics);
    return diagnostics;
  }

  private drawHand(
    ctx: CanvasRenderingContext2D,
    landmarks: NonNullable<GestureFrame['landmarks']>,
    width: number,
    height: number,
  ): void {
    ctx.strokeStyle = 'rgba(255,255,255,.3)';
    ctx.lineWidth = 2;
    for (const [from, to] of CONNECTIONS) {
      const a = landmarks[from];
      const b = landmarks[to];
      if (!a || !b) continue;
      ctx.beginPath();
      ctx.moveTo(a.x * width, a.y * height);
      ctx.lineTo(b.x * width, b.y * height);
      ctx.stroke();
    }
  }

  private drawArmProgress(
    ctx: CanvasRenderingContext2D,
    point: { x: number; y: number },
    progress: number,
    width: number,
    height: number,
    color: string,
  ): void {
    ctx.beginPath();
    ctx.arc(
      point.x * width,
      point.y * height,
      20,
      -Math.PI / 2,
      -Math.PI / 2 + Math.PI * 2 * progress,
    );
    ctx.strokeStyle = color;
    ctx.lineWidth = 4;
    ctx.stroke();
  }

  private drawCommittedTrace(
    ctx: CanvasRenderingContext2D,
    points: ReadonlyArray<GesturePoint>,
    width: number,
    height: number,
    now: number,
  ): void {
    const remaining = Math.max(0, this.outcome!.until - now) / 1100;
    ctx.save();
    ctx.strokeStyle = `rgba(68, 209, 122, ${remaining})`;
    ctx.lineWidth = 3 + remaining * 5;
    drawSmoothTrace(ctx, points, width, height);
    ctx.stroke();
    ctx.restore();
  }
}

function drawSmoothTrace(
  ctx: CanvasRenderingContext2D,
  points: ReadonlyArray<GesturePoint>,
  width: number,
  height: number,
): void {
  const first = points[0]!;
  ctx.beginPath();
  ctx.moveTo(first.x * width, first.y * height);
  for (let index = 1; index < points.length - 1; index++) {
    const current = points[index]!;
    const next = points[index + 1]!;
    ctx.quadraticCurveTo(
      current.x * width,
      current.y * height,
      ((current.x + next.x) / 2) * width,
      ((current.y + next.y) / 2) * height,
    );
  }
  const last = points.at(-1)!;
  ctx.lineTo(last.x * width, last.y * height);
}

function labelForFrame(frame: GestureFrame): string {
  switch (frame.state) {
    case 'ready':
      return t('gestureReady');
    case 'pinching':
      return t('gesturePinch');
    case 'drawing':
      return t('gestureDrawing');
    case 'selecting':
      return `${t('gestureHoldToSelectAll')} ${Math.round(frame.armProgress * 100)}%`;
    case 'absent':
      return t('gestureShowHand');
  }
}
