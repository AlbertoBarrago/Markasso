import type { Element } from '../elements/element';
import type { Viewport } from '../core/viewport';
import { worldToScreen } from '../core/viewport';

/**
 * Returns the point on the border of an element in the direction from its center toward (targetX, targetY).
 * For ellipses uses the true ellipse boundary; for all others uses the bounding rectangle.
 */
export function getElementBorderPoint(
  el: Element,
  targetX: number,
  targetY: number,
): [number, number] {
  const b = getElementBounds(el);
  const cx = b.x + b.w / 2;
  const cy = b.y + b.h / 2;
  const dx = targetX - cx;
  const dy = targetY - cy;

  if (Math.abs(dx) < 0.001 && Math.abs(dy) < 0.001) return [cx, b.y]; // fallback: top-center

  if (el.type === 'ellipse') {
    const angle = Math.atan2(dy, dx);
    return [cx + (b.w / 2) * Math.cos(angle), cy + (b.h / 2) * Math.sin(angle)];
  }

  // Rectangle / text / image / freehand — axis-aligned border intersection
  const hw = b.w / 2;
  const hh = b.h / 2;
  const t = Math.min(
    Math.abs(dx) > 0.001 ? hw / Math.abs(dx) : Infinity,
    Math.abs(dy) > 0.001 ? hh / Math.abs(dy) : Infinity,
  );
  return [cx + dx * t, cy + dy * t];
}

/**
 * Resolves the effective endpoints of a line/arrow element,
 * snapping to the border of connected elements (facing each other).
 */
export function resolveArrowEndpoints(
  el: { x: number; y: number; x2: number; y2: number; startElementId?: string; endElementId?: string },
  allElements: ReadonlyArray<Element>,
): { x: number; y: number; x2: number; y2: number } {
  let { x, y, x2, y2 } = el;

  const startEl = el.startElementId ? (allElements.find((e) => e.id === el.startElementId) ?? null) : null;
  const endEl   = el.endElementId   ? (allElements.find((e) => e.id === el.endElementId)   ?? null) : null;

  // Effective centers used for direction computation
  const startB = startEl ? getElementBounds(startEl) : null;
  const endB   = endEl   ? getElementBounds(endEl)   : null;
  const startCx = startB ? startB.x + startB.w / 2 : x;
  const startCy = startB ? startB.y + startB.h / 2 : y;
  const endCx   = endB   ? endB.x   + endB.w   / 2 : x2;
  const endCy   = endB   ? endB.y   + endB.h   / 2 : y2;

  // Border point of start element facing toward end
  if (startEl) [x, y]   = getElementBorderPoint(startEl, endCx, endCy);
  // Border point of end element facing toward start
  if (endEl)   [x2, y2] = getElementBorderPoint(endEl, startCx, startCy);

  return { x, y, x2, y2 };
}

/** Draws a cyan snap indicator circle at the given world-space position. */
export function drawSnapIndicator(
  ctx: CanvasRenderingContext2D,
  worldX: number,
  worldY: number,
  viewport: Viewport,
): void {
  ctx.save();
  ctx.resetTransform();
  ctx.scale(window.devicePixelRatio, window.devicePixelRatio);

  const [sx, sy] = worldToScreen(viewport, worldX, worldY);
  ctx.strokeStyle = 'cyan';
  ctx.lineWidth = 2;
  ctx.setLineDash([4, 3]);
  ctx.beginPath();
  ctx.arc(sx, sy, 16, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.restore();
}

const HANDLE_SIZE = 8;
const HANDLE_HALF = HANDLE_SIZE / 2;

export const ROTATION_HANDLE_R = 7;
export const ROTATION_HANDLE_OFFSET = 34;

export type HandlePosition =
  | 'nw' | 'n' | 'ne'
  | 'w'  |       'e'
  | 'sw' | 's' | 'se';

export interface Handle {
  position: HandlePosition;
  screenX: number;
  screenY: number;
}

export function getElementBounds(el: Element, allElements?: ReadonlyArray<Element>): { x: number; y: number; w: number; h: number } {
  switch (el.type) {
    case 'rectangle':
    case 'ellipse':
    case 'text':
    case 'image': {
      const x = el.width < 0 ? el.x + el.width : el.x;
      const y = el.height < 0 ? el.y + el.height : el.y;
      return { x, y, w: Math.abs(el.width), h: Math.abs(el.height) };
    }
    case 'line':
    case 'arrow': {
      const pts = allElements ? resolveArrowEndpoints(el, allElements) : el;
      return {
        x: Math.min(pts.x, pts.x2),
        y: Math.min(pts.y, pts.y2),
        w: Math.abs(pts.x2 - pts.x),
        h: Math.abs(pts.y2 - pts.y),
      };
    }
    case 'freehand': {
      if (el.points.length === 0) return { x: el.x, y: el.y, w: 0, h: 0 };
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const [px, py] of el.points) {
        minX = Math.min(minX, px);
        minY = Math.min(minY, py);
        maxX = Math.max(maxX, px);
        maxY = Math.max(maxY, py);
      }
      return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
    }
  }
}

/** Returns the world-space center of any element. */
export function getElementCenter(el: Element): [number, number] {
  const { x, y, w, h } = getElementBounds(el);
  return [x + w / 2, y + h / 2];
}

/** Returns the screen-space position of the rotation handle for the given selection, or null. */
export function getRotationHandleScreen(
  elements: ReadonlyArray<Element>,
  viewport: Viewport,
): { screenX: number; screenY: number } | null {
  if (elements.length === 0) return null;

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const el of elements) {
    const { x, y, w, h } = getElementBounds(el);
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x + w);
    maxY = Math.max(maxY, y + h);
  }

  const [, sy] = worldToScreen(viewport, minX, minY);
  const mx = (worldToScreen(viewport, minX, minY)[0] + worldToScreen(viewport, maxX, maxY)[0]) / 2;

  // For a single rotated element, rotate the handle position around the element center
  const rotation = elements.length === 1 ? (elements[0]!.rotation ?? 0) : 0;
  if (rotation) {
    const [cx, cy] = getElementCenter(elements[0]!);
    const [scx, scy] = worldToScreen(viewport, cx, cy);
    const dx = mx - scx;
    const dy = sy - ROTATION_HANDLE_OFFSET - scy;
    const cos = Math.cos(rotation);
    const sin = Math.sin(rotation);
    return {
      screenX: scx + dx * cos - dy * sin,
      screenY: scy + dx * sin + dy * cos,
    };
  }

  return { screenX: mx, screenY: sy - ROTATION_HANDLE_OFFSET };
}

/**
 * Hit-test whether a screen point is on one of the endpoints of a line/arrow.
 * Returns 'start', 'end', or null.
 */
export function hitTestEndpoint(
  el: Element,
  viewport: Viewport,
  screenX: number,
  screenY: number,
  allElements?: ReadonlyArray<Element>,
): 'start' | 'end' | null {
  if (el.type !== 'line' && el.type !== 'arrow') return null;
  const R = 5 + 4; // handle radius + tolerance

  const pts = allElements ? resolveArrowEndpoints(el, allElements) : el;
  const [sx1, sy1] = worldToScreen(viewport, pts.x, pts.y);
  const [sx2, sy2] = worldToScreen(viewport, pts.x2, pts.y2);

  if (Math.hypot(screenX - sx1, screenY - sy1) <= R) return 'start';
  if (Math.hypot(screenX - sx2, screenY - sy2) <= R) return 'end';
  return null;
}

export function drawSelection(
  ctx: CanvasRenderingContext2D,
  elements: ReadonlyArray<Element>,
  viewport: Viewport
): void {
  if (elements.length === 0) return;

  ctx.save();
  ctx.resetTransform();
  ctx.scale(window.devicePixelRatio, window.devicePixelRatio);

  // Compute union bounding box in world space
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const el of elements) {
    const { x, y, w, h } = getElementBounds(el);
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x + w);
    maxY = Math.max(maxY, y + h);
  }

  // For a single rotated element, rotate the entire selection in screen space
  const rotation = elements.length === 1 ? (elements[0]!.rotation ?? 0) : 0;
  if (rotation) {
    const [cx, cy] = getElementCenter(elements[0]!);
    const [scx, scy] = worldToScreen(viewport, cx, cy);
    ctx.translate(scx, scy);
    ctx.rotate(rotation);
    ctx.translate(-scx, -scy);
  }

  const [sx, sy] = worldToScreen(viewport, minX, minY);
  const [ex, ey] = worldToScreen(viewport, maxX, maxY);

  // Dashed selection rectangle — light blue works on dark canvas
  ctx.strokeStyle = 'rgba(120,180,255,0.8)';
  ctx.lineWidth = 1.5;
  ctx.setLineDash([6, 3]);
  ctx.strokeRect(sx - 1, sy - 1, ex - sx + 2, ey - sy + 2);
  ctx.setLineDash([]);

  // Resize handles
  const handles = getHandlePositions(sx, sy, ex, ey);
  ctx.fillStyle = '#1c1c2a';
  ctx.strokeStyle = 'rgba(120,180,255,0.9)';
  ctx.lineWidth = 1.5;

  for (const h of handles) {
    ctx.fillRect(h.screenX - HANDLE_HALF, h.screenY - HANDLE_HALF, HANDLE_SIZE, HANDLE_SIZE);
    ctx.strokeRect(h.screenX - HANDLE_HALF, h.screenY - HANDLE_HALF, HANDLE_SIZE, HANDLE_SIZE);
  }

  // Rotation handle — connector line + circle with ↻ arc indicator
  const mx = (sx + ex) / 2;
  const rotHandleY = sy - ROTATION_HANDLE_OFFSET;

  // Connector line from top-center of box to rotation handle
  ctx.strokeStyle = 'rgba(120,180,255,0.5)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(mx, sy - 1);
  ctx.lineTo(mx, rotHandleY + ROTATION_HANDLE_R);
  ctx.stroke();

  // Rotation handle circle
  ctx.strokeStyle = 'rgba(120,180,255,0.9)';
  ctx.fillStyle = '#1c1c2a';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(mx, rotHandleY, ROTATION_HANDLE_R, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // ↻ arc indicator inside circle (partial arc with arrowhead)
  const arcR = ROTATION_HANDLE_R - 2.5;
  const arcStart = -0.7 * Math.PI;
  const arcEnd = 0.5 * Math.PI;
  ctx.strokeStyle = 'rgba(120,180,255,0.9)';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.arc(mx, rotHandleY, arcR, arcStart, arcEnd);
  ctx.stroke();

  // Small filled arrowhead at end of arc
  const arrowAngle = arcEnd + Math.PI / 2;
  const arrowTipX = mx + arcR * Math.cos(arcEnd);
  const arrowTipY = rotHandleY + arcR * Math.sin(arcEnd);
  const ah = 3;
  ctx.fillStyle = 'rgba(120,180,255,0.9)';
  ctx.beginPath();
  ctx.moveTo(arrowTipX, arrowTipY);
  ctx.lineTo(
    arrowTipX - ah * Math.cos(arrowAngle - Math.PI / 6),
    arrowTipY - ah * Math.sin(arrowAngle - Math.PI / 6),
  );
  ctx.lineTo(
    arrowTipX - ah * Math.cos(arrowAngle + Math.PI / 6),
    arrowTipY - ah * Math.sin(arrowAngle + Math.PI / 6),
  );
  ctx.closePath();
  ctx.fill();

  // Endpoint handles for single line/arrow selection (drawn on top of bounding box handles)
  if (elements.length === 1) {
    const el = elements[0]!;
    if (el.type === 'line' || el.type === 'arrow') {
      const pts = resolveArrowEndpoints(el, elements);
      const [x1s, y1s] = worldToScreen(viewport, pts.x, pts.y);
      const [x2s, y2s] = worldToScreen(viewport, pts.x2, pts.y2);

      ctx.fillStyle = 'cyan';
      ctx.strokeStyle = '#1c1c2a';
      ctx.lineWidth = 1.5;

      ctx.beginPath();
      ctx.arc(x1s, y1s, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(x2s, y2s, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
  }

  ctx.restore();
}

/** Draws a faint highlight border around a hovered (but not selected) element. */
export function drawHoverHighlight(
  ctx: CanvasRenderingContext2D,
  element: Element,
  viewport: Viewport,
): void {
  ctx.save();
  ctx.resetTransform();
  ctx.scale(window.devicePixelRatio, window.devicePixelRatio);

  const { x, y, w, h } = getElementBounds(element);
  const [sx, sy] = worldToScreen(viewport, x, y);
  const [ex, ey] = worldToScreen(viewport, x + w, y + h);

  const rotation = element.rotation ?? 0;
  if (rotation) {
    const [cx, cy] = getElementCenter(element);
    const [scx, scy] = worldToScreen(viewport, cx, cy);
    ctx.translate(scx, scy);
    ctx.rotate(rotation);
    ctx.translate(-scx, -scy);
  }

  ctx.strokeStyle = 'rgba(120, 180, 255, 0.45)';
  ctx.lineWidth = 1.5;
  ctx.setLineDash([]);
  ctx.strokeRect(sx - 2, sy - 2, ex - sx + 4, ey - sy + 4);

  ctx.restore();
}

export function drawMarquee(
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number
): void {
  ctx.save();
  ctx.resetTransform();
  ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
  ctx.strokeStyle = 'rgba(120,180,255,0.7)';
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 2]);
  ctx.fillStyle = 'rgba(120, 180, 255, 0.06)';
  const x = Math.min(x1, x2);
  const y = Math.min(y1, y2);
  const w = Math.abs(x2 - x1);
  const h = Math.abs(y2 - y1);
  ctx.fillRect(x, y, w, h);
  ctx.strokeRect(x, y, w, h);
  ctx.setLineDash([]);
  ctx.restore();
}

function getHandlePositions(sx: number, sy: number, ex: number, ey: number): Handle[] {
  const mx = (sx + ex) / 2;
  const my = (sy + ey) / 2;
  return [
    { position: 'nw', screenX: sx, screenY: sy },
    { position: 'n',  screenX: mx, screenY: sy },
    { position: 'ne', screenX: ex, screenY: sy },
    { position: 'w',  screenX: sx, screenY: my },
    { position: 'e',  screenX: ex, screenY: my },
    { position: 'sw', screenX: sx, screenY: ey },
    { position: 's',  screenX: mx, screenY: ey },
    { position: 'se', screenX: ex, screenY: ey },
  ];
}

/** Computes the 8 handle positions for the current selection in CSS-pixel screen space. */
export function getSelectionHandles(
  elements: ReadonlyArray<Element>,
  viewport: Viewport,
): Handle[] {
  if (elements.length === 0) return [];
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const el of elements) {
    const { x, y, w, h } = getElementBounds(el);
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x + w);
    maxY = Math.max(maxY, y + h);
  }
  const [sx, sy] = worldToScreen(viewport, minX, minY);
  const [ex, ey] = worldToScreen(viewport, maxX, maxY);
  const handles = getHandlePositions(sx, sy, ex, ey);

  // Rotate handle positions for a single rotated element
  const rotation = elements.length === 1 ? (elements[0]!.rotation ?? 0) : 0;
  if (rotation) {
    const [cx, cy] = getElementCenter(elements[0]!);
    const [scx, scy] = worldToScreen(viewport, cx, cy);
    const cos = Math.cos(rotation);
    const sin = Math.sin(rotation);
    for (const h of handles) {
      const dx = h.screenX - scx;
      const dy = h.screenY - scy;
      h.screenX = scx + dx * cos - dy * sin;
      h.screenY = scy + dx * sin + dy * cos;
    }
  }

  return handles;
}

export function hitTestHandle(
  handles: Handle[],
  screenX: number,
  screenY: number
): HandlePosition | null {
  for (const h of handles) {
    if (
      screenX >= h.screenX - HANDLE_HALF - 2 &&
      screenX <= h.screenX + HANDLE_HALF + 2 &&
      screenY >= h.screenY - HANDLE_HALF - 2 &&
      screenY <= h.screenY + HANDLE_HALF + 2
    ) {
      return h.position;
    }
  }
  return null;
}
