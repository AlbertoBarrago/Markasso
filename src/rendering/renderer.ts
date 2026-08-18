import type { Scene } from '../core/scene';
import { getSelectedElements } from '../core/scene';
import type { Element } from '../elements/element';
import { drawElement } from './draw_element';
import { drawGrid } from './draw_grid';
import { drawSelection, getElementBounds } from './draw_selection';
import { getCanvasBg } from './theme_cache';

// Elements whose (possibly rotated) bounds don't intersect the visible
// world rect are skipped entirely — no path generation, no text measuring.
// `pad` absorbs stroke width / shadow spread so thick-bordered shapes don't
// pop in/out right at the screen edge.
function isElementVisible(
  el: Element,
  allElements: ReadonlyArray<Element>,
  left: number,
  top: number,
  right: number,
  bottom: number,
): boolean {
  const b = getElementBounds(el, allElements);
  const pad =
    el.strokeWidth / 2 +
    (el.shadowBlur ?? 0) +
    Math.max(Math.abs(el.shadowOffsetX ?? 0), Math.abs(el.shadowOffsetY ?? 0)) +
    4;

  let minX = b.x;
  let minY = b.y;
  let maxX = b.x + b.w;
  let maxY = b.y + b.h;

  if (el.rotation) {
    const cx = b.x + b.w / 2;
    const cy = b.y + b.h / 2;
    const cos = Math.cos(el.rotation);
    const sin = Math.sin(el.rotation);
    minX = Infinity;
    minY = Infinity;
    maxX = -Infinity;
    maxY = -Infinity;
    const corners: [number, number][] = [
      [-b.w / 2, -b.h / 2],
      [b.w / 2, -b.h / 2],
      [b.w / 2, b.h / 2],
      [-b.w / 2, b.h / 2],
    ];
    for (const [dx, dy] of corners) {
      const rx = cx + dx * cos - dy * sin;
      const ry = cy + dx * sin + dy * cos;
      minX = Math.min(minX, rx);
      minY = Math.min(minY, ry);
      maxX = Math.max(maxX, rx);
      maxY = Math.max(maxY, ry);
    }
  }

  return (
    maxX + pad >= left &&
    minX - pad <= right &&
    maxY + pad >= top &&
    minY - pad <= bottom
  );
}

export function render(
  ctx: CanvasRenderingContext2D,
  scene: Scene,
  canvas: HTMLCanvasElement,
  editingId?: string | null,
  editingShapeLabelId?: string | null,
): void {
  const { viewport, appState } = scene;
  const { width, height } = canvas;
  const dpr = window.devicePixelRatio;

  ctx.resetTransform();
  ctx.clearRect(0, 0, width, height);

  ctx.fillStyle = getCanvasBg();
  ctx.fillRect(0, 0, width, height);

  // Enable anti-aliasing for smooth curves
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  if (appState.gridVisible) {
    drawGrid(
      ctx,
      viewport,
      appState.gridSize,
      appState.gridType,
      width,
      height,
    );
  }

  // World → canvas-pixel transform (all element coords are CSS pixels in world space)
  ctx.setTransform(
    viewport.zoom * dpr,
    0,
    0,
    viewport.zoom * dpr,
    viewport.offsetX * dpr,
    viewport.offsetY * dpr,
  );

  // Visible world rect, screen edges mapped back through the transform above.
  const cssW = width / dpr;
  const cssH = height / dpr;
  const visLeft = -viewport.offsetX / viewport.zoom;
  const visTop = -viewport.offsetY / viewport.zoom;
  const visRight = (cssW - viewport.offsetX) / viewport.zoom;
  const visBottom = (cssH - viewport.offsetY) / viewport.zoom;

  for (const el of scene.elements) {
    if (editingId && el.id === editingId) continue;
    if (el.visible === false) continue;
    if (
      !isElementVisible(
        el,
        scene.elements,
        visLeft,
        visTop,
        visRight,
        visBottom,
      )
    )
      continue;
    drawElement(ctx, el, scene.elements, editingShapeLabelId);
  }

  const selected = getSelectedElements(scene);
  if (selected.length > 0) {
    drawSelection(ctx, selected, viewport, scene.elements);
  }
}
