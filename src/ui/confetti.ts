/**
 * A short confetti burst on a throwaway full-screen canvas, used to celebrate
 * an approved Markasso Cloud licence. Zero dependencies: one requestAnimationFrame
 * loop with simple gravity and drag, and the canvas removes itself when the
 * last piece has fallen. Skipped entirely under `prefers-reduced-motion`.
 */

const COLORS = [
  '#c42059',
  '#f2a0bb',
  '#ffd166',
  '#06d6a0',
  '#4cc9f0',
  '#ffffff',
];
const PIECES = 150;
const DURATION_MS = 2600;
const GRAVITY = 0.32;
const DRAG = 0.985;

interface Piece {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  rotation: number;
  spin: number;
  color: string;
}

/** Whether a burst would actually run (callers may skip waiting for it). */
export function confettiEnabled(): boolean {
  return !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function launchConfetti(): void {
  if (!confettiEnabled()) return;
  const canvas = document.createElement('canvas');
  canvas.className = 'confetti-canvas';
  canvas.setAttribute('aria-hidden', 'true');
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const dpr = window.devicePixelRatio || 1;
  const width = window.innerWidth;
  const height = window.innerHeight;
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  ctx.scale(dpr, dpr);
  document.body.append(canvas);

  // Two cannons from the lower corners, aimed up and towards the centre.
  const pieces: Piece[] = Array.from({ length: PIECES }, (_, i) => {
    const left = i % 2 === 0;
    const angle = (left ? -60 : -120) + (Math.random() - 0.5) * 40;
    const speed = 12 + Math.random() * 10;
    const rad = (angle * Math.PI) / 180;
    return {
      x: left ? width * 0.05 : width * 0.95,
      y: height * 0.95,
      vx: Math.cos(rad) * speed,
      vy: Math.sin(rad) * speed,
      size: 6 + Math.random() * 6,
      rotation: Math.random() * Math.PI,
      spin: (Math.random() - 0.5) * 0.3,
      color: COLORS[i % COLORS.length]!,
    };
  });

  const start = performance.now();
  const frame = (now: number): void => {
    const elapsed = now - start;
    // Fade out over the last 600 ms so nothing pops away abruptly.
    ctx.globalAlpha = Math.max(0, Math.min(1, (DURATION_MS - elapsed) / 600));
    ctx.clearRect(0, 0, width, height);
    let visible = false;
    for (const p of pieces) {
      p.vx *= DRAG;
      p.vy = p.vy * DRAG + GRAVITY;
      p.x += p.vx;
      p.y += p.vy;
      p.rotation += p.spin;
      if (p.y < height + 20) visible = true;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rotation);
      ctx.fillStyle = p.color;
      // Flat rectangles that "flip" by scaling one axis with the rotation.
      ctx.fillRect(
        -p.size / 2,
        -p.size / 4,
        p.size,
        (p.size / 2) * Math.cos(p.rotation * 2),
      );
      ctx.restore();
    }
    if (visible && elapsed < DURATION_MS) requestAnimationFrame(frame);
    else canvas.remove();
  };
  requestAnimationFrame(frame);
}
