import { normalizeRect } from '../core/geometry';
import { getTextContentBox } from '../core/text_measure';
import { wrapTextLines } from '../core/text_metrics';
import type {
  ArrowElement,
  Element,
  LineElement,
  ShapeElement,
  StencilElement,
} from '../elements/element';
import {
  DEFAULT_CONNECTOR_LABEL_FONT_SIZE,
  DEFAULT_LABEL_FONT_FAMILY,
  DEFAULT_SHAPE_LABEL_FONT_SIZE,
  DEFAULT_STENCIL_LABEL_FONT_SIZE,
} from '../elements/label_defaults';
import { SHAPE_DEFINITIONS, type ShapeCommand } from '../elements/shapes';
import { type GenericIcon, ICON_GRID } from '../elements/stencils/generic';
import { getBundledIcon } from '../elements/stencils/packs';
import {
  getGenericIcon,
  getStencilLabelLines,
  STENCIL_LABEL_GAP,
} from '../elements/stencils/registry';
import {
  type ArrowHeadShape,
  CLIP_EXTENT,
  type ConnectorHead,
  getArrowHeadShape,
  getArrowHeadVector,
  getConnectorHeads,
  getRouteHeadVector,
  type RoutePoint,
} from './connector_geometry';
import { getConnectorLabelBoxes } from './connector_labels';
import {
  getElementCenter,
  resolveArrowEndpoints,
  resolveConnectorRoute,
} from './draw_selection';
import { buildFreehandOutline } from './freehand_outline';
import { getCachedImage } from './image_cache';
import { getLabelWrapWidth, getShapeTextBox } from './shape_geometry';
import { getIsLightTheme } from './theme_cache';

export function contrastColor(fill: string, fallback: string): string {
  if (!fill || fill === 'transparent' || fill === 'none') return fallback;
  const hex = fill.replace('#', '').slice(0, 6);
  if (hex.length < 6) return fallback;
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return fallback;
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.55 ? '#111111' : '#ffffff';
}

function resolveStrokeColorForTheme(strokeColor: string): string {
  if (typeof document === 'undefined') return strokeColor;
  if (!getIsLightTheme()) return strokeColor;
  return strokeColor.toLowerCase() === '#e2e2ef' ? '#000000' : strokeColor;
}

/**
 * In dark mode a pure-black shadow is invisible against the dark canvas.
 * Map it to a subtle white/light glow so it reads on both themes.
 */
function resolveShadowColorForTheme(shadowColor: string): string {
  if (typeof document === 'undefined') return shadowColor;
  if (getIsLightTheme()) return shadowColor;
  // Convert black-based rgba to a white glow
  const lc = shadowColor.toLowerCase().replace(/\s/g, '');
  if (lc.startsWith('rgba(0,0,0') || lc === '#000' || lc === '#000000') {
    // Extract alpha and use it for a white glow (capped at 0.25 to stay subtle)
    const m = lc.match(/rgba\(0,0,0,([\d.]+)\)/);
    const alpha = m?.[1] ? Math.min(parseFloat(m[1]) * 0.7, 0.25) : 0.15;
    return `rgba(255,255,255,${alpha.toFixed(2)})`;
  }
  return shadowColor;
}

export function drawElement(
  ctx: CanvasRenderingContext2D,
  el: Element,
  allElements?: ReadonlyArray<Element>,
  editingShapeLabelId?: string | null,
): void {
  ctx.save();
  const strokeColor = resolveStrokeColorForTheme(el.strokeColor);
  ctx.globalAlpha = el.opacity;
  ctx.strokeStyle = strokeColor;
  ctx.lineWidth = el.strokeWidth;
  ctx.fillStyle =
    el.fillColor === 'transparent' ? 'rgba(0,0,0,0)' : el.fillColor;
  ctx.lineCap = el.lineCap ?? 'round';
  ctx.lineJoin = el.lineJoin ?? 'round';

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

  if (el.shadowBlur && el.shadowBlur > 0) {
    ctx.shadowBlur = el.shadowBlur;
    ctx.shadowColor = resolveShadowColorForTheme(
      el.shadowColor ?? 'rgba(0,0,0,0.35)',
    ) as string;
    ctx.shadowOffsetX = el.shadowOffsetX ?? 4;
    ctx.shadowOffsetY = el.shadowOffsetY ?? 4;
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
      drawRectangle(
        ctx,
        el.x,
        el.y,
        el.width,
        el.height,
        roughness,
        seed,
        el.cornerRadius ?? 0,
      );
      if (el.label && editingShapeLabelId !== el.id) {
        const { x: rx, y: ry, w: rw, h: rh } = normalizeRect(el);
        ctx.save();
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.rect(rx, ry, rw, rh);
        ctx.clip();
        drawShapeLabel(
          ctx,
          rx + rw / 2,
          ry + rh / 2,
          getLabelWrapWidth(el, rw, rh),
          el.label,
          el.labelFontSize ?? DEFAULT_SHAPE_LABEL_FONT_SIZE,
          el.labelFontFamily ?? DEFAULT_LABEL_FONT_FAMILY,
          el.labelColor ?? contrastColor(el.fillColor, strokeColor),
        );
        ctx.restore();
      }
      break;
    }
    case 'rhombus': {
      const roughness = el.roughness ?? 0;
      const seed = hashId(el.id);
      drawRhombus(
        ctx,
        el.x,
        el.y,
        el.width,
        el.height,
        roughness,
        seed,
        el.cornerRadius ?? 0,
      );
      if (el.label && editingShapeLabelId !== el.id) {
        const { x: rx, y: ry, w: rw, h: rh } = normalizeRect(el);
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
        drawShapeLabel(
          ctx,
          cx,
          cy,
          getLabelWrapWidth(el, rw, rh),
          el.label,
          el.labelFontSize ?? DEFAULT_SHAPE_LABEL_FONT_SIZE,
          el.labelFontFamily ?? DEFAULT_LABEL_FONT_FAMILY,
          el.labelColor ?? contrastColor(el.fillColor, strokeColor),
        );
        ctx.restore();
      }
      break;
    }
    case 'shape': {
      drawShape(ctx, el, el.roughness ?? 0, hashId(el.id));
      if (el.label && editingShapeLabelId !== el.id) {
        const { x: bx, y: by, w: bw, h: bh } = normalizeRect(el);
        const box = getShapeTextBox(el.kind, bw, bh);
        ctx.save();
        ctx.setLineDash([]);
        ctx.beginPath();
        traceShapeCommands(
          ctx,
          SHAPE_DEFINITIONS[el.kind].outline(bw, bh),
          bx,
          by,
        );
        ctx.clip();
        drawShapeLabel(
          ctx,
          bx + box.x + box.w / 2,
          by + box.y + box.h / 2,
          getLabelWrapWidth(el, bw, bh),
          el.label,
          el.labelFontSize ?? DEFAULT_SHAPE_LABEL_FONT_SIZE,
          el.labelFontFamily ?? DEFAULT_LABEL_FONT_FAMILY,
          el.labelColor ?? contrastColor(el.fillColor, strokeColor),
        );
        ctx.restore();
      }
      break;
    }
    case 'stencil': {
      drawStencil(ctx, el, strokeColor, editingShapeLabelId);
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
        drawShapeLabel(
          ctx,
          cx,
          cy,
          getLabelWrapWidth(el, erx * 2, ery * 2),
          el.label,
          el.labelFontSize ?? DEFAULT_SHAPE_LABEL_FONT_SIZE,
          el.labelFontFamily ?? DEFAULT_LABEL_FONT_FAMILY,
          el.labelColor ?? contrastColor(el.fillColor, strokeColor),
        );
        ctx.restore();
      }
      break;
    }
    case 'line':
    case 'arrow': {
      // Labels are drawn afterwards by drawConnectorLabels, on top of every
      // connector, so the shaft is always drawn whole here.
      if (el.routing === 'elbow') {
        drawElbowConnector(
          ctx,
          el,
          resolveConnectorRoute(el, allElements ?? [el]),
          strokeColor,
        );
        break;
      }
      const roughness = el.roughness ?? 0;
      const seed = hashId(el.id);
      const pts = allElements ? resolveArrowEndpoints(el, allElements) : el;
      const heads = getConnectorHeads(el, (p) =>
        getArrowHeadVector(pts, el.type === 'line' ? el : {}, p),
      );
      const headClip = clipOutClosedHeads(ctx, heads, el.strokeWidth);
      if (el.type === 'line' && el.cx !== undefined && el.cy !== undefined) {
        ctx.beginPath();
        ctx.moveTo(pts.x, pts.y);
        ctx.quadraticCurveTo(el.cx, el.cy, pts.x2, pts.y2);
        ctx.stroke();
      } else {
        drawLine(ctx, pts.x, pts.y, pts.x2, pts.y2, roughness, seed);
      }
      if (headClip) ctx.restore();
      drawConnectorHeads(ctx, heads, el.strokeWidth, strokeColor);
      break;
    }
    case 'curve': {
      ctx.beginPath();
      ctx.moveTo(el.x, el.y);
      ctx.quadraticCurveTo(el.cx, el.cy, el.x2, el.y2);
      ctx.stroke();
      break;
    }
    case 'polygon': {
      if (el.points.length < 2) break;
      ctx.beginPath();
      ctx.moveTo(el.points[0]![0], el.points[0]![1]);
      for (let i = 1; i < el.points.length; i++) {
        ctx.lineTo(el.points[i]![0], el.points[i]![1]);
      }
      if (el.closed) ctx.closePath();
      ctx.fill();
      ctx.stroke();
      break;
    }
    case 'freehand':
      drawFreehand(ctx, el.points, el.strokeWidth, strokeColor, el.pressures);
      break;
    case 'text':
      ctx.setLineDash([]);
      if (el.isCode) {
        drawCode(
          ctx,
          el.x,
          el.y,
          el.content,
          el.fontSize,
          el.fontFamily,
          strokeColor,
          el.width,
          el.height,
          el.textAlign ?? 'left',
        );
      } else {
        const box = getTextContentBox(el);
        if (el.fillColor !== 'transparent') {
          ctx.fillStyle = el.fillColor;
          ctx.fillRect(el.x, el.y, el.width, el.height);
        }
        drawText(
          ctx,
          box.x,
          box.y,
          el.content,
          el.fontSize,
          el.fontFamily,
          strokeColor,
          box.width,
          el.textAlign ?? 'left',
          el.bold,
          el.italic,
          el.underline,
          el.strikethrough,
          // Padded text keeps a fixed box, like its editor (text_tool.ts).
          box.padding > 0,
        );
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

function roughOffset(
  seed: number,
  i: number,
  roughness: number,
  scale: number,
): number {
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
  const { x: rx, y: ry, w: rw, h: rh } = normalizeRect({ x, y, width, height });
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
    [rx, ry],
    [rx + rw, ry],
    [rx + rw, ry + rh],
    [rx, ry + rh],
  ];

  ctx.beginPath();
  for (let edge = 0; edge < 4; edge++) {
    const [x1, y1] = corners[edge]!;
    const [x2, y2] = corners[(edge + 1) % 4]!;
    if (edge === 0) ctx.moveTo(x1, y1);
    const mx = (x1 + x2) / 2;
    const my = (y1 + y2) / 2;
    const cp1x = (x1 + mx) / 2 + roughOffset(seed, edge * 7 + 1, 1, amp);
    const cp1y = (y1 + my) / 2 + roughOffset(seed + 99, edge * 7 + 1, 1, amp);
    const cp2x = (mx + x2) / 2 + roughOffset(seed, edge * 7 + 3, 1, amp);
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
  // Guard against a zero-area ellipse (width or height collapsed to 0) —
  // dividing by zero here would produce NaN coordinates and silently drop
  // the whole stroke path instead of just skipping the wobble.
  const minRadius = Math.min(rx, ry) || 1;
  const amp = roughness * minRadius * 0.05;
  ctx.beginPath();
  for (let i = 0; i <= steps; i++) {
    const angle = (i / steps) * Math.PI * 2;
    const perturbation = 1 + roughOffset(seed, i, 1, amp) / minRadius;
    const px = cx + rx * perturbation * Math.cos(angle);
    const py = cy + ry * perturbation * Math.sin(angle);
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.stroke();
}

function drawRhombusPath(
  ctx: CanvasRenderingContext2D,
  rx: number,
  ry: number,
  rw: number,
  rh: number,
  cr: number,
): void {
  const top: [number, number] = [rx + rw / 2, ry];
  const right: [number, number] = [rx + rw, ry + rh / 2];
  const bottom: [number, number] = [rx + rw / 2, ry + rh];
  const left: [number, number] = [rx, ry + rh / 2];
  const corners = [top, right, bottom, left];

  ctx.beginPath();
  if (cr <= 0) {
    ctx.moveTo(top[0], top[1]);
    for (let i = 1; i < 4; i++) ctx.lineTo(corners[i]![0], corners[i]![1]);
    ctx.closePath();
  } else {
    // Draw each corner with arcTo for rounded corners
    for (let i = 0; i < 4; i++) {
      const prev = corners[(i + 3) % 4]!;
      const curr = corners[i]!;
      const next = corners[(i + 1) % 4]!;
      // Direction vectors from curr to prev and curr to next
      const d1x = prev[0] - curr[0];
      const d1y = prev[1] - curr[1];
      const d2x = next[0] - curr[0];
      const d2y = next[1] - curr[1];
      const len1 = Math.hypot(d1x, d1y);
      const len2 = Math.hypot(d2x, d2y);
      const r = Math.min(cr, len1 / 2, len2 / 2);
      const startX = curr[0] + (d1x / len1) * r;
      const startY = curr[1] + (d1y / len1) * r;
      const endX = curr[0] + (d2x / len2) * r;
      const endY = curr[1] + (d2y / len2) * r;
      if (i === 0) ctx.moveTo(startX, startY);
      else ctx.lineTo(startX, startY);
      ctx.arcTo(curr[0], curr[1], endX, endY, r);
    }
    ctx.closePath();
  }
}

function drawRhombus(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  roughness: number,
  seed: number,
  cornerRadius = 0,
): void {
  const { x: rx, y: ry, w: rw, h: rh } = normalizeRect({ x, y, width, height });
  const cr = cornerRadius > 0 ? Math.min(cornerRadius, rw / 4, rh / 4) : 0;

  // Fill with clean diamond (supports corner radius)
  drawRhombusPath(ctx, rx, ry, rw, rh, cr);
  ctx.fill();

  if (roughness < 0.05) {
    ctx.stroke();
    return;
  }

  // Wobbly stroke along 4 edges (no corner radius for rough mode)
  const top: [number, number] = [rx + rw / 2, ry];
  const right: [number, number] = [rx + rw, ry + rh / 2];
  const bottom: [number, number] = [rx + rw / 2, ry + rh];
  const left: [number, number] = [rx, ry + rh / 2];
  const corners = [top, right, bottom, left];
  const amp = roughness * Math.min(rw, rh) * 0.03;

  ctx.beginPath();
  for (let edge = 0; edge < 4; edge++) {
    const [x1, y1] = corners[edge]!;
    const [x2, y2] = corners[(edge + 1) % 4]!;
    if (edge === 0) ctx.moveTo(x1, y1);
    const mx = (x1 + x2) / 2;
    const my = (y1 + y2) / 2;
    const cp1x = (x1 + mx) / 2 + roughOffset(seed, edge * 7 + 1, 1, amp);
    const cp1y = (y1 + my) / 2 + roughOffset(seed + 99, edge * 7 + 1, 1, amp);
    const cp2x = (mx + x2) / 2 + roughOffset(seed, edge * 7 + 3, 1, amp);
    const cp2y = (my + y2) / 2 + roughOffset(seed + 99, edge * 7 + 3, 1, amp);
    ctx.quadraticCurveTo(cp1x, cp1y, mx, my);
    ctx.quadraticCurveTo(cp2x, cp2y, x2, y2);
  }
  ctx.closePath();
  ctx.stroke();
}

/** Appends shape commands to the current path, offset by (ox, oy). */
function traceShapeCommands(
  ctx: CanvasRenderingContext2D,
  commands: ReadonlyArray<ShapeCommand>,
  ox: number,
  oy: number,
): void {
  for (const cmd of commands) {
    switch (cmd[0]) {
      case 'M':
        ctx.moveTo(ox + cmd[1], oy + cmd[2]);
        break;
      case 'L':
        ctx.lineTo(ox + cmd[1], oy + cmd[2]);
        break;
      case 'C':
        ctx.bezierCurveTo(
          ox + cmd[1],
          oy + cmd[2],
          ox + cmd[3],
          oy + cmd[4],
          ox + cmd[5],
          oy + cmd[6],
        );
        break;
      case 'Z':
        ctx.closePath();
        break;
    }
  }
}

/**
 * Hand-drawn variant of `traceShapeCommands`: straight edges get the same
 * two-quadratic wobble as rectangles and rhombi, cubic control points are
 * jittered. Deterministic for a given seed so shapes don't flicker.
 */
function traceRoughShapeCommands(
  ctx: CanvasRenderingContext2D,
  commands: ReadonlyArray<ShapeCommand>,
  ox: number,
  oy: number,
  seed: number,
  amp: number,
): void {
  let startX = ox;
  let startY = oy;
  let curX = ox;
  let curY = oy;
  const wobbleTo = (x2: number, y2: number, i: number): void => {
    const mx = (curX + x2) / 2;
    const my = (curY + y2) / 2;
    ctx.quadraticCurveTo(
      (curX + mx) / 2 + roughOffset(seed, i * 7 + 1, 1, amp),
      (curY + my) / 2 + roughOffset(seed + 99, i * 7 + 1, 1, amp),
      mx,
      my,
    );
    ctx.quadraticCurveTo(
      (mx + x2) / 2 + roughOffset(seed, i * 7 + 3, 1, amp),
      (my + y2) / 2 + roughOffset(seed + 99, i * 7 + 3, 1, amp),
      x2,
      y2,
    );
    curX = x2;
    curY = y2;
  };
  commands.forEach((cmd, i) => {
    switch (cmd[0]) {
      case 'M':
        curX = startX = ox + cmd[1];
        curY = startY = oy + cmd[2];
        ctx.moveTo(curX, curY);
        break;
      case 'L':
        wobbleTo(ox + cmd[1], oy + cmd[2], i);
        break;
      case 'C':
        ctx.bezierCurveTo(
          ox + cmd[1] + roughOffset(seed, i * 5 + 2, 1, amp),
          oy + cmd[2] + roughOffset(seed + 99, i * 5 + 2, 1, amp),
          ox + cmd[3] + roughOffset(seed, i * 5 + 4, 1, amp),
          oy + cmd[4] + roughOffset(seed + 99, i * 5 + 4, 1, amp),
          ox + cmd[5],
          oy + cmd[6],
        );
        curX = ox + cmd[5];
        curY = oy + cmd[6];
        break;
      case 'Z':
        if (Math.hypot(curX - startX, curY - startY) > 0.5) {
          wobbleTo(startX, startY, i);
        }
        break;
    }
  });
}

function drawShape(
  ctx: CanvasRenderingContext2D,
  el: ShapeElement,
  roughness: number,
  seed: number,
): void {
  const { x: bx, y: by, w: bw, h: bh } = normalizeRect(el);
  const def = SHAPE_DEFINITIONS[el.kind];
  const outline = def.outline(bw, bh);
  const details = def.details?.(bw, bh);

  // Fill always uses the clean outline so rough strokes never leak the fill.
  ctx.beginPath();
  traceShapeCommands(ctx, outline, bx, by);
  ctx.fill();

  if (roughness < 0.05) {
    ctx.stroke();
    if (details) {
      ctx.beginPath();
      traceShapeCommands(ctx, details, bx, by);
      ctx.stroke();
    }
    return;
  }

  const amp = roughness * Math.min(bw, bh) * 0.03;
  ctx.beginPath();
  traceRoughShapeCommands(ctx, outline, bx, by, seed, amp);
  ctx.stroke();
  if (details) {
    ctx.beginPath();
    traceRoughShapeCommands(ctx, details, bx, by, seed + 7, amp);
    ctx.stroke();
  }
}

/** Orthogonal connector: one polyline plus heads on the end segments. */
function drawElbowConnector(
  ctx: CanvasRenderingContext2D,
  el: LineElement | ArrowElement,
  route: ReadonlyArray<RoutePoint>,
  strokeColor: string,
): void {
  if (route.length < 2) return;
  const roughness = el.roughness ?? 0;
  const seed = hashId(el.id);
  const heads = getConnectorHeads(el, (p) => getRouteHeadVector(route, p));
  const headClip = clipOutClosedHeads(ctx, heads, el.strokeWidth);
  if (roughness < 0.05) {
    ctx.beginPath();
    route.forEach(([x, y], i) => {
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
  } else {
    for (let i = 1; i < route.length; i++) {
      const [x1, y1] = route[i - 1]!;
      const [x2, y2] = route[i]!;
      drawLine(ctx, x1, y1, x2, y2, roughness, seed + i * 31);
    }
  }
  if (headClip) ctx.restore();
  drawConnectorHeads(ctx, heads, el.strokeWidth, strokeColor);
}

/**
 * Connector labels, drawn after every element so no stroke crosses them:
 * each sits on a box of the canvas color at the spot connector_labels.ts
 * picked for it.
 */
export function drawConnectorLabels(
  ctx: CanvasRenderingContext2D,
  elements: ReadonlyArray<Element>,
  canvasColor: string,
  editingShapeLabelId?: string | null,
): void {
  const boxes = getConnectorLabelBoxes(elements);
  if (boxes.size === 0) return;
  for (const el of elements) {
    if (el.type !== 'line' && el.type !== 'arrow') continue;
    const box = boxes.get(el.id);
    if (!box || !el.label || el.id === editingShapeLabelId) continue;
    ctx.save();
    ctx.globalAlpha = el.opacity;
    ctx.setLineDash([]);
    ctx.fillStyle = canvasColor;
    ctx.fillRect(box.x - box.w / 2, box.y - box.h / 2, box.w, box.h);
    drawArrowLabel(
      ctx,
      box.x,
      box.y,
      el.label,
      el.labelFontSize ?? DEFAULT_CONNECTOR_LABEL_FONT_SIZE,
      el.labelFontFamily ?? DEFAULT_LABEL_FONT_FAMILY,
      el.labelColor ?? resolveStrokeColorForTheme(el.strokeColor),
    );
    ctx.restore();
  }
}

function drawStencil(
  ctx: CanvasRenderingContext2D,
  el: StencilElement,
  strokeColor: string,
  editingShapeLabelId: string | null | undefined,
): void {
  const { x: bx, y: by, w: bw, h: bh } = normalizeRect(el);

  if (el.source.kind === 'embedded') {
    drawImageContained(ctx, el.source.src, bx, by, bw, bh);
  } else {
    const icon = getGenericIcon(el.source.ref);
    const bundled = icon ? null : getBundledIcon(el.source.ref);
    if (icon) {
      drawGenericIcon(ctx, el, icon, bx, by, bw, bh);
    } else if (bundled) {
      drawImageContained(ctx, bundled.src, bx, by, bw, bh);
    } else {
      // Unknown reference, or a bundled pack still loading.
      drawMissingStencil(ctx, bx, by, bw, bh);
    }
  }

  if (el.label && editingShapeLabelId !== el.id) {
    const fontSize = el.labelFontSize ?? DEFAULT_STENCIL_LABEL_FONT_SIZE;
    ctx.save();
    ctx.setLineDash([]);
    const fontFamily = el.labelFontFamily ?? DEFAULT_LABEL_FONT_FAMILY;
    ctx.font = `${fontSize}px ${fontFamily}`;
    ctx.fillStyle = el.labelColor ?? strokeColor;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    const lines = getStencilLabelLines(el);
    lines.forEach((l, i) => {
      ctx.fillText(
        l,
        bx + bw / 2,
        by + bh + STENCIL_LABEL_GAP + i * fontSize * 1.2,
      );
    });
    ctx.restore();
  }
}

/**
 * Generic icons are drawn on their 24-unit grid, scaled uniformly and
 * centered in the box so they never distort. Stroke width is expressed in
 * grid units and capped, so thick canvas strokes don't blot small icons.
 */
function drawGenericIcon(
  ctx: CanvasRenderingContext2D,
  el: StencilElement,
  icon: GenericIcon,
  bx: number,
  by: number,
  bw: number,
  bh: number,
): void {
  const size = Math.min(bw, bh);
  if (size <= 0) return;
  const scale = size / ICON_GRID;
  ctx.save();
  ctx.translate(bx + (bw - size) / 2, by + (bh - size) / 2);
  ctx.scale(scale, scale);
  ctx.lineWidth = getIconStrokeWidth(el.strokeWidth);
  if (icon.fill) {
    ctx.beginPath();
    traceShapeCommands(ctx, icon.fill, 0, 0);
    ctx.fill();
  }
  ctx.beginPath();
  const roughness = el.roughness ?? 0;
  if (roughness < 0.05) {
    traceShapeCommands(ctx, icon.strokes, 0, 0);
  } else {
    traceRoughShapeCommands(
      ctx,
      icon.strokes,
      0,
      0,
      hashId(el.id),
      roughness * 0.35,
    );
  }
  ctx.stroke();
  ctx.restore();
}

/** Icon stroke width in grid units for an element stroke width. */
export function getIconStrokeWidth(strokeWidth: number): number {
  return Math.min(Math.max(strokeWidth, 1) * 1.5, 3);
}

/** Placeholder for a reference this build doesn't know (or still loads). */
function drawMissingStencil(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
): void {
  ctx.save();
  ctx.setLineDash([4, 4]);
  ctx.lineWidth = 1;
  ctx.strokeRect(x, y, w, h);
  ctx.restore();
}

/** Draws an image inside the box with its aspect ratio kept (no distortion). */
function drawImageContained(
  ctx: CanvasRenderingContext2D,
  src: string,
  x: number,
  y: number,
  w: number,
  h: number,
): void {
  const img = getCachedImage(src);
  if (!img?.complete || img.naturalWidth === 0) {
    drawImage(ctx, src, x, y, w, h);
    return;
  }
  const ratio = Math.min(w / img.naturalWidth, h / img.naturalHeight);
  const dw = img.naturalWidth * ratio;
  const dh = img.naturalHeight * ratio;
  ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
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
  const py = (x2 - x1) / len;

  const segs = Math.max(2, Math.round(len / 80));
  const amp = roughness * Math.min(len * 0.04, 14);

  ctx.beginPath();
  ctx.moveTo(x1, y1);
  for (let i = 0; i < segs; i++) {
    const tCtrl = (i + 0.5) / segs;
    const tEnd = (i + 1) / segs;
    const cpx = x1 + (x2 - x1) * tCtrl + px * roughOffset(seed, i, 1, amp);
    const cpy = y1 + (y2 - y1) * tCtrl + py * roughOffset(seed, i, 1, amp);
    ctx.quadraticCurveTo(
      cpx,
      cpy,
      x1 + (x2 - x1) * tEnd,
      y1 + (y2 - y1) * tEnd,
    );
  }
  ctx.stroke();
}

function traceHeadShape(
  ctx: CanvasRenderingContext2D,
  shape: ArrowHeadShape,
): void {
  if (shape.kind === 'circle') {
    ctx.moveTo(shape.cx + shape.r, shape.cy);
    ctx.arc(shape.cx, shape.cy, shape.r, 0, Math.PI * 2);
    return;
  }
  shape.points.forEach(([x, y], i) => {
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  if (shape.kind === 'polygon') ctx.closePath();
}

/**
 * Clips closed heads out of the drawing area so the shaft stops at their
 * outline, which keeps hollow heads hollow on any background (including
 * transparent PNG export). Returns true when a clip was pushed; the caller
 * must then `ctx.restore()` before drawing the heads.
 */
function clipOutClosedHeads(
  ctx: CanvasRenderingContext2D,
  heads: ReadonlyArray<ConnectorHead>,
  strokeWidth: number,
): boolean {
  const closed = heads.filter((h) => h.style !== 'open');
  if (closed.length === 0) return false;
  ctx.save();
  ctx.beginPath();
  ctx.rect(-CLIP_EXTENT, -CLIP_EXTENT, CLIP_EXTENT * 2, CLIP_EXTENT * 2);
  for (const h of closed) {
    traceHeadShape(
      ctx,
      getArrowHeadShape(h.style, h.fromX, h.fromY, h.tipX, h.tipY, strokeWidth),
    );
  }
  ctx.clip('evenodd');
  return true;
}

function drawConnectorHeads(
  ctx: CanvasRenderingContext2D,
  heads: ReadonlyArray<ConnectorHead>,
  strokeWidth: number,
  strokeColor: string,
): void {
  if (heads.length === 0) return;
  ctx.save();
  ctx.setLineDash([]);
  ctx.fillStyle = strokeColor;
  for (const h of heads) {
    const shape = getArrowHeadShape(
      h.style,
      h.fromX,
      h.fromY,
      h.tipX,
      h.tipY,
      strokeWidth,
    );
    ctx.beginPath();
    traceHeadShape(ctx, shape);
    if (shape.kind === 'polygon' && shape.filled) ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
}

function drawFreehand(
  ctx: CanvasRenderingContext2D,
  points: ReadonlyArray<readonly [number, number]>,
  baseWidth: number,
  color: string,
  pressures?: ReadonlyArray<number>,
): void {
  if (points.length < 2) return;

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  const outline = buildFreehandOutline(points, pressures, baseWidth);
  if (outline.length < 3) return;

  ctx.save();
  ctx.setLineDash([]);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(outline[0]![0], outline[0]![1]);
  for (let i = 1; i < outline.length; i++) {
    ctx.lineTo(outline[i]![0], outline[i]![1]);
  }
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawText(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  content: string,
  fontSize: number,
  fontFamily: string,
  color: string,
  elWidth: number,
  textAlign: 'left' | 'center' | 'right' = 'left',
  bold?: boolean,
  italic?: boolean,
  underline?: boolean,
  strikethrough?: boolean,
  breakWords = false,
): void {
  const fontStyle = `${italic ? 'italic ' : ''}${bold ? 'bold ' : ''}${fontSize}px ${fontFamily}`;
  ctx.font = fontStyle;
  ctx.fillStyle = color;
  ctx.textBaseline = 'top';
  ctx.textAlign = textAlign;
  const drawX =
    textAlign === 'center'
      ? x + elWidth / 2
      : textAlign === 'right'
        ? x + elWidth
        : x;
  const lineHeight = fontSize * 1.2;
  const lines = wrapTextLines(
    content,
    elWidth,
    fontSize,
    fontFamily,
    bold,
    breakWords,
  );
  for (let i = 0; i < lines.length; i++) {
    const lineY = y + i * lineHeight;
    ctx.fillText(lines[i] ?? '', drawX, lineY);

    if (underline || strikethrough) {
      const lineText = lines[i] ?? '';
      const lineW = ctx.measureText(lineText).width;
      let lineX: number;
      if (textAlign === 'center') lineX = drawX - lineW / 2;
      else if (textAlign === 'right') lineX = drawX - lineW;
      else lineX = drawX;

      ctx.save();
      ctx.strokeStyle = color;
      ctx.lineWidth = Math.max(1, fontSize * 0.06);
      ctx.setLineDash([]);
      if (underline) {
        const uy = lineY + fontSize + ctx.lineWidth;
        ctx.beginPath();
        ctx.moveTo(lineX, uy);
        ctx.lineTo(lineX + lineW, uy);
        ctx.stroke();
      }
      if (strikethrough) {
        const sy = lineY + fontSize * 0.55;
        ctx.beginPath();
        ctx.moveTo(lineX, sy);
        ctx.lineTo(lineX + lineW, sy);
        ctx.stroke();
      }
      ctx.restore();
    }
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
  (
    ctx as CanvasRenderingContext2D & { roundRect: (...a: unknown[]) => void }
  ).roundRect(x, y, width, height, 6);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.15)';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.font = `${fontSize}px ${fontFamily}`;
  ctx.fillStyle = color;
  ctx.textBaseline = 'top';
  ctx.textAlign = textAlign;
  const drawX =
    textAlign === 'center'
      ? x + width / 2
      : textAlign === 'right'
        ? x + width - PAD
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
  maxWidth: number,
  label: string,
  fontSize: number,
  fontFamily: string,
  color: string,
): void {
  ctx.font = `${fontSize}px ${fontFamily}`;
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  // Labels sit in a fixed box, so overlong words break like in the editor.
  const lines = wrapTextLines(
    label,
    maxWidth,
    fontSize,
    fontFamily,
    false,
    true,
  );
  const lineHeight = fontSize * 1.2;
  const totalHeight = lines.length * lineHeight;
  for (let i = 0; i < lines.length; i++) {
    ctx.fillText(
      lines[i] ?? '',
      cx,
      cy - totalHeight / 2 + i * lineHeight + lineHeight / 2,
    );
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
    ctx.fillText(
      lines[i] ?? '',
      cx,
      cy - totalHeight / 2 + i * lineHeight + lineHeight / 2,
    );
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
  if (!img) {
    // Permanently broken source — draw an error placeholder
    ctx.save();
    ctx.fillStyle = 'rgba(180,40,40,0.25)';
    ctx.fillRect(x, y, width, height);
    ctx.strokeStyle = 'rgba(220,80,80,0.7)';
    ctx.setLineDash([4, 4]);
    ctx.strokeRect(x, y, width, height);
    ctx.fillStyle = 'rgba(220,80,80,0.8)';
    ctx.font = '12px monospace';
    ctx.fillText('⚠ image error', x + 6, y + 16);
    ctx.restore();
    return;
  }
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
  }
}
