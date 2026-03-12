import type { Scene } from '../core/scene';
import type { Element, RectangleElement, EllipseElement, LineElement, ArrowElement, FreehandElement, TextElement, ImageElement } from '../elements/element';
import { drawElement } from './draw_element';
import { getElementBounds } from './draw_selection';

// ── PNG export ─────────────────────────────────────────────────────────────────

export function exportPNG(scene: Scene, withBackground = true): void {
  const { elements } = scene;
  if (elements.length === 0) return;

  const { minX, minY, maxX, maxY } = computeBounds(elements);
  const PAD = 24;
  const w = maxX - minX + PAD * 2;
  const h = maxY - minY + PAD * 2;
  const scale = 2; // 2× for retina quality

  const canvas = document.createElement('canvas');
  canvas.width = w * scale;
  canvas.height = h * scale;
  const ctx = canvas.getContext('2d')!;

  if (withBackground) {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  ctx.scale(scale, scale);
  ctx.translate(PAD - minX, PAD - minY);

  for (const el of elements) {
    drawElement(ctx, el);
  }

  const url = canvas.toDataURL('image/png');
  triggerDownload(url, 'markasso-export.png');
}

// ── SVG export ─────────────────────────────────────────────────────────────────

export function exportSVG(scene: Scene, withBackground = true): void {
  const { elements } = scene;
  if (elements.length === 0) return;

  const { minX, minY, maxX, maxY } = computeBounds(elements);
  const PAD = 24;
  const w = maxX - minX + PAD * 2;
  const h = maxY - minY + PAD * 2;
  const ox = PAD - minX;
  const oy = PAD - minY;

  const parts: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${round(w)}" height="${round(h)}" viewBox="0 0 ${round(w)} ${round(h)}">`,
  ];
  if (withBackground) {
    parts.push(`<rect width="${round(w)}" height="${round(h)}" fill="white"/>`);
  }

  for (const el of elements) {
    parts.push(elementToSVG(el, ox, oy));
  }

  parts.push('</svg>');
  const svgStr = parts.join('\n');
  const blob = new Blob([svgStr], { type: 'image/svg+xml' });
  const url = URL.createObjectURL(blob);
  triggerDownload(url, 'markasso-export.svg');
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

// ── Bounds ─────────────────────────────────────────────────────────────────────

function computeBounds(elements: ReadonlyArray<Element>): { minX: number; minY: number; maxX: number; maxY: number } {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

  for (const el of elements) {
    switch (el.type) {
      case 'rectangle':
      case 'ellipse':
      case 'text': {
        const x = el.width < 0 ? el.x + el.width : el.x;
        const y = el.height < 0 ? el.y + el.height : el.y;
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x + Math.abs(el.width));
        maxY = Math.max(maxY, y + Math.abs(el.height));
        break;
      }
      case 'line':
      case 'arrow':
        minX = Math.min(minX, el.x, el.x2);
        minY = Math.min(minY, el.y, el.y2);
        maxX = Math.max(maxX, el.x, el.x2);
        maxY = Math.max(maxY, el.y, el.y2);
        break;
      case 'freehand':
        for (const [px, py] of el.points) {
          minX = Math.min(minX, px);
          minY = Math.min(minY, py);
          maxX = Math.max(maxX, px);
          maxY = Math.max(maxY, py);
        }
        break;
      case 'image': {
        const ix = el.width < 0 ? el.x + el.width : el.x;
        const iy = el.height < 0 ? el.y + el.height : el.y;
        minX = Math.min(minX, ix);
        minY = Math.min(minY, iy);
        maxX = Math.max(maxX, ix + Math.abs(el.width));
        maxY = Math.max(maxY, iy + Math.abs(el.height));
        break;
      }
    }
  }

  return { minX, minY, maxX, maxY };
}

// ── Element → SVG ──────────────────────────────────────────────────────────────

function elementToSVG(el: Element, ox: number, oy: number): string {
  switch (el.type) {
    case 'rectangle': return rectToSVG(el, ox, oy);
    case 'ellipse':   return ellipseToSVG(el, ox, oy);
    case 'line':      return lineToSVG(el, ox, oy);
    case 'arrow':     return arrowToSVG(el, ox, oy);
    case 'freehand':  return freehandToSVG(el, ox, oy);
    case 'text':      return textToSVG(el, ox, oy);
    case 'image':     return imageToSVG(el, ox, oy);
  }
}

function strokeDashAttr(el: { strokeStyle?: string; strokeWidth: number }): string {
  const style = el.strokeStyle ?? 'solid';
  if (style === 'dashed') {
    const on = el.strokeWidth * 4 + 4, off = el.strokeWidth * 2 + 2;
    return ` stroke-dasharray="${on} ${off}"`;
  }
  if (style === 'dotted') {
    const gap = el.strokeWidth * 3;
    return ` stroke-dasharray="${el.strokeWidth} ${gap}" stroke-linecap="round"`;
  }
  return '';
}

function shapeProps(el: { strokeColor: string; fillColor: string; strokeWidth: number; opacity: number; strokeStyle?: string }): string {
  const fill = el.fillColor === 'transparent' ? 'none' : el.fillColor;
  return `fill="${fill}" stroke="${el.strokeColor}" stroke-width="${el.strokeWidth}" stroke-linecap="round" stroke-linejoin="round" opacity="${el.opacity}"${strokeDashAttr(el)}`;
}

function rotateAttr(el: Element, ox: number, oy: number): string {
  if (!el.rotation) return '';
  const { x, y, w, h } = getElementBounds(el);
  const cx = round(x + w / 2 + ox);
  const cy = round(y + h / 2 + oy);
  const deg = round(el.rotation * 180 / Math.PI);
  return ` transform="rotate(${deg},${cx},${cy})"`;
}

function rectToSVG(el: RectangleElement, ox: number, oy: number): string {
  const x = (el.width < 0 ? el.x + el.width : el.x) + ox;
  const y = (el.height < 0 ? el.y + el.height : el.y) + oy;
  const w = Math.abs(el.width);
  const h = Math.abs(el.height);
  let svg = `<rect x="${round(x)}" y="${round(y)}" width="${round(w)}" height="${round(h)}" ${shapeProps(el)}${rotateAttr(el, ox, oy)}/>`;
  if (el.label) {
    svg += '\n' + shapeLabelToSVG(x + w / 2, y + h / 2, el.label, el.labelFontSize ?? 16, el.labelFontFamily ?? 'Arial, sans-serif', el.strokeColor, el.opacity);
  }
  return svg;
}

function ellipseToSVG(el: EllipseElement, ox: number, oy: number): string {
  const cx = el.x + el.width / 2 + ox;
  const cy = el.y + el.height / 2 + oy;
  const rx = Math.abs(el.width / 2);
  const ry = Math.abs(el.height / 2);
  let svg = `<ellipse cx="${round(cx)}" cy="${round(cy)}" rx="${round(rx)}" ry="${round(ry)}" ${shapeProps(el)}${rotateAttr(el, ox, oy)}/>`;
  if (el.label) {
    svg += '\n' + shapeLabelToSVG(cx, cy, el.label, el.labelFontSize ?? 16, el.labelFontFamily ?? 'Arial, sans-serif', el.strokeColor, el.opacity);
  }
  return svg;
}

function lineToSVG(el: LineElement, ox: number, oy: number): string {
  return `<line x1="${round(el.x + ox)}" y1="${round(el.y + oy)}" x2="${round(el.x2 + ox)}" y2="${round(el.y2 + oy)}" stroke="${el.strokeColor}" stroke-width="${el.strokeWidth}" stroke-linecap="round" opacity="${el.opacity}"${strokeDashAttr(el)}${rotateAttr(el, ox, oy)}/>`;
}

function arrowToSVG(el: ArrowElement, ox: number, oy: number): string {
  const x1 = el.x + ox, y1 = el.y + oy;
  const x2 = el.x2 + ox, y2 = el.y2 + oy;
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const headLen = Math.max(12, el.strokeWidth * 4);
  const ax1 = x2 - headLen * Math.cos(angle - Math.PI / 6);
  const ay1 = y2 - headLen * Math.sin(angle - Math.PI / 6);
  const ax2 = x2 - headLen * Math.cos(angle + Math.PI / 6);
  const ay2 = y2 - headLen * Math.sin(angle + Math.PI / 6);
  const sp = `stroke="${el.strokeColor}" stroke-width="${el.strokeWidth}" stroke-linecap="round" stroke-linejoin="round" fill="none" opacity="${el.opacity}"`;
  const rot = rotateAttr(el, ox, oy);
  return [
    `<line x1="${round(x1)}" y1="${round(y1)}" x2="${round(x2)}" y2="${round(y2)}" ${sp}${rot}/>`,
    `<polyline points="${round(ax1)},${round(ay1)} ${round(x2)},${round(y2)} ${round(ax2)},${round(ay2)}" ${sp}${rot}/>`,
  ].join('\n');
}

function freehandToSVG(el: FreehandElement, ox: number, oy: number): string {
  if (el.points.length < 2) return '';
  const p0 = el.points[0]!;
  const parts = [`M ${round(p0[0] + ox)} ${round(p0[1] + oy)}`];

  if (el.points.length === 2) {
    const p1 = el.points[1]!;
    parts.push(`L ${round(p1[0] + ox)} ${round(p1[1] + oy)}`);
  } else {
    for (let i = 1; i < el.points.length - 1; i++) {
      const [x0, y0] = el.points[i - 1]!;
      const [x1, y1] = el.points[i]!;
      const [x2, y2] = el.points[i + 1]!;
      const cpx = (x0 + x1) / 2;
      const cpy = (y0 + y1) / 2;
      const cpx2 = (x1 + x2) / 2;
      const cpy2 = (y1 + y2) / 2;
      const endX = (cpx2 + cpx) / 2;
      const endY = (cpy2 + cpy) / 2;
      parts.push(`Q ${round(x1 + ox)} ${round(y1 + oy)} ${round(endX + ox)} ${round(endY + oy)}`);
    }
    const last = el.points[el.points.length - 1]!;
    parts.push(`L ${round(last[0] + ox)} ${round(last[1] + oy)}`);
  }

  return `<path d="${parts.join(' ')}" stroke="${el.strokeColor}" stroke-width="${el.strokeWidth}" stroke-linecap="round" stroke-linejoin="round" fill="none" opacity="${el.opacity}"${rotateAttr(el, ox, oy)}/>`;
}

function textToSVG(el: TextElement, ox: number, oy: number): string {
  const lines = el.content.split('\n');
  const lineHeight = el.fontSize * 1.2;
  const tspans = lines
    .map((line, i) => `<tspan x="${round(el.x + ox)}" dy="${i === 0 ? 0 : round(lineHeight)}">${escapeXml(line)}</tspan>`)
    .join('');
  return `<text x="${round(el.x + ox)}" y="${round(el.y + oy)}" font-family="${el.fontFamily}" font-size="${el.fontSize}" fill="${el.strokeColor}" opacity="${el.opacity}" dominant-baseline="hanging"${rotateAttr(el, ox, oy)}>${tspans}</text>`;
}

function shapeLabelToSVG(
  cx: number, cy: number,
  label: string,
  fontSize: number,
  fontFamily: string,
  color: string,
  opacity: number,
): string {
  const lines = label.split('\n');
  const lineHeight = fontSize * 1.2;
  const totalH = lines.length * lineHeight;
  const startY = cy - totalH / 2;
  const tspans = lines
    .map((line, i) => `<tspan x="${round(cx)}" y="${round(startY + i * lineHeight + lineHeight / 2)}">${escapeXml(line)}</tspan>`)
    .join('');
  return `<text font-family="${fontFamily}" font-size="${fontSize}" fill="${color}" opacity="${opacity}" text-anchor="middle">${tspans}</text>`;
}

function imageToSVG(el: ImageElement, ox: number, oy: number): string {
  const x = (el.width < 0 ? el.x + el.width : el.x) + ox;
  const y = (el.height < 0 ? el.y + el.height : el.y) + oy;
  const w = Math.abs(el.width);
  const h = Math.abs(el.height);
  return `<image href="${el.src}" x="${round(x)}" y="${round(y)}" width="${round(w)}" height="${round(h)}" opacity="${el.opacity}"${rotateAttr(el, ox, oy)} preserveAspectRatio="none"/>`;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function triggerDownload(url: string, filename: string): void {
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
}
