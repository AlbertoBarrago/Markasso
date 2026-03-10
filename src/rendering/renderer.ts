import type { Scene } from '../core/scene';
import { getSelectedElements } from '../core/scene';
import { drawGrid } from './draw_grid';
import { drawElement } from './draw_element';
import { drawSelection } from './draw_selection';

const CANVAS_BG = '#141414';

export function render(
  ctx: CanvasRenderingContext2D,
  scene: Scene,
  canvas: HTMLCanvasElement
): void {
  const { viewport, appState } = scene;
  const { width, height } = canvas;
  const dpr = window.devicePixelRatio;

  ctx.resetTransform();
  ctx.clearRect(0, 0, width, height);

  ctx.fillStyle = CANVAS_BG;
  ctx.fillRect(0, 0, width, height);

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
    drawElement(ctx, el);
  }

  const selected = getSelectedElements(scene);
  if (selected.length > 0) {
    drawSelection(ctx, selected, viewport);
  }
}
