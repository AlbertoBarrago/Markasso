import type { Element } from '../elements/element';
import { getElementCenter, resolveArrowEndpoints } from './draw_selection';
import { getCachedImage } from './image_cache';

function resolveStrokeColorForTheme(strokeColor: string): string {
  if (typeof document === 'undefined') return strokeColor;
  const resolvedTheme = document.documentElement.getAttribute('data-theme');
  if (resolvedTheme !== 'light') return strokeColor;
  return strokeColor.toLowerCase() === '#e2e2ef' ? '#000000' : strokeColor;
}

export function drawElement(ctx: CanvasRenderingContext2D, el: Element, allElements?: ReadonlyArray<Element>, editingShapeLabelId?: string | null): void {
  ctx.save();
  const strokeColor = resolveStrokeColorForTheme(el.strokeColor);
  ctx.globalAlpha = el.opacity;
  ctx.strokeStyle = strokeColor;
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
      drawRectangle(ctx, el.x, el.y, el.width, el.height, roughness, seed, el.cornerRadius ?? 0);
      if (el.label && editingShapeLabelId !== el.id) {
        const rx = el.width < 0 ? el.x + el.width : el.x;
        const ry = el.height < 0 ? el.y + el.height : el.y;
        const rw = Math.abs(el.width);
        const rh = Math.abs(el.height);
        ctx.save();
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.rect(rx, ry, rw, rh);
        ctx.clip();
        drawShapeLabel(ctx, rx + rw / 2, ry + rh / 2, rw, el.label, el.labelFontSize ?? 16, el.labelFontFamily ?? 'Arial, sans-serif', strokeColor);
        ctx.restore();
      }
      break;
    }
    case 'rhombus': {
      const roughness = el.roughness ?? 0;
      const seed = hashId(el.id);
      drawRhombus(ctx, el.x, el.y, el.width, el.height, roughness, seed);
      if (el.label && editingShapeLabelId !== el.id) {
        const rx = el.width < 0 ? el.x + el.width : el.x;
        const ry = el.height < 0 ? el.y + el.height : el.y;
        const rw = Math.abs(el.width);
        const rh = Math.abs(el.height);
        const cx = rx + rw / 2;
        const cy = ry + rh / 2;
        ctx.save();
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.moveTo(cx, ry);
        ctx.lineTo(rx + rw, cy);
        ctx.lineTo(cx, ry + rh);
        ctx.lineTo(rx, cy);
        ctx.closePath();
        ctx.clip();
        drawShapeLabel(ctx, cx, cy, rw * 0.7, el.label, el.labelFontSize ?? 16, el.labelFontFamily ?? 'Arial, sans-serif', strokeColor);
        ctx.restore();
      }
      break;
    }
    case 'ellipse': {
      const roughness = el.roughness ?? 0;
      const seed = hashId(el.id);
      drawEllipse(ctx, el.x, el.y, el.width, el.height, roughness, seed);
      if (el.label && editingShapeLabelId !== el.id) {
        const cx = el.x + el.width / 2;
        const cy = el.y + el.height / 2;
        const erx = Math.abs(el.width / 2);
        const ery = Math.abs(el.height / 2);
        ctx.save();
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.ellipse(cx, cy, erx, ery, 0, 0, Math.PI * 2);
        ctx.clip();
        drawShapeLabel(ctx, cx, cy, erx * 2 * 0.7, el.label, el.labelFontSize ?? 16, el.labelFontFamily ?? 'Arial, sans-serif', strokeColor);
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
      if (el.label) {
        const fontSize = el.labelFontSize ?? 16;
        const fontFamily = el.labelFontFamily ?? 'Arial, sans-serif';
        const mx = (pts.x + pts.x2) / 2;
        const my = (pts.y + pts.y2) / 2;
        // Measure label box to compute the gap along the arrow
        ctx.save();
        ctx.setLineDash([]);
        ctx.font = `${fontSize}px ${fontFamily}`;
        const lines = el.label.split('\n');
        const pad = fontSize * 0.4;
        const labelW = Math.max(...lines.map((l) => ctx.measureText(l).width)) + pad * 2;
        const labelH = lines.length * fontSize * 1.2 + pad * 2;
        ctx.restore();
        const totalLen = Math.hypot(pts.x2 - pts.x, pts.y2 - pts.y);
        const dx = totalLen > 0 ? (pts.x2 - pts.x) / totalLen : 1;
        const dy = totalLen > 0 ? (pts.y2 - pts.y) / totalLen : 0;
        // Half-extent of the label box projected onto the arrow direction
        const gapHalf = Math.abs(dx) * labelW / 2 + Math.abs(dy) * labelH / 2;
        const gapT = totalLen > 0 ? gapHalf / totalLen : 0;
        const t1 = Math.max(0, 0.5 - gapT);
        const t2 = Math.min(1, 0.5 + gapT);
        // Draw shaft in two segments, skipping the label gap
        drawArrowShaft(ctx, pts.x, pts.y, pts.x + (pts.x2 - pts.x) * t1, pts.y + (pts.y2 - pts.y) * t1, roughness, seed);
        drawArrowShaft(ctx, pts.x + (pts.x2 - pts.x) * t2, pts.y + (pts.y2 - pts.y) * t2, pts.x2, pts.y2, roughness, seed);
        drawArrowHead(ctx, pts.x, pts.y, pts.x2, pts.y2, el.strokeWidth);
        ctx.save();
        ctx.setLineDash([]);
        drawArrowLabel(ctx, mx, my, el.label, fontSize, fontFamily, strokeColor);
        ctx.restore();
      } else {
        drawArrow(ctx, pts.x, pts.y, pts.x2, pts.y2, el.strokeWidth, roughness, seed);
      }
      break;
    }
    case 'freehand':
      drawFreehand(ctx, el.points);
      break;
    case 'text':
      ctx.setLineDash([]);
      if (el.isCode) {
        drawCode(ctx, el.x, el.y, el.content, el.fontSize, el.fontFamily, strokeColor, el.width, el.height, el.textAlign ?? 'left');
      } else {
        drawText(ctx, el.x, el.y, el.content, el.fontSize, el.fontFamily, strokeColor, el.fillColor, el.width, el.height, el.textAlign ?? 'left');
      }
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
  cornerRadius = 0,
): void {
  const rx = width < 0 ? x + width : x;
  const ry = height < 0 ? y + height : y;
  const rw = Math.abs(width);
  const rh = Math.abs(height);
  const cr = cornerRadius > 0 ? Math.min(cornerRadius, rw / 2, rh / 2) : 0;

  if (roughness < 0.05) {
    ctx.beginPath();
    if (cr > 0) ctx.roundRect(rx, ry, rw, rh, cr);
    else ctx.rect(rx, ry, rw, rh);
    ctx.fill();
    ctx.stroke();
    return;
  }

  // Draw fill with plain rect first
  ctx.beginPath();
  if (cr > 0) ctx.roundRect(rx, ry, rw, rh, cr);
  else ctx.rect(rx, ry, rw, rh);
  ctx.fill();

  // Draw wobbly stroke along 4 edges using quadratic curves for smooth wobble
  const amp = roughness * Math.min(rw, rh) * 0.03;
  const corners: [number, number][] = [
    [rx, ry], [rx + rw, ry], [rx + rw, ry + rh], [rx, ry + rh],
  ];

  ctx.beginPath();
  for (let edge = 0; edge < 4; edge++) {
    const [x1, y1] = corners[edge]!;
    const [x2, y2] = corners[(edge + 1) % 4]!;
    if (edge === 0) ctx.moveTo(x1, y1);
    const mx = (x1 + x2) / 2;
    const my = (y1 + y2) / 2;
    const cp1x = (x1 + mx) / 2 + roughOffset(seed,      edge * 7 + 1, 1, amp);
    const cp1y = (y1 + my) / 2 + roughOffset(seed + 99, edge * 7 + 1, 1, amp);
    const cp2x = (mx + x2) / 2 + roughOffset(seed,      edge * 7 + 3, 1, amp);
    const cp2y = (my + y2) / 2 + roughOffset(seed + 99, edge * 7 + 3, 1, amp);
    ctx.quadraticCurveTo(cp1x, cp1y, mx, my);
    ctx.quadraticCurveTo(cp2x, cp2y, x2, y2);
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
  const amp = roughness * Math.min(rx, ry) * 0.05;
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

function drawRhombus(
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

  const top: [number, number]    = [rx + rw / 2, ry];
  const right: [number, number]  = [rx + rw,     ry + rh / 2];
  const bottom: [number, number] = [rx + rw / 2, ry + rh];
  const left: [number, number]   = [rx,           ry + rh / 2];

  // Fill with clean diamond
  ctx.beginPath();
  ctx.moveTo(top[0], top[1]);
  ctx.lineTo(right[0], right[1]);
  ctx.lineTo(bottom[0], bottom[1]);
  ctx.lineTo(left[0], left[1]);
  ctx.closePath();
  ctx.fill();

  if (roughness < 0.05) {
    ctx.stroke();
    return;
  }

  // Wobbly stroke along 4 edges
  const corners = [top, right, bottom, left];
  const amp = roughness * Math.min(rw, rh) * 0.03;

  ctx.beginPath();
  for (let edge = 0; edge < 4; edge++) {
    const [x1, y1] = corners[edge]!;
    const [x2, y2] = corners[(edge + 1) % 4]!;
    if (edge === 0) ctx.moveTo(x1, y1);
    const mx = (x1 + x2) / 2;
    const my = (y1 + y2) / 2;
    const cp1x = (x1 + mx) / 2 + roughOffset(seed,      edge * 7 + 1, 1, amp);
    const cp1y = (y1 + my) / 2 + roughOffset(seed + 99, edge * 7 + 1, 1, amp);
    const cp2x = (mx + x2) / 2 + roughOffset(seed,      edge * 7 + 3, 1, amp);
    const cp2y = (my + y2) / 2 + roughOffset(seed + 99, edge * 7 + 3, 1, amp);
    ctx.quadraticCurveTo(cp1x, cp1y, mx, my);
    ctx.quadraticCurveTo(cp2x, cp2y, x2, y2);
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

  const segs = Math.max(2, Math.round(len / 80));
  const amp  = roughness * Math.min(len * 0.04, 14);

  ctx.beginPath();
  ctx.moveTo(x1, y1);
  for (let i = 0; i < segs; i++) {
    const tCtrl = (i + 0.5) / segs;
    const tEnd  = (i + 1)   / segs;
    const cpx = x1 + (x2 - x1) * tCtrl + px * roughOffset(seed, i, 1, amp);
    const cpy = y1 + (y2 - y1) * tCtrl + py * roughOffset(seed, i, 1, amp);
    ctx.quadraticCurveTo(cpx, cpy, x1 + (x2 - x1) * tEnd, y1 + (y2 - y1) * tEnd);
  }
  ctx.stroke();
}

function drawArrowShaft(
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  roughness: number,
  seed: number,
): void {
  const len = Math.hypot(x2 - x1, y2 - y1);
  if (roughness < 0.05 || len < 1) {
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  } else {
    const px  = -(y2 - y1) / len;
    const py  =  (x2 - x1) / len;
    const segs = Math.max(2, Math.round(len / 80));
    const amp  = roughness * Math.min(len * 0.04, 14);

    ctx.beginPath();
    ctx.moveTo(x1, y1);
    for (let i = 0; i < segs; i++) {
      const tCtrl = (i + 0.5) / segs;
      const tEnd  = (i + 1)   / segs;
      const cpx = x1 + (x2 - x1) * tCtrl + px * roughOffset(seed, i, 1, amp);
      const cpy = y1 + (y2 - y1) * tCtrl + py * roughOffset(seed, i, 1, amp);
      ctx.quadraticCurveTo(cpx, cpy, x1 + (x2 - x1) * tEnd, y1 + (y2 - y1) * tEnd);
    }
    ctx.stroke();
  }
}

function drawArrowHead(
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  strokeWidth: number,
): void {
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const headLen = Math.max(12, strokeWidth * 4);
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
  drawArrowShaft(ctx, x1, y1, x2, y2, roughness, seed);
  drawArrowHead(ctx, x1, y1, x2, y2, strokeWidth);
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

function buildWrappedLines(
  ctx: CanvasRenderingContext2D,
  content: string,
  maxWidth: number,
): string[] {
  const result: string[] = [];
  for (const line of content.split('\n')) {
    if (!line || ctx.measureText(line).width <= maxWidth) {
      result.push(line);
      continue;
    }
    const words = line.split(' ');
    let current = '';
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (current && ctx.measureText(candidate).width > maxWidth) {
        result.push(current);
        current = word;
      } else {
        current = candidate;
      }
    }
    if (current) result.push(current);
  }
  return result;
}

function drawText(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  content: string,
  fontSize: number,
  fontFamily: string,
  color: string,
  bgColor: string,
  elWidth: number,
  elHeight: number,
  textAlign: 'left' | 'center' | 'right' = 'left',
): void {
  if (bgColor !== 'transparent') {
    ctx.fillStyle = bgColor;
    ctx.fillRect(x, y, elWidth, elHeight);
  }
  ctx.font = `${fontSize}px ${fontFamily}`;
  ctx.fillStyle = color;
  ctx.textBaseline = 'top';
  ctx.textAlign = textAlign;
  const drawX = textAlign === 'center' ? x + elWidth / 2
    : textAlign === 'right'  ? x + elWidth
    : x;
  const lines = buildWrappedLines(ctx, content, elWidth);
  for (let i = 0; i < lines.length; i++) {
    ctx.fillText(lines[i] ?? '', drawX, y + i * fontSize * 1.2);
  }
  ctx.textAlign = 'left';
}

function drawCode(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  content: string,
  fontSize: number,
  fontFamily: string,
  color: string,
  width: number,
  height: number,
  textAlign: 'left' | 'center' | 'right' = 'left',
): void {
  const PAD = 10;
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.beginPath();
  (ctx as CanvasRenderingContext2D & { roundRect: (...a: unknown[]) => void }).roundRect(x, y, width, height, 6);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.15)';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.font = `${fontSize}px ${fontFamily}`;
  ctx.fillStyle = color;
  ctx.textBaseline = 'top';
  ctx.textAlign = textAlign;
  const drawX = textAlign === 'center' ? x + width / 2
    : textAlign === 'right'  ? x + width - PAD
    : x + PAD;
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    ctx.fillText(lines[i] ?? '', drawX, y + PAD + i * fontSize * 1.3);
  }
  ctx.textAlign = 'left';
}

function drawShapeLabel(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  shapeWidth: number,
  label: string,
  fontSize: number,
  fontFamily: string,
  color: string,
): void {
  ctx.font = `${fontSize}px ${fontFamily}`;
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const maxWidth = Math.max(shapeWidth - 16, fontSize);
  const lines = label.split('\n').flatMap((line) => buildWrappedLines(ctx, line, maxWidth));
  const lineHeight = fontSize * 1.2;
  const totalHeight = lines.length * lineHeight;
  for (let i = 0; i < lines.length; i++) {
    ctx.fillText(lines[i] ?? '', cx, cy - totalHeight / 2 + i * lineHeight + lineHeight / 2);
  }
}

function drawArrowLabel(
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
