import type { Scene } from '../core/scene';
import { getSelectedElements } from '../core/scene';
import { worldToScreen } from '../core/viewport';
import { drawGrid } from './draw_grid';
import { drawElement } from './draw_element';
import { drawSelection } from './draw_selection';

export function render(
  ctx: CanvasRenderingContext2D,
  scene: Scene,
  canvas: HTMLCanvasElement,
  editingId?: string | null,
): void {
  const { viewport, appState } = scene;
  const { width, height } = canvas;
  const dpr = window.devicePixelRatio;

  ctx.resetTransform();
  ctx.clearRect(0, 0, width, height);

  const bg = getComputedStyle(document.documentElement).getPropertyValue('--canvas-bg').trim() || '#141414';
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);

  // Enable anti-aliasing for smooth curves
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  if (appState.gridVisible) {
    drawGrid(ctx, viewport, appState.gridSize, appState.gridType, width, height);
  }

  // World → canvas-pixel transform (all element coords are CSS pixels in world space)
  ctx.setTransform(
    viewport.zoom * dpr, 0,
    0, viewport.zoom * dpr,
    viewport.offsetX * dpr,
    viewport.offsetY * dpr
  );

  for (const el of scene.elements) {
    if (editingId && el.id === editingId) continue;
    if (el.visible === false) continue;
    drawElement(ctx, el, scene.elements);
  }

  // Draw a persistent subtle bounding box around all freehand elements
  // so the user can see section bounds even when not selected (e.g. while typing inside).
  ctx.resetTransform();
  ctx.scale(dpr, dpr);
  ctx.strokeStyle = 'rgba(120,180,255,0.5)';
  ctx.lineWidth = 1;
  ctx.setLineDash([5, 4]);
  for (const el of scene.elements) {
    if (el.type !== 'freehand' || el.visible === false) continue;
    if (scene.selectedIds.has(el.id)) continue; // selection already draws the box
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const [px, py] of el.points) {
      if (px < minX) minX = px; if (px > maxX) maxX = px;
      if (py < minY) minY = py; if (py > maxY) maxY = py;
    }
    const w = maxX - minX;
    const h = maxY - minY;
    if (w < 4 && h < 4) continue;
    const [sx, sy] = worldToScreen(viewport, minX, minY);
    const [ex, ey] = worldToScreen(viewport, maxX, maxY);
    ctx.strokeRect(sx - 1, sy - 1, ex - sx + 2, ey - sy + 2);
  }
  ctx.setLineDash([]);

  const selected = getSelectedElements(scene);
  if (selected.length > 0) {
    drawSelection(ctx, selected, viewport);
  }
}
