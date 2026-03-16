import type { Element } from '../elements/element';
import { getElementCenter, resolveArrowEndpoints } from './draw_selection';
import { getCachedImage } from './image_cache';

export function drawElement(ctx: CanvasRenderingContext2D, el: Element, allElements?: ReadonlyArray<Element>): void {
  ctx.save();
  ctx.globalAlpha = el.opacity;
  ctx.strokeStyle = el.strokeColor;
  ctx.lineWidth = el.strokeWidth;
  ctx.fillStyle = el.fillColor === 'transparent' ? 'rgba(0,0,0,0)' : el.fillColor;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // Apply stroke style (dash pattern)
  const strokeStyle = el.strokeStyle ?? 'solid';
  if (strokeStyle === 'dashed') {
    ctx.setLineDash([el.strokeWidth * 4 + 4, el.strokeWidth * 2 + 2]);
  } else if (strokeStyle === 'dotted') {
    ctx.setLineDash([el.strokeWidth, el.strokeWidth * 3]);
    ctx.lineCap = 'round';
  } else {
    ctx.setLineDash([]);
  }

  if (el.rotation) {
    const [cx, cy] = getElementCenter(el);
    ctx.translate(cx, cy);
    ctx.rotate(el.rotation);
    ctx.translate(-cx, -cy);
  }

  switch (el.type) {
    case 'rectangle': {
      const roughness = el.roughness ?? 0;
      const seed = hashId(el.id);
      drawRectangle(ctx, el.x, el.y, el.width, el.height, roughness, seed);
      if (el.label) {
        const rx = el.width < 0 ? el.x + el.width : el.x;
        const ry = el.height < 0 ? el.y + el.height : el.y;
        const rw = Math.abs(el.width);
        const rh = Math.abs(el.height);
        ctx.save();
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.rect(rx, ry, rw, rh);
        ctx.clip();
        drawShapeLabel(ctx, rx + rw / 2, ry + rh / 2, el.label, el.labelFontSize ?? 16, el.labelFontFamily ?? 'Arial, sans-serif', el.strokeColor);
        ctx.restore();
      }
      break;
    }
    case 'ellipse': {
      const roughness = el.roughness ?? 0;
      const seed = hashId(el.id);
      drawEllipse(ctx, el.x, el.y, el.width, el.height, roughness, seed);
      if (el.label) {
        const cx = el.x + el.width / 2;
        const cy = el.y + el.height / 2;
        const erx = Math.abs(el.width / 2);
        const ery = Math.abs(el.height / 2);
        ctx.save();
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.ellipse(cx, cy, erx, ery, 0, 0, Math.PI * 2);
        ctx.clip();
        drawShapeLabel(ctx, cx, cy, el.label, el.labelFontSize ?? 16, el.labelFontFamily ?? 'Arial, sans-serif', el.strokeColor);
        ctx.restore();
      }
      break;
    }
    case 'line': {
      const roughness = el.roughness ?? 0;
      const seed = hashId(el.id);
      const pts = allElements ? resolveArrowEndpoints(el, allElements) : el;
      drawLine(ctx, pts.x, pts.y, pts.x2, pts.y2, roughness, seed);
      break;
    }
    case 'arrow': {
      const roughness = el.roughness ?? 0;
      const seed = hashId(el.id);
      const pts = allElements ? resolveArrowEndpoints(el, allElements) : el;
      drawArrow(ctx, pts.x, pts.y, pts.x2, pts.y2, el.strokeWidth, roughness, seed);
      break;
    }
    case 'freehand':
      drawFreehand(ctx, el.points);
      break;
    case 'text':
      ctx.setLineDash([]);
      drawText(ctx, el.x, el.y, el.content, el.fontSize, el.fontFamily, el.strokeColor);
      break;
    case 'image':
      drawImage(ctx, el.src, el.x, el.y, el.width, el.height);
      break;
  }

  ctx.restore();
}

// ── Rough offset helper ────────────────────────────────────────────────────────

function hashId(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) {
    h = (Math.imul(31, h) + id.charCodeAt(i)) | 0;
  }
  return h;
}

function roughOffset(seed: number, i: number, roughness: number, scale: number): number {
  return Math.sin(seed * 0.001 + i * 1.7) * roughness * scale;
}

// ── Shape renderers ───────────────────────────────────────────────────────────

function drawRectangle(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  roughness: number,
  seed: number,
): void {
  const rx = width < 0 ? x + width : x;
  const ry = height < 0 ? y + height : y;
  const rw = Math.abs(width);
  const rh = Math.abs(height);

  if (roughness < 0.05) {
    ctx.beginPath();
    ctx.rect(rx, ry, rw, rh);
    ctx.fill();
    ctx.stroke();
    return;
  }

  // Draw fill with plain rect first
  ctx.beginPath();
  ctx.rect(rx, ry, rw, rh);
  ctx.fill();

  // Draw wobbly stroke along 4 edges
  const amp = roughness * Math.min(rw, rh) * 0.06;
  const corners: [number, number][] = [
    [rx, ry], [rx + rw, ry], [rx + rw, ry + rh], [rx, ry + rh],
  ];

  ctx.beginPath();
  const segments = 4;
  for (let edge = 0; edge < 4; edge++) {
    const [x1, y1] = corners[edge]!;
    const [x2, y2] = corners[(edge + 1) % 4]!;
    for (let s = 0; s <= segments; s++) {
      const t = s / segments;
      const nx = x1 + (x2 - x1) * t;
      const ny = y1 + (y2 - y1) * t;
      const ox = roughOffset(seed, edge * 10 + s, 1, amp);
      const oy = roughOffset(seed + 99, edge * 10 + s, 1, amp);
      if (edge === 0 && s === 0) {
        ctx.moveTo(nx + ox, ny + oy);
      } else {
        ctx.lineTo(nx + ox, ny + oy);
      }
    }
  }
  ctx.closePath();
  ctx.stroke();
}

function drawEllipse(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  roughness: number,
  seed: number,
): void {
  const cx = x + width / 2;
  const cy = y + height / 2;
  const rx = Math.abs(width / 2);
  const ry = Math.abs(height / 2);

  if (roughness < 0.05) {
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    return;
  }

  // Fill with clean ellipse
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();

  // Wobbly stroke: perturb radius at each angle step
  const steps = 48;
  const amp = roughness * Math.min(rx, ry) * 0.1;
  ctx.beginPath();
  for (let i = 0; i <= steps; i++) {
    const angle = (i / steps) * Math.PI * 2;
    const perturbation = 1 + roughOffset(seed, i, 1, amp) / Math.min(rx, ry);
    const px = cx + rx * perturbation * Math.cos(angle);
    const py = cy + ry * perturbation * Math.sin(angle);
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.stroke();
}

function drawLine(
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  roughness: number,
  seed: number,
): void {
  if (roughness < 0.05) {
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    return;
  }

  const len = Math.hypot(x2 - x1, y2 - y1);
  if (len < 1) return;

  // Perpendicular unit vector for offset direction
  const px = -(y2 - y1) / len;
  const py =  (x2 - x1) / len;

  const segs = Math.max(3, Math.round(len / 40));
  const amp  = roughness * Math.min(len * 0.08, 28);

  ctx.beginPath();
  ctx.moveTo(x1, y1);
  for (let i = 1; i < segs; i++) {
    const t  = i / segs;
    const bx = x1 + (x2 - x1) * t;
    const by = y1 + (y2 - y1) * t;
    const off = roughOffset(seed, i, 1, amp);
    ctx.lineTo(bx + px * off, by + py * off);
  }
  ctx.lineTo(x2, y2);
  ctx.stroke();
}

function drawArrow(
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  strokeWidth: number,
  roughness: number,
  seed: number,
): void {
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const headLen = Math.max(12, strokeWidth * 4);

  const len = Math.hypot(x2 - x1, y2 - y1);
  if (roughness < 0.05 || len < 1) {
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  } else {
    const px  = -(y2 - y1) / len;
    const py  =  (x2 - x1) / len;
    const segs = Math.max(3, Math.round(len / 40));
    const amp  = roughness * Math.min(len * 0.08, 28);

    ctx.beginPath();
    ctx.moveTo(x1, y1);
    for (let i = 1; i < segs; i++) {
      const t   = i / segs;
      const bx  = x1 + (x2 - x1) * t;
      const by  = y1 + (y2 - y1) * t;
      const off = roughOffset(seed, i, 1, amp);
      ctx.lineTo(bx + px * off, by + py * off);
    }
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }

  // Arrowhead (always crisp)
  ctx.setLineDash([]);
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

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  ctx.beginPath();
  ctx.moveTo(p0[0], p0[1]);

  if (points.length === 2) {
    const p1 = points[1]!;
    ctx.lineTo(p1[0], p1[1]);
  } else {
    // Use native cubic Bézier curves for smooth rendering
    const tension = 0.5;

    for (let i = 0; i < points.length - 1; i++) {
      const p1_curr = points[i]!;
      const p2_curr = points[i + 1]!;
      const p0_prev = points[Math.max(0, i - 1)]!;
      const p3_next = points[Math.min(points.length - 1, i + 2)]!;

      // Catmull-Rom control points
      const cp1x = p1_curr[0] + (p2_curr[0] - p0_prev[0]) * tension / 3;
      const cp1y = p1_curr[1] + (p2_curr[1] - p0_prev[1]) * tension / 3;
      const cp2x = p2_curr[0] - (p3_next[0] - p1_curr[0]) * tension / 3;
      const cp2y = p2_curr[1] - (p3_next[1] - p1_curr[1]) * tension / 3;

      ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, p2_curr[0], p2_curr[1]);
    }
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

function drawImage(
  ctx: CanvasRenderingContext2D,
  src: string,
  x: number,
  y: number,
  width: number,
  height: number,
): void {
  const img = getCachedImage(src);
  if (img.complete && img.naturalWidth > 0) {
    ctx.drawImage(img, x, y, width, height);
  } else {
    // Draw placeholder while loading
    ctx.save();
    ctx.fillStyle = 'rgba(100,100,120,0.3)';
    ctx.fillRect(x, y, width, height);
    ctx.strokeStyle = 'rgba(180,180,200,0.5)';
    ctx.setLineDash([4, 4]);
    ctx.strokeRect(x, y, width, height);
    ctx.restore();
    // Trigger re-render once loaded
    img.onload = () => { /* renderer will pick it up on next frame */ };
  }
}
