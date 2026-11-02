/**
 * Call recorder that turns the web's own geometry tests into fixture cases.
 *
 * `dump-fixtures.fixture.ts` swaps the function exports of a few `src/`
 * modules (draw_selection, shape_geometry, freehand_outline) for the
 * wrappers below through `vi.mock`, then imports the matching test files
 * inside a `describe('lift: <family>')` block. While such a test runs, every
 * call the test makes to a wrapped function is recorded with its named
 * arguments and its result. Calls made from inside another wrapped call (or
 * from any other module the test drives) are not cases of their own: only
 * the outermost call is, so each case replays one public function.
 *
 * This module imports nothing from `src/`, so the `vi.mock` factories can
 * load it without a cycle.
 */
import { snapshot } from './scene_codec';

export interface LiftedCall {
  readonly fn: string;
  readonly input: Record<string, unknown>;
  readonly output: unknown;
}

let active: LiftedCall[] | null = null;
/** > 0 while a wrapped function runs (nested calls are not cases). */
let depth = 0;

export function beginLift(): void {
  active = [];
}

export function endLift(): LiftedCall[] {
  const calls = active ?? [];
  active = null;
  return calls;
}

type AnyFn = (...args: never[]) => unknown;

/**
 * Wraps the functions named in `params` (export name to parameter names, in
 * order); other exports are passed through. Missing trailing arguments are
 * left out of the recorded input, as the JSON cannot carry `undefined`.
 */
export function recordingModule<M extends Record<string, unknown>>(
  real: M,
  params: Readonly<Record<string, ReadonlyArray<string>>>,
): M {
  const out: Record<string, unknown> = { ...real };
  for (const [name, names] of Object.entries(params)) {
    const fn = real[name];
    if (typeof fn !== 'function') {
      throw new Error(`lift: ${name} is not a function export`);
    }
    out[name] = (...args: unknown[]) => {
      const recording = active !== null && depth === 0;
      const input: Record<string, unknown> = {};
      if (recording) {
        if (args.length > names.length) {
          throw new Error(`lift: ${name} called with extra arguments`);
        }
        args.forEach((value, i) => {
          if (value !== undefined) input[names[i]!] = snapshot(value);
        });
      }
      depth++;
      let result: unknown;
      try {
        result = (fn as AnyFn)(...(args as never[]));
      } finally {
        depth--;
      }
      if (recording && active) {
        active.push({ fn: name, input, output: snapshot(result) });
      }
      return result;
    };
  }
  return out as M;
}

/** Parameter names of the wrapped draw_selection exports. */
export const DRAW_SELECTION_PARAMS: Readonly<
  Record<string, ReadonlyArray<string>>
> = {
  distToShapeBoundary: ['el', 'b', 'px', 'py'],
  getElementBorderPoint: ['el', 'targetX', 'targetY'],
  getNearestElementBorderPoint: ['el', 'px', 'py'],
  worldToAnchor: ['el', 'wx', 'wy'],
  anchorToWorld: ['el', 'anchor'],
  getElementPorts: ['el'],
  findConnectorSnapTarget: [
    'elements',
    'px',
    'py',
    'snapRadius',
    'portRadius',
    'ignoreId',
  ],
  findNearestElementSnapTarget: [
    'elements',
    'px',
    'py',
    'snapRadius',
    'ignoreId',
  ],
  resolveArrowEndpoints: ['el', 'allElements'],
  resolveConnectorRoute: ['el', 'allElements'],
  getElementBounds: ['el', 'allElements'],
  getElementCenter: ['el'],
  getRotationHandleScreen: ['elements', 'viewport', 'allElements'],
  hitTestEndpoint: ['el', 'viewport', 'screenX', 'screenY', 'allElements'],
  getSelectionHandles: ['elements', 'viewport'],
  hitTestHandle: ['handles', 'screenX', 'screenY', 'tolerance'],
};

/** Parameter names of the wrapped shape_geometry exports. */
export const SHAPE_GEOMETRY_PARAMS: Readonly<
  Record<string, ReadonlyArray<string>>
> = {
  flattenShapeCommands: ['commands'],
  getShapeOutlinePolygon: ['kind', 'w', 'h'],
  getShapeTextBox: ['kind', 'w', 'h'],
  getLabelWrapWidth: ['el', 'w', 'h'],
  getShapeBorderPointToward: ['kind', 'w', 'h', 'dx', 'dy'],
  getShapeNearestBorderPoint: ['kind', 'w', 'h', 'px', 'py'],
  getShapeDistToBoundary: ['kind', 'w', 'h', 'px', 'py'],
};

/** Parameter names of the wrapped freehand_outline exports. */
export const FREEHAND_OUTLINE_PARAMS: Readonly<
  Record<string, ReadonlyArray<string>>
> = {
  buildFreehandOutline: ['points', 'pressures', 'strokeWidth', 'options'],
};
