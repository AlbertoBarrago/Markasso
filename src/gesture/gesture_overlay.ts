import { t } from '../i18n';
import type { StrokeShape } from './stroke_classifier';
import type { GestureFrame } from './types';

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
  private outcome:
    | { type: 'created'; shape: StrokeShape; until: number }
    | { type: 'rejected'; until: number }
    | { type: 'deleted'; until: number }
    | null = null;

  constructor() {
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
  }

  setStatus(
    message: string,
    state: 'loading' | 'active' | 'error' = 'active',
  ): void {
    this.status.textContent = message;
    this.root.dataset.status = state;
  }

  render(frame: GestureFrame): void {
    const now = performance.now();
    if (!this.outcome || now >= this.outcome.until) {
      this.outcome = null;
      delete this.root.dataset.outcome;
      this.setStatus(labelForFrame(frame));
    }
    if (this.diagnostics) {
      const prediction = frame.prediction ?? 'none';
      this.diagnostics.textContent = `${frame.state} · ${prediction} ${Math.round(frame.predictionConfidence * 100)}%`;
    }
    const ctx = this.feedback.getContext('2d')!;
    const dpr = window.devicePixelRatio;
    const width = this.feedback.width / dpr;
    const height = this.feedback.height / dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    if (frame.trace.length > 1) {
      ctx.beginPath();
      frame.trace.forEach((point, index) => {
        const method = index === 0 ? 'moveTo' : 'lineTo';
        ctx[method](point.x * width, point.y * height);
      });
      ctx.strokeStyle = 'rgba(196, 32, 32, .8)';
      ctx.lineWidth = 4;
      ctx.lineCap = 'round';
      ctx.stroke();
    }
    if (frame.landmarks) this.drawHand(ctx, frame.landmarks, width, height);
    if (frame.state === 'arming' && frame.cursor) {
      this.drawArmProgress(
        ctx,
        frame.cursor,
        frame.armProgress,
        width,
        height,
        '#c42020',
      );
    }
    if (frame.state === 'deleting' && frame.cursor) {
      this.drawArmProgress(
        ctx,
        frame.cursor,
        frame.armProgress,
        width,
        height,
        '#ff8c1a',
      );
    }
    if (this.outcome?.type === 'created') {
      this.drawCommittedShape(ctx, this.outcome.shape, width, height, now);
    }
    if (frame.cursor) {
      ctx.beginPath();
      ctx.arc(
        frame.cursor.x * width,
        frame.cursor.y * height,
        frame.state === 'pinching' ? 8 : 12,
        0,
        Math.PI * 2,
      );
      ctx.fillStyle =
        frame.state === 'pinching'
          ? '#c42020'
          : frame.state === 'deleting'
            ? '#ff8c1a'
            : 'rgba(255,255,255,.2)';
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

  showCreated(shape: StrokeShape): void {
    this.outcome = { type: 'created', shape, until: performance.now() + 1100 };
    this.root.dataset.outcome = 'created';
    this.setStatus(createdLabel(shape.type));
  }

  showRejected(): void {
    this.outcome = { type: 'rejected', until: performance.now() + 1100 };
    this.root.dataset.outcome = 'rejected';
    this.setStatus(t('gestureNotRecognized'), 'error');
  }

  dispose(): void {
    window.removeEventListener('resize', this.resize);
    this.root.remove();
  }

  private readonly resize = (): void => {
    const dpr = window.devicePixelRatio;
    this.feedback.width = Math.round(window.innerWidth * dpr);
    this.feedback.height = Math.round(window.innerHeight * dpr);
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

  private drawCommittedShape(
    ctx: CanvasRenderingContext2D,
    shape: StrokeShape,
    width: number,
    height: number,
    now: number,
  ): void {
    const remaining = Math.max(0, this.outcome!.until - now) / 1100;
    ctx.save();
    ctx.strokeStyle = `rgba(68, 209, 122, ${remaining})`;
    ctx.lineWidth = 3 + remaining * 5;
    ctx.beginPath();
    if (shape.type === 'line') {
      ctx.moveTo(shape.start.x * width, shape.start.y * height);
      ctx.lineTo(shape.end.x * width, shape.end.y * height);
    } else if (shape.type === 'rectangle') {
      ctx.rect(
        shape.x * width,
        shape.y * height,
        shape.width * width,
        shape.height * height,
      );
    } else if (shape.type === 'ellipse') {
      ctx.ellipse(
        (shape.x + shape.width / 2) * width,
        (shape.y + shape.height / 2) * height,
        (shape.width * width) / 2,
        (shape.height * height) / 2,
        0,
        0,
        Math.PI * 2,
      );
    } else {
      shape.points.forEach((point, index) => {
        const x = point.x * width;
        const y = point.y * height;
        if (index === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
    }
    ctx.stroke();
    ctx.restore();
  }
}

function labelForFrame(frame: GestureFrame): string {
  switch (frame.state) {
    case 'ready':
      return t('gestureReady');
    case 'pinching':
      return t('gesturePinch');
    case 'arming':
      return `${t('gestureHoldToDraw')} ${Math.round(frame.armProgress * 100)}%`;
    case 'drawing':
      return frame.prediction
        ? `${shapeLabel(frame.prediction)} · ${t('gestureReleaseToAdd')}`
        : t('gestureDrawing');
    case 'deleting':
      return `${t('gestureHoldToDelete')} ${Math.round(frame.armProgress * 100)}%`;
    case 'absent':
      return t('gestureShowHand');
  }
}

function createdLabel(type: StrokeShape['type']): string {
  switch (type) {
    case 'rectangle':
      return t('gestureRectangleAdded');
    case 'ellipse':
      return t('gestureEllipseAdded');
    case 'line':
      return t('gestureConnectorAdded');
    case 'freehand':
      return t('gestureFreehandAdded');
  }
}

function shapeLabel(type: GestureFrame['prediction']): string {
  switch (type) {
    case 'rectangle':
      return t('rectangle');
    case 'ellipse':
      return t('ellipse');
    case 'line':
      return t('line');
    case 'freehand':
      return t('pen');
    case null:
      return '';
  }
}
