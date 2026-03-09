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
