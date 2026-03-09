import type { Viewport } from '../core/viewport';
import type { GridType } from '../core/app_state';

// Physical mm → CSS pixels at 96 DPI standard
const PX_PER_MM = 96 / 25.4; // ≈ 3.7795

export function drawGrid(
  ctx: CanvasRenderingContext2D,
  viewport: Viewport,
  gridSize: number,
  gridType: GridType,
  canvasWidth: number,
  canvasHeight: number
): void {
  ctx.save();
  ctx.resetTransform();
  ctx.scale(window.devicePixelRatio, window.devicePixelRatio);

  const cssW = canvasWidth  / window.devicePixelRatio;
  const cssH = canvasHeight / window.devicePixelRatio;

  switch (gridType) {
    case 'dot':  drawDotGrid(ctx, viewport, gridSize, cssW, cssH);  break;
    case 'line': drawLineGrid(ctx, viewport, gridSize, cssW, cssH); break;
    case 'mm':   drawMmGrid(ctx, viewport, cssW, cssH);             break;
  }

  ctx.restore();
}

// ─── Dot grid ────────────────────────────────────────────────────────────────
function drawDotGrid(
  ctx: CanvasRenderingContext2D,
  viewport: Viewport,
  gridSize: number,
  w: number,
  h: number
): void {
  const { offsetX, offsetY, zoom } = viewport;
  const left  = -offsetX / zoom;
  const top   = -offsetY / zoom;
  const right  = (w - offsetX) / zoom;
  const bottom = (h - offsetY) / zoom;

  const startX = Math.floor(left  / gridSize) * gridSize;
  const startY = Math.floor(top   / gridSize) * gridSize;
  const r      = Math.max(0.8, zoom * 0.6);

  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  ctx.beginPath();
  for (let wx = startX; wx < right; wx += gridSize) {
    for (let wy = startY; wy < bottom; wy += gridSize) {
      const sx = wx * zoom + offsetX;
      const sy = wy * zoom + offsetY;
      ctx.moveTo(sx + r, sy);
      ctx.arc(sx, sy, r, 0, Math.PI * 2);
    }
  }
  ctx.fill();
}

// ─── Line grid ───────────────────────────────────────────────────────────────
function drawLineGrid(
  ctx: CanvasRenderingContext2D,
  viewport: Viewport,
  gridSize: number,
  w: number,
  h: number
): void {
  const { offsetX, offsetY, zoom } = viewport;
  const left   = -offsetX / zoom;
  const top    = -offsetY / zoom;
  const right   = (w - offsetX) / zoom;
  const bottom  = (h - offsetY) / zoom;

  const startX = Math.floor(left / gridSize) * gridSize;
  const startY = Math.floor(top  / gridSize) * gridSize;

  ctx.strokeStyle = 'rgba(255,255,255,0.07)';
  ctx.lineWidth   = 0.5;
  ctx.beginPath();
  for (let wx = startX; wx < right + gridSize; wx += gridSize) {
    const sx = wx * zoom + offsetX;
    ctx.moveTo(sx, 0);
    ctx.lineTo(sx, h);
  }
  for (let wy = startY; wy < bottom + gridSize; wy += gridSize) {
    const sy = wy * zoom + offsetY;
    ctx.moveTo(0,  sy);
    ctx.lineTo(w, sy);
  }
  ctx.stroke();
}

// ─── Millimeter graph paper ───────────────────────────────────────────────────
function drawMmGrid(
  ctx: CanvasRenderingContext2D,
  viewport: Viewport,
  w: number,
  h: number
): void {
  const { offsetX, offsetY, zoom } = viewport;

  // World units per mm, 5mm, 10mm
  const mm1  = PX_PER_MM;
  const mm5  = PX_PER_MM * 5;
  const mm10 = PX_PER_MM * 10;

  const screenMm1 = mm1 * zoom; // how many screen px = 1 world-mm

  function gridLines(
    spacing: number,
    color: string,
    lineW: number
  ): void {
    const left   = -offsetX / zoom;
    const top    = -offsetY / zoom;
    const right   = (w - offsetX) / zoom;
    const bottom  = (h - offsetY) / zoom;
    const startX  = Math.floor(left  / spacing) * spacing;
    const startY  = Math.floor(top   / spacing) * spacing;

    ctx.strokeStyle = color;
    ctx.lineWidth   = lineW;
    ctx.beginPath();
    for (let wx = startX; wx <= right + spacing; wx += spacing) {
      const sx = wx * zoom + offsetX;
      ctx.moveTo(sx, 0);
      ctx.lineTo(sx, h);
    }
    for (let wy = startY; wy <= bottom + spacing; wy += spacing) {
      const sy = wy * zoom + offsetY;
      ctx.moveTo(0, sy);
      ctx.lineTo(w, sy);
    }
    ctx.stroke();
  }

  // Only draw 1mm lines when they're at least 3px apart (avoid visual noise)
  if (screenMm1 >= 3) {
    gridLines(mm1, 'rgba(255,255,255,0.04)', 0.4);
  }
  // 5mm lines when at least 2px apart
  if (mm5 * zoom >= 2) {
    gridLines(mm5, 'rgba(255,255,255,0.09)', 0.5);
  }
  // 10mm lines always
  gridLines(mm10, 'rgba(255,255,255,0.18)', 0.7);
}
