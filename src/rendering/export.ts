import { normalizeRect } from '../core/geometry';
import type { Scene } from '../core/scene';
import { getTextContentBox } from '../core/text_measure';
import { wrapTextLines } from '../core/text_metrics';
import type {
  ArrowElement,
  Element,
  EllipseElement,
  FreehandElement,
  ImageElement,
  LineElement,
  RectangleElement,
  RhombusElement,
  ShapeElement,
  StencilElement,
  TextElement,
} from '../elements/element';
import { SHAPE_DEFINITIONS, shapeCommandsToPathData } from '../elements/shapes';
import { ICON_GRID } from '../elements/stencils/generic';
import { getBundledIcon } from '../elements/stencils/packs';
import {
  DEFAULT_STENCIL_LABEL_FONT_SIZE,
  getGenericIcon,
  getStencilLabelHeight,
  getStencilLabelLines,
  getStencilLabelWidth,
  STENCIL_LABEL_GAP,
} from '../elements/stencils/registry';
import {
  type ArrowHeadShape,
  type ArrowHeadVector,
  CLIP_EXTENT,
  type ConnectorHead,
  getArrowHeadShape,
  getArrowHeadVector,
  getConnectorHeads,
  getRouteHeadVector,
  type RoutePoint,
} from './connector_geometry';
import { getConnectorLabelBoxes, type LabelBox } from './connector_labels';
import {
  contrastColor,
  drawConnectorLabels,
  drawElement,
  getIconStrokeWidth,
} from './draw_element';
import {
  getElementBounds,
  resolveArrowEndpoints,
  resolveConnectorRoute,
} from './draw_selection';
import {
  DEFAULT_SHAPE_LABEL_FONT_FAMILY,
  DEFAULT_SHAPE_LABEL_FONT_SIZE,
  getLabelWrapWidth,
  getShapeTextBox,
} from './shape_geometry';

// ── Helpers ────────────────────────────────────────────────────────────────────

function getCanvasBg(): string {
  return (
    getComputedStyle(document.documentElement)
      .getPropertyValue('--canvas-bg')
      .trim() || '#080808'
  );
}

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
    ctx.fillStyle = getCanvasBg();
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  ctx.scale(scale, scale);
  ctx.translate(PAD - minX, PAD - minY);

  for (const el of elements) {
    drawElement(ctx, el, elements);
  }
  drawConnectorLabels(ctx, elements, getCanvasBg());

  const url = canvas.toDataURL('image/png');
  triggerDownload(url, 'markasso-export.png');
}

// ── HTML embed export ──────────────────────────────────────────────────────────

export function exportHTML(scene: Scene): void {
  const { elements } = scene;
  if (elements.length === 0) return;

  const { minX, minY, maxX, maxY } = computeBounds(elements);
  const PAD = 24;
  const w = maxX - minX + PAD * 2;
  const h = maxY - minY + PAD * 2;
  const scale = 2;

  const offscreen = document.createElement('canvas');
  offscreen.width = w * scale;
  offscreen.height = h * scale;
  const ctx = offscreen.getContext('2d')!;
  ctx.fillStyle = getCanvasBg();
  ctx.fillRect(0, 0, offscreen.width, offscreen.height);
  ctx.scale(scale, scale);
  ctx.translate(PAD - minX, PAD - minY);
  for (const el of elements) drawElement(ctx, el, elements);
  drawConnectorLabels(ctx, elements, getCanvasBg());

  const dataUrl = offscreen.toDataURL('image/png');
  const title = 'Markasso export';
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${title}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{background:#f5f5f5;display:flex;justify-content:center;align-items:flex-start;min-height:100vh;padding:24px}
  img{max-width:100%;height:auto;border-radius:4px;box-shadow:0 2px 16px rgba(0,0,0,.15)}
</style>
</head>
<body>
<img src="${dataUrl}" alt="${title}" width="${round(w)}" height="${round(h)}"/>
</body>
</html>`;

  const blob = new Blob([html], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  triggerDownload(url, 'markasso-embed.html');
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

// ── SVG export ─────────────────────────────────────────────────────────────────

export function exportSVG(scene: Scene, withBackground = true): void {
  const svgStr = sceneToSVG(scene.elements, {
    canvasColor: getCanvasBg(),
    withBackground,
  });
  if (!svgStr) return;
  const blob = new Blob([svgStr], { type: 'image/svg+xml' });
  const url = URL.createObjectURL(blob);
  triggerDownload(url, 'markasso-export.svg');
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export interface SceneToSVGOptions {
  /**
   * Color of the canvas the diagram sits on. Fills the page when
   * `withBackground` is set, and always fills the box behind connector
   * labels, as on the canvas.
   */
  readonly canvasColor: string;
  readonly withBackground: boolean;
}

/**
 * Standalone SVG document of the given elements, cropped to their bounds
 * with a margin; null when there is nothing to export. Pure (no DOM), so
 * it also runs outside the browser, e.g. in the MCP server.
 */
export function sceneToSVG(
  elements: ReadonlyArray<Element>,
  options: SceneToSVGOptions,
): string | null {
  if (elements.length === 0) return null;

  const { minX, minY, maxX, maxY } = computeBounds(elements);
  const PAD = 24;
  const w = maxX - minX + PAD * 2;
  const h = maxY - minY + PAD * 2;
  const ox = PAD - minX;
  const oy = PAD - minY;
  const canvasColor = escapeXml(options.canvasColor);

  const parts: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${round(w)}" height="${round(h)}" viewBox="0 0 ${round(w)} ${round(h)}">`,
  ];
  if (options.withBackground) {
    parts.push(
      `<rect width="${round(w)}" height="${round(h)}" fill="${canvasColor}"/>`,
    );
  }
  for (const el of elements) {
    parts.push(elementToSVG(el, ox, oy, elements));
  }
  // Connector labels go last, above every stroke, as on the canvas.
  const labels = getConnectorLabelBoxes(elements);
  for (const el of elements) {
    const box = labels.get(el.id);
    if (box && (el.type === 'line' || el.type === 'arrow'))
      parts.push(connectorLabelToSVG(el, box, ox, oy, canvasColor));
  }
  parts.push('</svg>');
  return parts.join('\n');
}

// ── Bounds ─────────────────────────────────────────────────────────────────────

function computeBounds(elements: ReadonlyArray<Element>): {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
} {
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;

  for (const el of elements) {
    // Attached connectors are drawn from their resolved ends, not the
    // coordinates stored when they were created.
    if (el.type === 'line' || el.type === 'arrow') {
      const b = getElementBounds(el, elements);
      minX = Math.min(minX, b.x);
      minY = Math.min(minY, b.y);
      maxX = Math.max(maxX, b.x + b.w);
      maxY = Math.max(maxY, b.y + b.h);
      continue;
    }
    switch (el.type) {
      case 'stencil': {
        // Include the label, which hangs below the icon box.
        const { x, y, w, h } = normalizeRect(el);
        const labelW = el.label ? getStencilLabelWidth(w) : w;
        minX = Math.min(minX, x + w / 2 - labelW / 2);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x + w / 2 + labelW / 2);
        maxY = Math.max(maxY, y + h + getStencilLabelHeight(el));
        break;
      }
      case 'rectangle':
      case 'ellipse':
      case 'rhombus':
      case 'shape':
      case 'text': {
        const { x, y, w, h } = normalizeRect(el);
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x + w);
        maxY = Math.max(maxY, y + h);
        break;
      }
      case 'freehand':
      case 'polygon':
        for (const [px, py] of el.points) {
          minX = Math.min(minX, px);
          minY = Math.min(minY, py);
          maxX = Math.max(maxX, px);
          maxY = Math.max(maxY, py);
        }
        break;
      case 'curve':
        minX = Math.min(minX, el.x, el.x2, el.cx);
        minY = Math.min(minY, el.y, el.y2, el.cy);
        maxX = Math.max(maxX, el.x, el.x2, el.cx);
        maxY = Math.max(maxY, el.y, el.y2, el.cy);
        break;
      case 'image': {
        const { x: ix, y: iy, w, h } = normalizeRect(el);
        minX = Math.min(minX, ix);
        minY = Math.min(minY, iy);
        maxX = Math.max(maxX, ix + w);
        maxY = Math.max(maxY, iy + h);
        break;
      }
    }
  }

  for (const box of getConnectorLabelBoxes(elements).values()) {
    minX = Math.min(minX, box.x - box.w / 2);
    minY = Math.min(minY, box.y - box.h / 2);
    maxX = Math.max(maxX, box.x + box.w / 2);
    maxY = Math.max(maxY, box.y + box.h / 2);
  }

  return { minX, minY, maxX, maxY };
}

// ── Element → SVG ──────────────────────────────────────────────────────────────

function elementToSVG(
  el: Element,
  ox: number,
  oy: number,
  allElements: ReadonlyArray<Element>,
): string {
  if ((el.type === 'line' || el.type === 'arrow') && el.routing === 'elbow') {
    return elbowToSVG(el, resolveConnectorRoute(el, allElements), ox, oy);
  }
  switch (el.type) {
    case 'rectangle':
      return rectToSVG(el, ox, oy);
    case 'ellipse':
      return ellipseToSVG(el, ox, oy);
    case 'rhombus':
      return rhombusToSVG(el, ox, oy);
    case 'shape':
      return shapeToSVG(el, ox, oy);
    case 'stencil':
      return stencilToSVG(el, ox, oy);
    case 'line':
      return lineToSVG(el, ox, oy, allElements);
    case 'arrow':
      return arrowToSVG(el, ox, oy, allElements);
    case 'freehand':
      return freehandToSVG(el, ox, oy);
    case 'text':
      return textToSVG(el, ox, oy);
    case 'image':
      return imageToSVG(el, ox, oy);
    case 'polygon': {
      if (el.points.length < 2) return '';
      const stroke = el.strokeColor;
      const fill = el.fillColor === 'transparent' ? 'none' : el.fillColor;
      const sw = el.strokeWidth;
      const dash =
        el.strokeStyle === 'dashed'
          ? `stroke-dasharray="${sw * 4},${sw * 2}"`
          : el.strokeStyle === 'dotted'
            ? `stroke-dasharray="${sw},${sw * 2}"`
            : '';
      const pts = el.points.map(([x, y]) => `${x + ox},${y + oy}`).join(' ');
      const tag = el.closed ? 'polygon' : 'polyline';
      return `<${tag} points="${pts}" fill="${escapeXml(fill)}" stroke="${escapeXml(stroke)}" stroke-width="${sw}" opacity="${el.opacity}" ${dash}/>`;
    }
    case 'curve': {
      const stroke = el.strokeColor;
      const sw = el.strokeWidth;
      const dash =
        el.strokeStyle === 'dashed'
          ? `stroke-dasharray="${sw * 4},${sw * 2}"`
          : el.strokeStyle === 'dotted'
            ? `stroke-dasharray="${sw},${sw * 2}"`
            : '';
      const x = el.x + ox;
      const y = el.y + oy;
      const x2 = el.x2 + ox;
      const y2 = el.y2 + oy;
      const cx = el.cx + ox;
      const cy = el.cy + oy;
      return `<path d="M ${x} ${y} Q ${cx} ${cy} ${x2} ${y2}" fill="none" stroke="${escapeXml(stroke)}" stroke-width="${sw}" opacity="${el.opacity}" ${dash}/>`;
    }
  }
}

function strokeDashAttr(el: {
  strokeStyle?: string;
  strokeWidth: number;
}): string {
  const style = el.strokeStyle ?? 'solid';
  if (style === 'dashed') {
    const on = el.strokeWidth * 4 + 4,
      off = el.strokeWidth * 2 + 2;
    return ` stroke-dasharray="${on} ${off}"`;
  }
  if (style === 'dotted') {
    const gap = el.strokeWidth * 3;
    return ` stroke-dasharray="${el.strokeWidth} ${gap}" stroke-linecap="round"`;
  }
  return '';
}

function shapeProps(el: {
  strokeColor: string;
  fillColor: string;
  strokeWidth: number;
  opacity: number;
  strokeStyle?: string;
}): string {
  const fill = el.fillColor === 'transparent' ? 'none' : el.fillColor;
  return `fill="${escapeXml(fill)}" stroke="${escapeXml(el.strokeColor)}" stroke-width="${el.strokeWidth}" stroke-linecap="round" stroke-linejoin="round" opacity="${el.opacity}"${strokeDashAttr(el)}`;
}

function rotateAttr(el: Element, ox: number, oy: number): string {
  if (!el.rotation) return '';
  const { x, y, w, h } = getElementBounds(el);
  const cx = round(x + w / 2 + ox);
  const cy = round(y + h / 2 + oy);
  const deg = round((el.rotation * 180) / Math.PI);
  return ` transform="rotate(${deg},${cx},${cy})"`;
}

function rectToSVG(el: RectangleElement, ox: number, oy: number): string {
  const { x: left, y: top, w, h } = normalizeRect(el);
  const x = left + ox;
  const y = top + oy;
  // Same clamp as the canvas (drawRectangle).
  const cr = Math.min(el.cornerRadius ?? 0, w / 2, h / 2);
  const rx = cr > 0 ? ` rx="${round(cr)}"` : '';
  let svg = `<rect x="${round(x)}" y="${round(y)}" width="${round(w)}" height="${round(h)}"${rx} ${shapeProps(el)}${rotateAttr(el, ox, oy)}/>`;
  if (el.label) {
    svg +=
      '\n' +
      wrappedLabelToSVG(
        x + w / 2,
        y + h / 2,
        getLabelWrapWidth(el, w, h),
        el.label,
        el.labelFontSize ?? DEFAULT_SHAPE_LABEL_FONT_SIZE,
        el.labelFontFamily ?? DEFAULT_SHAPE_LABEL_FONT_FAMILY,
        el.labelColor ?? contrastColor(el.fillColor, el.strokeColor),
        el.opacity,
      );
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
    svg +=
      '\n' +
      wrappedLabelToSVG(
        cx,
        cy,
        getLabelWrapWidth(el, rx * 2, ry * 2),
        el.label,
        el.labelFontSize ?? DEFAULT_SHAPE_LABEL_FONT_SIZE,
        el.labelFontFamily ?? DEFAULT_SHAPE_LABEL_FONT_FAMILY,
        el.labelColor ?? contrastColor(el.fillColor, el.strokeColor),
        el.opacity,
      );
  }
  return svg;
}

function rhombusToSVG(el: RhombusElement, ox: number, oy: number): string {
  const { x: left, y: top, w, h } = normalizeRect(el);
  const x = left + ox;
  const y = top + oy;
  const pts = [
    `${round(x + w / 2)},${round(y)}`,
    `${round(x + w)},${round(y + h / 2)}`,
    `${round(x + w / 2)},${round(y + h)}`,
    `${round(x)},${round(y + h / 2)}`,
  ].join(' ');
  let svg = `<polygon points="${pts}" ${shapeProps(el)}${rotateAttr(el, ox, oy)}/>`;
  if (el.label) {
    svg +=
      '\n' +
      wrappedLabelToSVG(
        x + w / 2,
        y + h / 2,
        getLabelWrapWidth(el, w, h),
        el.label,
        el.labelFontSize ?? DEFAULT_SHAPE_LABEL_FONT_SIZE,
        el.labelFontFamily ?? DEFAULT_SHAPE_LABEL_FONT_FAMILY,
        el.labelColor ?? contrastColor(el.fillColor, el.strokeColor),
        el.opacity,
      );
  }
  return svg;
}

function stencilToSVG(el: StencilElement, ox: number, oy: number): string {
  const { x: left, y: top, w, h } = normalizeRect(el);
  const x = left + ox;
  const y = top + oy;
  const parts: string[] = [];

  const { source } = el;
  const imageSrc =
    source.kind === 'embedded' ? source.src : getBundledIcon(source.ref)?.src;
  if (imageSrc) {
    parts.push(
      `<image href="${escapeXml(imageSrc)}" x="${round(x)}" y="${round(y)}" width="${round(w)}" height="${round(h)}" opacity="${el.opacity}" preserveAspectRatio="xMidYMid meet"/>`,
    );
  } else {
    const icon = source.kind === 'builtin' ? getGenericIcon(source.ref) : null;
    const size = Math.min(w, h);
    if (icon && size > 0) {
      const scale = size / ICON_GRID;
      const tx = x + (w - size) / 2;
      const ty = y + (h - size) / 2;
      const stroke = escapeXml(el.strokeColor);
      const fill = el.fillColor === 'transparent' ? 'none' : el.fillColor;
      const inner: string[] = [];
      if (icon.fill && fill !== 'none') {
        inner.push(
          `<path d="${shapeCommandsToPathData(icon.fill, 0, 0)}" fill="${escapeXml(fill)}" stroke="none"/>`,
        );
      }
      inner.push(
        `<path d="${shapeCommandsToPathData(icon.strokes, 0, 0)}" fill="none" stroke="${stroke}" stroke-width="${getIconStrokeWidth(el.strokeWidth)}" stroke-linecap="round" stroke-linejoin="round"/>`,
      );
      parts.push(
        `<g opacity="${el.opacity}" transform="translate(${round(tx)} ${round(ty)}) scale(${round(scale)})">${inner.join('')}</g>`,
      );
    } else {
      parts.push(
        `<rect x="${round(x)}" y="${round(y)}" width="${round(w)}" height="${round(h)}" fill="none" stroke="${escapeXml(el.strokeColor)}" stroke-dasharray="4 4"/>`,
      );
    }
  }

  const labelLines = getStencilLabelLines(el);
  if (labelLines.length > 0) {
    const fontSize = el.labelFontSize ?? DEFAULT_STENCIL_LABEL_FONT_SIZE;
    // The canvas draws each line from its top (textBaseline 'top'), so a
    // line's center sits fontSize / 2 below its top, not half a line height.
    const labelH = getStencilLabelHeight(el) - STENCIL_LABEL_GAP;
    const top = y + h + STENCIL_LABEL_GAP;
    parts.push(
      shapeLabelToSVG(
        x + w / 2,
        top + labelH / 2 - (fontSize * 1.2 - fontSize) / 2,
        labelLines,
        fontSize,
        el.labelFontFamily ?? 'Arial, sans-serif',
        el.labelColor ?? el.strokeColor,
        el.opacity,
      ),
    );
  }
  // Group so rotation applies to the artwork and its label together.
  return `<g${rotateAttr(el, ox, oy)}>${parts.join('')}</g>`;
}

function shapeToSVG(el: ShapeElement, ox: number, oy: number): string {
  const { x: left, y: top, w, h } = normalizeRect(el);
  const x = left + ox;
  const y = top + oy;
  const def = SHAPE_DEFINITIONS[el.kind];
  const parts = [
    `<path d="${shapeCommandsToPathData(def.outline(w, h), x, y)}" ${shapeProps(el)}/>`,
  ];
  const details = def.details?.(w, h);
  if (details) {
    parts.push(
      `<path d="${shapeCommandsToPathData(details, x, y)}" ${shapeProps({ ...el, fillColor: 'transparent' })}/>`,
    );
  }
  if (el.label) {
    const box = getShapeTextBox(el.kind, w, h);
    parts.push(
      wrappedLabelToSVG(
        x + box.x + box.w / 2,
        y + box.y + box.h / 2,
        getLabelWrapWidth(el, w, h),
        el.label,
        el.labelFontSize ?? DEFAULT_SHAPE_LABEL_FONT_SIZE,
        el.labelFontFamily ?? DEFAULT_SHAPE_LABEL_FONT_FAMILY,
        el.labelColor ?? contrastColor(el.fillColor, el.strokeColor),
        el.opacity,
      ),
    );
  }
  // Group so rotation applies to outline, details and label together.
  return `<g${rotateAttr(el, ox, oy)}>${parts.join('')}</g>`;
}

/** Shifts a head vector into export coordinates. */
function offsetVector(
  v: ArrowHeadVector,
  ox: number,
  oy: number,
): ArrowHeadVector {
  return {
    fromX: v.fromX + ox,
    fromY: v.fromY + oy,
    tipX: v.tipX + ox,
    tipY: v.tipY + oy,
  };
}

/** SVG box attributes covering any drawable area (see CLIP_EXTENT). */
const EVERYTHING_BOX = `x="${-CLIP_EXTENT}" y="${-CLIP_EXTENT}" width="${CLIP_EXTENT * 2}" height="${CLIP_EXTENT * 2}"`;

function headShapeToSVG(shape: ArrowHeadShape, attrs: string): string {
  if (shape.kind === 'circle') {
    return `<circle cx="${round(shape.cx)}" cy="${round(shape.cy)}" r="${round(shape.r)}" ${attrs}/>`;
  }
  const points = shape.points
    .map(([x, y]) => `${round(x)},${round(y)}`)
    .join(' ');
  return shape.kind === 'polygon'
    ? `<polygon points="${points}" ${attrs}/>`
    : `<polyline points="${points}" ${attrs}/>`;
}

/**
 * Wraps a connector shaft and appends its heads. Closed heads cut the shaft
 * out of their area with a mask (the SVG counterpart of the canvas clip),
 * so hollow heads stay hollow on any background.
 */
function connectorToSVG(
  el: LineElement | ArrowElement,
  shaft: string,
  heads: ReadonlyArray<ConnectorHead>,
  rot: string,
): string {
  const color = escapeXml(el.strokeColor);
  const base = `stroke="${color}" stroke-width="${el.strokeWidth}" stroke-linecap="round" stroke-linejoin="round" opacity="${el.opacity}"`;
  const shapes = heads.map((h) => ({
    h,
    shape: getArrowHeadShape(
      h.style,
      h.fromX,
      h.fromY,
      h.tipX,
      h.tipY,
      el.strokeWidth,
    ),
  }));
  const closed = shapes.filter(({ h }) => h.style !== 'open');
  const parts: string[] = [];
  if (closed.length > 0) {
    const id = `mh-${el.id.replace(/[^\w-]/g, '')}`;
    const cutouts = closed
      .map(({ shape }) => headShapeToSVG(shape, 'fill="black"'))
      .join('');
    parts.push(
      `<mask id="${id}" maskUnits="userSpaceOnUse" ${EVERYTHING_BOX}><rect ${EVERYTHING_BOX} fill="white"/>${cutouts}</mask>`,
      `<g mask="url(#${id})">${shaft}</g>`,
    );
  } else {
    parts.push(shaft);
  }
  for (const { shape } of shapes) {
    const fill = shape.kind === 'polygon' && shape.filled ? color : 'none';
    parts.push(headShapeToSVG(shape, `${base} fill="${fill}"${rot}`));
  }
  return parts.join('\n');
}

function lineToSVG(
  el: LineElement,
  ox: number,
  oy: number,
  allElements: ReadonlyArray<Element>,
): string {
  const pts = resolveArrowEndpoints(el, allElements);
  const x1 = pts.x + ox,
    y1 = pts.y + oy;
  const x2 = pts.x2 + ox,
    y2 = pts.y2 + oy;
  const sp = `stroke="${escapeXml(el.strokeColor)}" stroke-width="${el.strokeWidth}" stroke-linecap="round" stroke-linejoin="round" fill="none" opacity="${el.opacity}"${strokeDashAttr(el)}`;
  const rot = rotateAttr(el, ox, oy);
  const curved = el.cx !== undefined && el.cy !== undefined;
  const shaft = curved
    ? `<path d="M ${round(x1)} ${round(y1)} Q ${round(el.cx! + ox)} ${round(el.cy! + oy)} ${round(x2)} ${round(y2)}" ${sp}${rot}/>`
    : `<line x1="${round(x1)}" y1="${round(y1)}" x2="${round(x2)}" y2="${round(y2)}" ${sp}${rot}/>`;
  const heads = getConnectorHeads(el, (placement) =>
    offsetVector(getArrowHeadVector(pts, el, placement), ox, oy),
  );
  const parts = [connectorToSVG(el, shaft, heads, rot)];
  return parts.join('\n');
}

/** Orthogonal connector: one polyline plus heads on the end segments. */
function elbowToSVG(
  el: LineElement | ArrowElement,
  route: ReadonlyArray<RoutePoint>,
  ox: number,
  oy: number,
): string {
  if (route.length < 2) return '';
  const sp = `stroke="${escapeXml(el.strokeColor)}" stroke-width="${el.strokeWidth}" stroke-linecap="round" stroke-linejoin="round" fill="none" opacity="${el.opacity}"${strokeDashAttr(el)}`;
  const points = route
    .map(([x, y]) => `${round(x + ox)},${round(y + oy)}`)
    .join(' ');
  const heads = getConnectorHeads(el, (placement) =>
    offsetVector(getRouteHeadVector(route, placement), ox, oy),
  );
  const parts = [
    connectorToSVG(el, `<polyline points="${points}" ${sp}/>`, heads, ''),
  ];
  return parts.join('\n');
}

function arrowToSVG(
  el: ArrowElement,
  ox: number,
  oy: number,
  allElements: ReadonlyArray<Element>,
): string {
  const pts = resolveArrowEndpoints(el, allElements);
  const x1 = pts.x + ox,
    y1 = pts.y + oy;
  const x2 = pts.x2 + ox,
    y2 = pts.y2 + oy;
  const sp = `stroke="${escapeXml(el.strokeColor)}" stroke-width="${el.strokeWidth}" stroke-linecap="round" stroke-linejoin="round" fill="none" opacity="${el.opacity}"`;
  const rot = rotateAttr(el, ox, oy);
  const shaft = `<line x1="${round(x1)}" y1="${round(y1)}" x2="${round(x2)}" y2="${round(y2)}" ${sp}${rot}/>`;
  const heads = getConnectorHeads(el, (placement) =>
    offsetVector(getArrowHeadVector(pts, {}, placement), ox, oy),
  );
  const parts = [connectorToSVG(el, shaft, heads, rot)];
  return parts.join('\n');
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
      parts.push(
        `Q ${round(x1 + ox)} ${round(y1 + oy)} ${round(endX + ox)} ${round(endY + oy)}`,
      );
    }
    const last = el.points[el.points.length - 1]!;
    parts.push(`L ${round(last[0] + ox)} ${round(last[1] + oy)}`);
  }

  return `<path d="${parts.join(' ')}" stroke="${escapeXml(el.strokeColor)}" stroke-width="${el.strokeWidth}" stroke-linecap="round" stroke-linejoin="round" fill="none" opacity="${el.opacity}"${rotateAttr(el, ox, oy)}/>`;
}

function textToSVG(el: TextElement, ox: number, oy: number): string {
  const box = getTextContentBox(el);
  const lines = wrapTextLines(
    el.content,
    box.width,
    el.fontSize,
    el.fontFamily,
    el.bold,
    box.padding > 0,
  );
  const lineHeight = el.fontSize * 1.2;
  const align = el.textAlign ?? 'left';
  const x =
    box.x +
    ox +
    (align === 'center' ? box.width / 2 : align === 'right' ? box.width : 0);
  const anchor =
    align === 'center' ? 'middle' : align === 'right' ? 'end' : 'start';
  const tspans = lines
    .map(
      (line, i) =>
        `<tspan x="${round(x)}" y="${round(box.y + oy + i * lineHeight)}">${escapeXml(line)}</tspan>`,
    )
    .join('');
  const weight = el.bold ? ' font-weight="bold"' : '';
  const style = el.italic ? ' font-style="italic"' : '';
  const background =
    el.fillColor === 'transparent'
      ? ''
      : `<rect x="${round(el.x + ox)}" y="${round(el.y + oy)}" width="${round(el.width)}" height="${round(el.height)}" fill="${escapeXml(el.fillColor)}" opacity="${el.opacity}"${rotateAttr(el, ox, oy)}/>`;
  return `${background}<text font-family="${escapeXml(el.fontFamily)}" font-size="${el.fontSize}"${weight}${style} fill="${escapeXml(el.strokeColor)}" opacity="${el.opacity}" text-anchor="${anchor}" dominant-baseline="text-before-edge"${rotateAttr(el, ox, oy)}>${tspans}</text>`;
}

/** Connector label on a box of the canvas color (see connector_labels.ts). */
function connectorLabelToSVG(
  el: LineElement | ArrowElement,
  box: LabelBox,
  ox: number,
  oy: number,
  canvasColor: string,
): string {
  if (!el.label) return '';
  const cx = box.x + ox;
  const cy = box.y + oy;
  const { w, h } = box;
  const fontSize = el.labelFontSize ?? 12;
  const fontFamily = el.labelFontFamily ?? 'Arial, sans-serif';
  const lines = el.label.split('\n');
  return [
    `<rect x="${round(cx - w / 2)}" y="${round(cy - h / 2)}" width="${round(w)}" height="${round(h)}" fill="${canvasColor}"/>`,
    shapeLabelToSVG(
      cx,
      cy,
      lines,
      fontSize,
      fontFamily,
      el.labelColor ?? el.strokeColor,
      el.opacity,
    ),
  ].join('\n');
}

/** Shape label wrapped like the canvas does (`drawShapeLabel`). */
function wrappedLabelToSVG(
  cx: number,
  cy: number,
  maxWidth: number,
  label: string,
  fontSize: number,
  fontFamily: string,
  color: string,
  opacity: number,
): string {
  return shapeLabelToSVG(
    cx,
    cy,
    wrapTextLines(label, maxWidth, fontSize, fontFamily, false, true),
    fontSize,
    fontFamily,
    color,
    opacity,
  );
}

/** Block of lines centered on (cx, cy), one `<tspan>` per line. */
function shapeLabelToSVG(
  cx: number,
  cy: number,
  lines: ReadonlyArray<string>,
  fontSize: number,
  fontFamily: string,
  color: string,
  opacity: number,
): string {
  const lineHeight = fontSize * 1.2;
  const totalH = lines.length * lineHeight;
  const startY = cy - totalH / 2;
  const tspans = lines
    .map(
      (line, i) =>
        `<tspan x="${round(cx)}" y="${round(startY + i * lineHeight + lineHeight / 2)}">${escapeXml(line)}</tspan>`,
    )
    .join('');
  return `<text font-family="${escapeXml(fontFamily)}" font-size="${fontSize}" fill="${escapeXml(color)}" opacity="${opacity}" text-anchor="middle" dominant-baseline="central">${tspans}</text>`;
}

function imageToSVG(el: ImageElement, ox: number, oy: number): string {
  const { x: left, y: top, w, h } = normalizeRect(el);
  const x = left + ox;
  const y = top + oy;
  return `<image href="${escapeXml(el.src)}" x="${round(x)}" y="${round(y)}" width="${round(w)}" height="${round(h)}" opacity="${el.opacity}"${rotateAttr(el, ox, oy)} preserveAspectRatio="none"/>`;
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
