import type { GestureFrame, GestureState } from './types';

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

  constructor() {
    this.root = document.createElement('div');
    this.root.className = 'gesture-overlay';
    this.root.innerHTML =
      '<div class="gesture-status"><span></span><strong>Loading hand tracking…</strong></div>';
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
    this.setStatus(labelForState(frame.state));
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
        frame.state === 'pinching' ? '#c42020' : 'rgba(255,255,255,.2)';
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
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
}

function labelForState(state: GestureState): string {
  switch (state) {
    case 'ready':
      return 'Open hand · ready';
    case 'pinching':
      return 'Pinch · select and drag';
    case 'drawing':
      return 'Point · drawing in the air';
    case 'absent':
      return 'Show one hand to the camera';
  }
}
