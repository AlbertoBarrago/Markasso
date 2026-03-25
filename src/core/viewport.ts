import type { Element } from '../elements/element';

export interface Viewport {
  readonly offsetX: number;
  readonly offsetY: number;
  readonly zoom: number;
}

export function createViewport(): Viewport {
  return { offsetX: 0, offsetY: 0, zoom: 1 };
}

export function screenToWorld(
  viewport: Viewport,
  screenX: number,
  screenY: number
): [number, number] {
  return [
    (screenX - viewport.offsetX) / viewport.zoom,
    (screenY - viewport.offsetY) / viewport.zoom,
  ];
}

export function worldToScreen(
  viewport: Viewport,
  worldX: number,
  worldY: number
): [number, number] {
  return [
    worldX * viewport.zoom + viewport.offsetX,
    worldY * viewport.zoom + viewport.offsetY,
  ];
}

export function pan(viewport: Viewport, dx: number, dy: number): Viewport {
  return {
    ...viewport,
    offsetX: viewport.offsetX + dx,
    offsetY: viewport.offsetY + dy,
  };
}

export function fitToElements(
  elements: ReadonlyArray<Element>,
  canvasWidth: number,
  canvasHeight: number,
  padding = 40,
): Viewport {
  if (elements.length === 0) return createViewport();

  let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;

  for (const el of elements) {
    if (el.type === 'rectangle' || el.type === 'ellipse' || el.type === 'text') {
      const x1 = Math.min(el.x, el.x + el.width);
      const y1 = Math.min(el.y, el.y + el.height);
      const x2 = Math.max(el.x, el.x + el.width);
      const y2 = Math.max(el.y, el.y + el.height);
      left = Math.min(left, x1); top = Math.min(top, y1);
      right = Math.max(right, x2); bottom = Math.max(bottom, y2);
    } else if (el.type === 'line' || el.type === 'arrow') {
      left = Math.min(left, el.x, el.x2); top = Math.min(top, el.y, el.y2);
      right = Math.max(right, el.x, el.x2); bottom = Math.max(bottom, el.y, el.y2);
    } else if (el.type === 'freehand') {
      for (const [px, py] of el.points) {
        left = Math.min(left, px); top = Math.min(top, py);
        right = Math.max(right, px); bottom = Math.max(bottom, py);
      }
    }
  }

  const bbW = Math.max(right - left, 1);
  const bbH = Math.max(bottom - top, 1);
  const newZoom = Math.min(Math.max(
    Math.min((canvasWidth - 2 * padding) / bbW, (canvasHeight - 2 * padding) / bbH),
    0.05,
  ), 30);
  const offsetX = canvasWidth / 2 - (left + bbW / 2) * newZoom;
  const offsetY = canvasHeight / 2 - (top + bbH / 2) * newZoom;
  return { zoom: newZoom, offsetX, offsetY };
}

export function zoom(
  viewport: Viewport,
  factor: number,
  originX: number,
  originY: number
): Viewport {
  const newZoom = Math.min(Math.max(viewport.zoom * factor, 0.05), 30);
  const actualFactor = newZoom / viewport.zoom;
  return {
    zoom: newZoom,
    offsetX: originX - (originX - viewport.offsetX) * actualFactor,
    offsetY: originY - (originY - viewport.offsetY) * actualFactor,
  };
}
