import type { Element } from '../elements/element';
import { getElementCenter } from './draw_selection';

export function drawElement(ctx: CanvasRenderingContext2D, el: Element): void {
  ctx.save();
  ctx.globalAlpha = el.opacity;
  ctx.strokeStyle = el.strokeColor;
  ctx.lineWidth = el.strokeWidth;
  ctx.fillStyle = el.fillColor === 'transparent' ? 'rgba(0,0,0,0)' : el.fillColor;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  if (el.rotation) {
    const [cx, cy] = getElementCenter(el);
    ctx.translate(cx, cy);
    ctx.rotate(el.rotation);
    ctx.translate(-cx, -cy);
  }

  switch (el.type) {
    case 'rectangle': {
      drawRectangle(ctx, el.x, el.y, el.width, el.height);
      if (el.label) {
        const rx = el.width < 0 ? el.x + el.width : el.x;
        const ry = el.height < 0 ? el.y + el.height : el.y;
        const rw = Math.abs(el.width);
        const rh = Math.abs(el.height);
        ctx.save();
        ctx.beginPath();
        ctx.rect(rx, ry, rw, rh);
        ctx.clip();
        drawShapeLabel(ctx, rx + rw / 2, ry + rh / 2, el.label, el.labelFontSize ?? 16, el.labelFontFamily ?? 'sans-serif', el.strokeColor);
        ctx.restore();
      }
      break;
    }
    case 'ellipse': {
      drawEllipse(ctx, el.x, el.y, el.width, el.height);
      if (el.label) {
        const cx = el.x + el.width / 2;
        const cy = el.y + el.height / 2;
        const erx = Math.abs(el.width / 2);
        const ery = Math.abs(el.height / 2);
        ctx.save();
        ctx.beginPath();
        ctx.ellipse(cx, cy, erx, ery, 0, 0, Math.PI * 2);
        ctx.clip();
        drawShapeLabel(ctx, cx, cy, el.label, el.labelFontSize ?? 16, el.labelFontFamily ?? 'sans-serif', el.strokeColor);
        ctx.restore();
      }
      break;
    }
    case 'line':
      drawLine(ctx, el.x, el.y, el.x2, el.y2);
      break;
    case 'arrow':
      drawArrow(ctx, el.x, el.y, el.x2, el.y2, el.strokeWidth);
      break;
    case 'freehand':
      drawFreehand(ctx, el.points);
      break;
    case 'text':
      drawText(ctx, el.x, el.y, el.content, el.fontSize, el.fontFamily, el.strokeColor);
      break;
  }

  ctx.restore();
}

function drawRectangle(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number
): void {
  const rx = width < 0 ? x + width : x;
  const ry = height < 0 ? y + height : y;
  const rw = Math.abs(width);
  const rh = Math.abs(height);
  ctx.beginPath();
  ctx.rect(rx, ry, rw, rh);
  ctx.fill();
  ctx.stroke();
}

function drawEllipse(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number
): void {
  const cx = x + width / 2;
  const cy = y + height / 2;
  const rx = Math.abs(width / 2);
  const ry = Math.abs(height / 2);
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
}

function drawLine(
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number
): void {
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}

function drawArrow(
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  strokeWidth: number
): void {
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const headLen = Math.max(12, strokeWidth * 4);

  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();

  // Arrowhead
  ctx.beginPath();
  ctx.moveTo(x2, y2);
  ctx.lineTo(
    x2 - headLen * Math.cos(angle - Math.PI / 6),
    y2 - headLen * Math.sin(angle - Math.PI / 6)
  );
  ctx.moveTo(x2, y2);
  ctx.lineTo(
    x2 - headLen * Math.cos(angle + Math.PI / 6),
    y2 - headLen * Math.sin(angle + Math.PI / 6)
  );
  ctx.stroke();
}

function drawFreehand(
  ctx: CanvasRenderingContext2D,
  points: ReadonlyArray<readonly [number, number]>
): void {
  if (points.length < 2) return;
  const p0 = points[0]!;

  ctx.beginPath();
  ctx.moveTo(p0[0], p0[1]);

  if (points.length === 2) {
    const p1 = points[1]!;
    ctx.lineTo(p1[0], p1[1]);
  } else {
    // Catmull-Rom to Bézier approximation
    for (let i = 1; i < points.length - 1; i++) {
      const [x0, y0] = points[i - 1]!;
      const [x1, y1] = points[i]!;
      const [x2, y2] = points[i + 1]!;
      const cpx = (x0 + x1) / 2;
      const cpy = (y0 + y1) / 2;
      const cpx2 = (x1 + x2) / 2;
      const cpy2 = (y1 + y2) / 2;
      ctx.quadraticCurveTo(x1, y1, (cpx2 + cpx) / 2, (cpy2 + cpy) / 2);
    }
    const last = points[points.length - 1]!;
    ctx.lineTo(last[0], last[1]);
  }

  ctx.stroke();
}

function drawText(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  content: string,
  fontSize: number,
  fontFamily: string,
  color: string
): void {
  ctx.font = `${fontSize}px ${fontFamily}`;
  ctx.fillStyle = color;
  ctx.textBaseline = 'top';
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    ctx.fillText(lines[i] ?? '', x, y + i * fontSize * 1.2);
  }
}

function drawShapeLabel(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  label: string,
  fontSize: number,
  fontFamily: string,
  color: string,
): void {
  ctx.font = `${fontSize}px ${fontFamily}`;
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const lines = label.split('\n');
  const lineHeight = fontSize * 1.2;
  const totalHeight = lines.length * lineHeight;
  for (let i = 0; i < lines.length; i++) {
    ctx.fillText(lines[i] ?? '', cx, cy - totalHeight / 2 + i * lineHeight + lineHeight / 2);
  }
}
