import type { Element } from '../elements/element';
import type { Viewport } from '../core/viewport';
import { worldToScreen } from '../core/viewport';

const HANDLE_SIZE = 8;
const HANDLE_HALF = HANDLE_SIZE / 2;

export type HandlePosition =
  | 'nw' | 'n' | 'ne'
  | 'w'  |       'e'
  | 'sw' | 's' | 'se';

export interface Handle {
  position: HandlePosition;
  screenX: number;
  screenY: number;
}

export function getElementBounds(el: Element): { x: number; y: number; w: number; h: number } {
  switch (el.type) {
    case 'rectangle':
    case 'ellipse':
    case 'text': {
      const x = el.width < 0 ? el.x + el.width : el.x;
      const y = el.height < 0 ? el.y + el.height : el.y;
      return { x, y, w: Math.abs(el.width), h: Math.abs(el.height) };
    }
    case 'line':
    case 'arrow': {
      return {
        x: Math.min(el.x, el.x2),
        y: Math.min(el.y, el.y2),
        w: Math.abs(el.x2 - el.x),
        h: Math.abs(el.y2 - el.y),
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
  return getHandlePositions(sx, sy, ex, ey);
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
