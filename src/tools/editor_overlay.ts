import type { Scene } from '../core/scene';
import { screenToWorld, type Viewport, worldToScreen } from '../core/viewport';

/**
 * Stacking order of the in-place text editors (textareas over the canvas).
 * Above `#workspace` (z-index 1), below every UI island: toolbar (10-20),
 * context panel (30), menus and dialogs. An editor must never cover the
 * panels used to style the text it edits.
 */
export const TEXT_EDITOR_Z_INDEX = '5';

/** The slice of the History API the overlay needs, so tests can stub it. */
export interface ViewportSource {
  readonly present: Pick<Scene, 'viewport'>;
  subscribe(listener: (scene: Pick<Scene, 'viewport'>) => void): () => void;
}

/** Screen placement of an editor for a given viewport. */
export interface EditorPlacement {
  left: number;
  top: number;
  scale: number;
}

/**
 * Where an editor opened at `anchorX/anchorY` (world units, its top-left
 * corner) under `openZoom` sits for `viewport`. The editor keeps the layout
 * it was built with at `openZoom`; a different zoom is applied as a scale,
 * so its own size math (offset size / openZoom on commit) stays valid.
 */
export function placeEditor(
  viewport: Viewport,
  anchorX: number,
  anchorY: number,
  openZoom: number,
  canvasLeft: number,
  canvasTop: number,
): EditorPlacement {
  const [x, y] = worldToScreen(viewport, anchorX, anchorY);
  return {
    left: x + canvasLeft,
    top: y + canvasTop,
    scale: viewport.zoom / openZoom,
  };
}

/**
 * Keeps a fixed-position editor glued to the canvas while it is open: on pan
 * or zoom it moves and scales with the scene instead of staying where it was
 * opened (issue #93). The anchor is read from the editor's current `left` and
 * `top`, so callers place the editor as before and then call this.
 *
 * @returns the unsubscribe function; call it when the editor closes.
 */
export function followViewport(
  editor: { style: CSSStyleDeclaration },
  source: ViewportSource,
  canvas: { getBoundingClientRect(): { left: number; top: number } },
): () => void {
  const open = source.present.viewport;
  const rect = canvas.getBoundingClientRect();
  const [anchorX, anchorY] = screenToWorld(
    open,
    parseFloat(editor.style.left) - rect.left,
    parseFloat(editor.style.top) - rect.top,
  );
  editor.style.transformOrigin = '0 0';

  let last = open;
  return source.subscribe((scene) => {
    const viewport = scene.viewport;
    if (viewport === last) return;
    last = viewport;
    const r = canvas.getBoundingClientRect();
    const p = placeEditor(viewport, anchorX, anchorY, open.zoom, r.left, r.top);
    editor.style.left = `${p.left}px`;
    editor.style.top = `${p.top}px`;
    editor.style.transform = p.scale === 1 ? '' : `scale(${p.scale})`;
  });
}
