/**
 * JSON encodings of the engine's in-memory structures (Scene, SceneChange)
 * shared by the reducer, history and live families. The descriptions below
 * are written into the family headers so the Swift side can decode them.
 */
import type { Scene } from '../../src/core/scene';
import { deepEqual, type SceneChange } from '../../src/engine/scene_diff';
import type { Json } from './common';

export const SCENE_ENCODING =
  'Scene as {elements, selectedIds, viewport, appState}: elements is the z-ordered element array (plain element objects, ' +
  'absent optional fields omitted); selectedIds is the Set as an array in insertion order (order is observable: SET_TOOL ' +
  'inherits the style of the first id, APPLY_STYLE bakes the ids in that order); viewport is {offsetX, offsetY, zoom}; ' +
  'appState carries every AppState field, lastCreatedId as null when unset. No other Scene fields exist.';

export const CHANGE_ENCODING =
  'SceneChange as {elements, order}: elements is the Map as an array in insertion order of ' +
  '{id, before, after, beforeIndex, afterIndex, fields}; before/after are elements or null; fields is the Map as an ' +
  'array in insertion order of {key, before, after}, where a missing before/after key means the field was absent ' +
  '(undefined) on that side; order is null or {before, after} id arrays.';

export interface EncodedScene {
  readonly elements: unknown[];
  readonly selectedIds: string[];
  readonly viewport: Json;
  readonly appState: Json;
}

/**
 * Throws when an object holds a key whose value is `undefined`: JSON cannot
 * carry it, yet `deepEqual` and `Object.keys` in the engine would see it, so
 * a fixture built from it would not replay faithfully.
 */
function assertNoUndefined(value: unknown, path: string): void {
  if (Array.isArray(value)) {
    value.forEach((item, i) => {
      assertNoUndefined(item, `${path}[${i}]`);
    });
  } else if (typeof value === 'object' && value !== null) {
    for (const [key, item] of Object.entries(value)) {
      if (item === undefined) {
        throw new Error(`${path}.${key} is undefined: not representable`);
      }
      assertNoUndefined(item, `${path}.${key}`);
    }
  }
}

/** Deep JSON-like snapshot (safe against later mutation by the caller). */
export function snapshot<T>(value: T): T {
  return structuredClone(value);
}

export function encodeScene(scene: Scene): EncodedScene {
  assertNoUndefined(scene.elements, 'scene.elements');
  return snapshot({
    elements: [...scene.elements],
    selectedIds: [...scene.selectedIds],
    viewport: { ...scene.viewport },
    appState: { ...scene.appState },
  }) as EncodedScene;
}

export function encodeChange(change: SceneChange): Json {
  return snapshot({
    elements: [...change.elements].map(([id, delta]) => ({
      id,
      before: delta.before,
      after: delta.after,
      beforeIndex: delta.beforeIndex,
      afterIndex: delta.afterIndex,
      fields: [...delta.fields].map(([key, field]) => ({
        key,
        ...(field.before !== undefined && { before: field.before }),
        ...(field.after !== undefined && { after: field.after }),
      })),
    })),
    order: change.order,
  });
}

/** Element arrays of two scenes are structurally equal, key order ignored. */
export function sameElements(a: Scene, b: Scene): boolean {
  return deepEqual(a.elements, b.elements);
}
