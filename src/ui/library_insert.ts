import type {
  ShapeElement,
  ShapeKind,
  StencilSource,
} from '../elements/element';
import { createStencil } from '../elements/stencils/registry';
import type { History } from '../engine/history';

/** Default box of a flowchart shape inserted from the library. */
const SHAPE_INSERT_WIDTH = 160;
const SHAPE_INSERT_HEIGHT = 80;

type WorldPoint = { readonly x: number; readonly y: number };

/** Center of the visible canvas in world coordinates. */
function viewCenter(history: History): WorldPoint {
  const { viewport } = history.present;
  return {
    x: (window.innerWidth / 2 - viewport.offsetX) / viewport.zoom,
    y: (window.innerHeight / 2 - viewport.offsetY) / viewport.zoom,
  };
}

function currentStyle(history: History) {
  const { appState } = history.present;
  return {
    strokeColor: appState.strokeColor,
    fillColor: appState.fillColor,
    strokeWidth: appState.strokeWidth,
    opacity: appState.opacity,
    roughness: appState.roughness,
  };
}

/**
 * Inserts a stencil centered on `at` (a drop position) or on the center of
 * the visible canvas, with the current default style.
 */
export function insertStencil(
  history: History,
  source: StencilSource,
  label: string,
  at?: WorldPoint,
): void {
  const { x, y } = at ?? viewCenter(history);
  history.dispatch({
    type: 'CREATE_ELEMENT',
    element: createStencil(
      crypto.randomUUID(),
      source,
      x,
      y,
      currentStyle(history),
      label,
    ),
  });
}

/** Inserts a flowchart shape, like `insertStencil`. */
export function insertShape(
  history: History,
  kind: ShapeKind,
  at?: WorldPoint,
): void {
  const { x, y } = at ?? viewCenter(history);
  const element: ShapeElement = {
    id: crypto.randomUUID(),
    type: 'shape',
    kind,
    x: x - SHAPE_INSERT_WIDTH / 2,
    y: y - SHAPE_INSERT_HEIGHT / 2,
    width: SHAPE_INSERT_WIDTH,
    height: SHAPE_INSERT_HEIGHT,
    ...currentStyle(history),
  };
  history.dispatch({ type: 'CREATE_ELEMENT', element });
}
