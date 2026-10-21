import type { StencilSource } from '../elements/element';
import { createStencil } from '../elements/stencils/registry';
import type { History } from '../engine/history';

/**
 * Inserts a stencil at the center of the visible canvas (or at a given
 * world point, e.g. a drop position) with the current default style.
 */
export function insertStencil(
  history: History,
  source: StencilSource,
  label: string,
  at?: { readonly x: number; readonly y: number },
): void {
  const { viewport, appState } = history.present;
  const cx =
    at?.x ?? (window.innerWidth / 2 - viewport.offsetX) / viewport.zoom;
  const cy =
    at?.y ?? (window.innerHeight / 2 - viewport.offsetY) / viewport.zoom;
  history.dispatch({
    type: 'CREATE_ELEMENT',
    element: createStencil(
      crypto.randomUUID(),
      source,
      cx,
      cy,
      {
        strokeColor: appState.strokeColor,
        fillColor: appState.fillColor,
        strokeWidth: appState.strokeWidth,
        opacity: appState.opacity,
        roughness: appState.roughness,
      },
      label,
    ),
  });
}
