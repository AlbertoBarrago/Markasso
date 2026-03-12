import type { Element } from '../elements/element';
import { createViewport, type Viewport } from './viewport';
import { createAppState, type AppState } from './app_state';

export interface Scene {
  readonly elements: ReadonlyArray<Element>;
  readonly selectedIds: ReadonlySet<string>;
  readonly viewport: Viewport;
  readonly appState: AppState;
}

export function createScene(): Scene {
  return {
    elements: [],
    selectedIds: new Set(),
    viewport: createViewport(),
    appState: createAppState(),
  };
}
export function getSelectedElements(scene: Scene): ReadonlyArray<Element> {
  return scene.elements.filter((el) => scene.selectedIds.has(el.id));
}
