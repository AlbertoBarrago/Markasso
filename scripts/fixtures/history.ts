/**
 * `history` family: scripted single-client `History` sequences (plus the
 * single-client traces recorded from tests/history.test.ts and the other
 * lifted test files), and the `scene_diff.ts` functions called directly.
 *
 * A History case is a trace: `input.steps[i]` is `{peer, op, args?}` and
 * `output.steps[i]` is the scene, canUndo, canRedo and the commands sent to
 * `onCommand` by that step. `op: "create"` constructs the instance with
 * `args.scene`. See recording.ts for how traces are captured.
 */
import type { Command } from '../../src/commands/commands';
import type { Scene } from '../../src/core/scene';
import { History } from '../../src/engine/history';
import { reducer } from '../../src/engine/reducer';
import {
  buildRevertPatch,
  composeChange,
  deepEqual,
  diffScenes,
  emptyChange,
  rebaseIndices,
  type SceneChange,
} from '../../src/engine/scene_diff';
import { Family } from './common';
import { beginSession, endSession, type Session, traceCase } from './recording';
import { makeScene, sample } from './samples';
import {
  CHANGE_ENCODING,
  encodeChange,
  encodeScene,
  SCENE_ENCODING,
} from './scene_codec';

export const TRACE_ENCODING =
  'History trace: input.steps[i] = {peer, op, args?} with op one of create (args.scene), dispatch (args.command), ' +
  'applyRemote (args.command), resetForLiveReplay (args.commands, args.keepViewport), beginDrag, endDrag, cancelDrag, ' +
  'undo, redo; peer indexes History instances in creation order. output.steps[i] = {scene, canUndo, canRedo, emitted}: ' +
  'the instance state after the step and the commands it passed to onCommand during the step (every dispatched ' +
  'command, ephemeral ones included, and undo/redo/cancel patches). Steps are in call-entry order; a step made from ' +
  'inside another instance step (a relay) never touches that instance, so sequential replay is exact.';

/** Records `run` as one trace case and returns the session. */
export function recordTrace(run: () => void): Session {
  beginSession();
  let session: Session | null = null;
  try {
    run();
  } finally {
    session = endSession();
  }
  if (!session || session.steps.length === 0) {
    throw new Error('History is not the recording wrapper (vi.mock missing?)');
  }
  return session;
}

function trace(fam: Family, name: string, run: () => void): void {
  const { input, output } = traceCase(recordTrace(run).steps);
  fam.add(name, 'History', input, output);
}

const MOVE_R: Command = { type: 'MOVE_ELEMENT', id: 'r', dx: 25, dy: -10 };

function threeBoxes(): Scene {
  return makeScene(
    [sample('rect'), sample('ellipse'), sample('rhombus'), sample('arrow')],
    ['r'],
  );
}

function scripts(fam: Family): void {
  trace(fam, 'move undo redo and empty stacks', () => {
    const h = new History(threeBoxes());
    h.dispatch(MOVE_R);
    h.undo();
    h.redo();
    h.undo();
    h.undo();
    h.redo();
    h.redo();
  });

  trace(fam, 'drag folds moves and a resize into one step', () => {
    const h = new History(threeBoxes());
    h.beginDrag();
    h.dispatch(MOVE_R);
    h.dispatch(MOVE_R);
    h.dispatch({ type: 'RESIZE_ELEMENT', id: 'r', width: 200, height: 10 });
    h.dispatch({ type: 'MOVE_ELEMENT', id: 'e', dx: 1, dy: 1 });
    h.endDrag();
    h.undo();
    h.redo();
  });

  trace(fam, 'no-op drag keeps the redo stack', () => {
    const h = new History(threeBoxes());
    h.dispatch(MOVE_R);
    h.undo();
    h.beginDrag();
    h.dispatch({ type: 'MOVE_ELEMENT', id: 'r', dx: 0, dy: 0 });
    h.endDrag();
    h.redo();
  });

  trace(fam, 'drag clears the redo stack once it changes something', () => {
    const h = new History(threeBoxes());
    h.dispatch(MOVE_R);
    h.undo();
    h.beginDrag();
    h.dispatch({ type: 'MOVE_ELEMENT', id: 'e', dx: 5, dy: 0 });
    h.endDrag();
    h.redo();
  });

  trace(fam, 'cancelDrag reverts and restores the selection', () => {
    const h = new History(threeBoxes());
    h.beginDrag();
    h.dispatch({ type: 'SELECT_ELEMENTS', ids: ['e', 'd'] });
    h.dispatch({ type: 'MOVE_ELEMENTS', ids: ['e', 'd'], dx: 40, dy: 0 });
    h.cancelDrag();
    h.undo();
  });

  trace(fam, 'cancelDrag of an untouched drag', () => {
    const h = new History(threeBoxes());
    h.dispatch(MOVE_R);
    h.undo();
    h.beginDrag();
    h.cancelDrag();
    h.redo();
  });

  trace(fam, 'undo during a drag cancels it', () => {
    const h = new History(threeBoxes());
    h.dispatch({ type: 'SET_ROTATION', id: 'e', rotation: 1 });
    h.beginDrag();
    h.dispatch(MOVE_R);
    h.undo();
    h.undo();
  });

  trace(fam, 'redo during a drag cancels it', () => {
    const h = new History(threeBoxes());
    h.dispatch({ type: 'SET_ROTATION', id: 'e', rotation: 1 });
    h.undo();
    h.beginDrag();
    h.dispatch(MOVE_R);
    h.redo();
    h.redo();
  });

  trace(fam, 'endDrag without beginDrag and beginDrag twice', () => {
    const h = new History(threeBoxes());
    h.endDrag();
    h.beginDrag();
    h.dispatch(MOVE_R);
    h.beginDrag();
    h.dispatch(MOVE_R);
    h.endDrag();
    h.endDrag();
    h.undo();
  });

  trace(fam, 'ephemeral commands are emitted but not undoable', () => {
    const h = new History(threeBoxes());
    h.dispatch({ type: 'PAN_VIEWPORT', dx: 10, dy: 5 });
    h.dispatch({ type: 'ZOOM_VIEWPORT', factor: 2, originX: 100, originY: 50 });
    h.dispatch({ type: 'SELECT_ELEMENTS', ids: ['e'] });
    h.dispatch({ type: 'SET_TOOL', tool: 'rectangle' });
    h.dispatch({ type: 'SET_STROKE_COLOR', color: '#ff0000' });
    h.dispatch({ type: 'TOGGLE_GRID' });
    h.dispatch({ type: 'SET_TOOL_LOCK', locked: true });
    h.undo();
  });

  trace(fam, 'unchanged dispatches emit nothing', () => {
    const h = new History(threeBoxes());
    h.dispatch({ type: 'MOVE_ELEMENT', id: 'r', dx: 0, dy: 0 });
    h.dispatch({ type: 'UPDATE_ELEMENT', id: 'zz', props: { x: 1 } });
    h.dispatch({ type: 'ALIGN_ELEMENTS', moves: [{ id: 'r', x: 0, y: 0 }] });
    h.dispatch({ type: 'PATCH_ELEMENTS' });
  });

  trace(
    fam,
    'a changed scene with no element change is an empty undo step',
    () => {
      const h = new History(threeBoxes());
      h.dispatch({ type: 'UPDATE_ELEMENT', id: 'r', props: { x: 0 } });
      h.dispatch({ type: 'SET_STROKE_STYLE', style: 'dotted' });
      h.undo();
      h.undo();
      h.redo();
    },
  );

  trace(fam, 'APPLY_STYLE bakes the selection in insertion order', () => {
    const h = new History(threeBoxes());
    h.dispatch({ type: 'SELECT_ELEMENTS', ids: ['e', 'r'] });
    h.dispatch({ type: 'APPLY_STYLE', strokeColor: '#e03131' });
    h.undo();
  });

  trace(fam, 'APPLY_STYLE bakes lastCreatedId without a selection', () => {
    const h = new History(threeBoxes());
    h.dispatch({
      type: 'CREATE_ELEMENT',
      element: sample('freehand'),
      select: false,
    });
    h.dispatch({ type: 'APPLY_STYLE', strokeWidth: 6 });
    h.undo();
    h.undo();
    h.dispatch({ type: 'APPLY_STYLE', strokeWidth: 8 });
  });

  trace(fam, 'APPLY_STYLE keeps explicit ids', () => {
    const h = new History(threeBoxes());
    h.dispatch({ type: 'APPLY_STYLE', ids: ['d'], opacity: 0.5 });
    h.dispatch({ type: 'CLEAR_SELECTION' });
    h.dispatch({ type: 'APPLY_STYLE', fillColor: '#ffffff' });
  });

  trace(fam, 'undo keeps a later remote edit of another field', () => {
    const h = new History(threeBoxes());
    h.dispatch(MOVE_R);
    h.applyRemote({ type: 'APPLY_STYLE', ids: ['r'], strokeColor: '#00ff00' });
    h.undo();
    h.redo();
  });

  trace(fam, 'undo skips a field a remote changed since', () => {
    const h = new History(threeBoxes());
    h.dispatch(MOVE_R);
    h.applyRemote({ type: 'MOVE_ELEMENT', id: 'r', dx: 5, dy: 0 });
    h.undo();
    h.redo();
  });

  trace(fam, 'remote reverts the field to my value before undo', () => {
    const h = new History(threeBoxes());
    h.dispatch({ type: 'UPDATE_ELEMENT', id: 'e', props: { label: 'mine' } });
    h.applyRemote({
      type: 'UPDATE_ELEMENT',
      id: 'e',
      props: { label: 'peer' },
    });
    h.applyRemote({
      type: 'UPDATE_ELEMENT',
      id: 'e',
      props: { label: 'mine' },
    });
    h.undo();
  });

  trace(fam, 'undo after a remote deleted the element', () => {
    const h = new History(threeBoxes());
    h.dispatch({
      type: 'SET_SHAPE_LABEL',
      id: 'd',
      label: 'Q',
      labelFontSize: 14,
      labelFontFamily: 'Arial',
    });
    h.applyRemote({ type: 'DELETE_ELEMENTS', ids: ['d'] });
    h.undo();
    h.redo();
  });

  trace(fam, 'undo of a delete restores cascaded connectors in place', () => {
    const h = new History(
      makeScene(
        [
          sample('rect'),
          sample('ellipse'),
          sample('line'),
          sample('rhombus'),
          sample('arrow'),
        ],
        ['r'],
      ),
    );
    h.dispatch({ type: 'DELETE_ELEMENTS', ids: ['r'] });
    h.undo();
    h.redo();
    h.undo();
  });

  trace(fam, 'undo of a creation a remote already deleted', () => {
    const h = new History(threeBoxes());
    h.dispatch({ type: 'CREATE_ELEMENT', element: sample('text') });
    h.applyRemote({ type: 'DELETE_ELEMENTS', ids: ['t'] });
    h.undo();
    h.redo();
  });

  trace(fam, 'erase drag restores original z positions', () => {
    const h = new History(
      makeScene([
        sample('rect'),
        sample('ellipse'),
        sample('rhombus'),
        sample('shape'),
        sample('note'),
      ]),
    );
    h.beginDrag();
    h.dispatch({ type: 'DELETE_ELEMENTS', ids: ['e'] });
    h.dispatch({ type: 'DELETE_ELEMENTS', ids: ['s'] });
    h.dispatch({ type: 'DELETE_ELEMENTS', ids: ['r'] });
    h.endDrag();
    h.undo();
    h.redo();
  });

  trace(fam, 'drawing drag creates then resizes in one step', () => {
    const h = new History(threeBoxes());
    h.beginDrag();
    h.dispatch({ type: 'CREATE_ELEMENT', element: sample('freeArrow') });
    h.dispatch({ type: 'RESIZE_ELEMENT', id: 'fa', x2: 0, y2: 0 });
    h.dispatch({
      type: 'RESIZE_ELEMENT',
      id: 'fa',
      x2: 40,
      y2: 10,
      endElementId: 'r',
    });
    h.endDrag();
    h.undo();
    h.redo();
  });

  trace(fam, 'drag with a remote edit in the middle', () => {
    const h = new History(threeBoxes());
    h.beginDrag();
    h.dispatch(MOVE_R);
    h.applyRemote({
      type: 'APPLY_STYLE',
      ids: ['r', 'e'],
      fillColor: '#000000',
    });
    h.applyRemote({ type: 'CREATE_ELEMENT', element: sample('text') });
    h.dispatch(MOVE_R);
    h.endDrag();
    h.undo();
    h.redo();
  });

  trace(fam, 'cancelDrag keeps a remote edit made during the drag', () => {
    const h = new History(threeBoxes());
    h.beginDrag();
    h.dispatch(MOVE_R);
    h.applyRemote({ type: 'RENAME_LAYER', id: 'r', name: 'peer' });
    h.cancelDrag();
  });

  trace(fam, 'reorder undo leaves a remote insert in place', () => {
    const h = new History(threeBoxes());
    h.dispatch({ type: 'REORDER_ELEMENTS', ids: ['r'], targetIndex: 3 });
    h.applyRemote({ type: 'CREATE_ELEMENT', element: sample('text') });
    h.undo();
    h.redo();
  });

  trace(fam, 'reorder undo skipped after a remote reorder', () => {
    const h = new History(threeBoxes());
    h.dispatch({ type: 'REORDER_ELEMENTS', ids: ['r'], targetIndex: 3 });
    h.applyRemote({ type: 'REORDER_ELEMENTS', ids: ['e'], targetIndex: 0 });
    h.undo();
  });

  trace(fam, 'undo unsets a field the step added', () => {
    const h = new History(threeBoxes());
    h.dispatch({
      type: 'UPDATE_ELEMENT',
      id: 'r',
      props: { rotation: 1, layerName: 'Top' },
    });
    h.dispatch({ type: 'GROUP_ELEMENTS', ids: ['r', 'e'], groupId: 'g' });
    h.dispatch({ type: 'UNGROUP_ELEMENTS', groupId: 'g' });
    h.undo();
    h.undo();
    h.undo();
    h.redo();
  });

  trace(
    fam,
    'undo restores per-user appState but keeps tool, view and grid',
    () => {
      const h = new History(
        makeScene([sample('text'), sample('note')], ['t'], {
          activeTool: 'text',
        }),
      );
      h.dispatch({ type: 'SET_FONT_SIZE', size: 32, width: 300, height: 40 });
      h.dispatch({ type: 'SET_FONT_FAMILY', family: 'Georgia, serif' });
      h.dispatch({
        type: 'APPLY_STYLE',
        strokeColor: '#ff0000',
        textAlign: 'center',
        opacity: 0.5,
      });
      h.dispatch({ type: 'SET_TOOL', tool: 'hand' });
      h.dispatch({ type: 'SET_VIEWPORT', offsetX: 50, offsetY: 25, zoom: 2 });
      h.dispatch({ type: 'TOGGLE_GRID' });
      h.undo();
      h.undo();
      h.undo();
      h.redo();
    },
  );

  trace(fam, 'undo of a creation clears lastCreatedId and selection', () => {
    const h = new History(threeBoxes());
    h.dispatch({
      type: 'CREATE_ELEMENT',
      element: sample('curve'),
      select: false,
    });
    h.undo();
    h.dispatch({ type: 'CREATE_ELEMENT', element: sample('polygon') });
    h.undo();
    h.redo();
  });

  trace(fam, 'LOAD_SCENE undo and redo', () => {
    const h = new History(threeBoxes());
    h.dispatch({
      type: 'LOAD_SCENE',
      elements: [sample('note'), sample('image')],
      viewport: { offsetX: 10, offsetY: 20, zoom: 0.5 },
    });
    h.undo();
    h.redo();
  });

  trace(fam, 'new dispatch clears the redo stack', () => {
    const h = new History(threeBoxes());
    h.dispatch(MOVE_R);
    h.dispatch({ type: 'EDIT_TEXT', id: 'zz', content: 'x' });
    h.undo();
    h.undo();
    h.dispatch({ type: 'LOCK_ELEMENTS', ids: ['e'] });
    h.redo();
  });

  trace(fam, 'several undos then redo all', () => {
    const h = new History(makeScene([]));
    h.dispatch({ type: 'CREATE_ELEMENT', element: sample('rect') });
    h.dispatch({ type: 'CREATE_ELEMENT', element: sample('ellipse') });
    h.dispatch({ type: 'CREATE_ELEMENT', element: sample('line') });
    h.dispatch({ type: 'MOVE_ELEMENTS', ids: ['r', 'e', 'l'], dx: 10, dy: 10 });
    h.dispatch({ type: 'TOGGLE_ELEMENT_VISIBILITY', id: 'e' });
    for (let i = 0; i < 6; i++) h.undo();
    for (let i = 0; i < 6; i++) h.redo();
  });

  trace(fam, 'applyRemote of an unchanged command', () => {
    const h = new History(threeBoxes());
    h.dispatch(MOVE_R);
    h.applyRemote({ type: 'MOVE_ELEMENT', id: 'zz', dx: 1, dy: 1 });
    h.applyRemote({ type: 'SET_FONT_SIZE', size: 50 });
    h.undo();
  });

  trace(fam, 'resetForLiveReplay keeps the viewport and clears stacks', () => {
    const h = new History(
      makeScene(
        [sample('rect')],
        ['r'],
        {},
        { offsetX: 7, offsetY: 8, zoom: 3 },
      ),
    );
    h.dispatch(MOVE_R);
    h.undo();
    h.dispatch({ type: 'SET_TOOL', tool: 'hand' });
    h.beginDrag();
    h.dispatch({ type: 'MOVE_ELEMENT', id: 'r', dx: 1, dy: 1 });
    h.resetForLiveReplay([
      { type: 'CREATE_ELEMENT', element: sample('ellipse') },
      { type: 'APPLY_STYLE', ids: ['e'], strokeColor: '#ff0000' },
      { type: 'SELECT_ELEMENTS', ids: ['e'] },
    ]);
    h.endDrag();
    h.undo();
  });

  trace(fam, 'resetForLiveReplay with a fresh viewport', () => {
    const h = new History(
      makeScene([sample('rect')], [], {}, { offsetX: 7, offsetY: 8, zoom: 3 }),
    );
    h.resetForLiveReplay(
      [{ type: 'CREATE_ELEMENT', element: sample('note') }],
      false,
    );
    h.resetForLiveReplay([]);
  });
}

// ── scene_diff ────────────────────────────────────────────────────────────────

function edit(scene: Scene, ...commands: Command[]): Scene {
  let next = scene;
  for (const command of commands) next = reducer(next, command);
  return next;
}

function sceneDiff(fam: Family): void {
  const base = makeScene([
    sample('rect'),
    sample('ellipse'),
    sample('rhombus'),
    sample('line'),
    sample('freehand'),
  ]);
  const pairs: Array<[string, Scene, Scene]> = [
    ['same scene', base, base],
    ['equal copies', base, makeScene(base.elements)],
    [
      'view only',
      base,
      { ...base, viewport: { offsetX: 1, offsetY: 1, zoom: 2 } },
    ],
    ['field change', base, edit(base, MOVE_R)],
    [
      'nested arrays moved',
      base,
      edit(base, { type: 'MOVE_ELEMENT', id: 'f', dx: 1, dy: 0 }),
    ],
    [
      'field added',
      base,
      edit(base, { type: 'SET_ROTATION', id: 'e', rotation: 2 }),
    ],
    [
      'field removed',
      base,
      edit(base, {
        type: 'RESIZE_ELEMENT',
        id: 'l',
        startElementId: null,
        startAnchor: null,
      }),
    ],
    [
      'create',
      base,
      edit(base, { type: 'CREATE_ELEMENT', element: sample('text') }),
    ],
    [
      'delete with cascade',
      base,
      edit(base, { type: 'DELETE_ELEMENTS', ids: ['r'] }),
    ],
    [
      'reorder',
      base,
      edit(base, { type: 'REORDER_ELEMENTS', ids: ['f', 'e'], targetIndex: 0 }),
    ],
    [
      'create delete reorder and update',
      base,
      edit(
        base,
        { type: 'DELETE_ELEMENTS', ids: ['d'] },
        { type: 'CREATE_ELEMENT', element: sample('note') },
        { type: 'REORDER_ELEMENTS', ids: ['l'], targetIndex: 0 },
        { type: 'UPDATE_ELEMENT', id: 'e', props: { label: 'x' } },
      ),
    ],
    [
      'equal points different arrays',
      base,
      edit(base, { type: 'RESIZE_ELEMENT', id: 'f', points: SAMPLE_POINTS }),
    ],
  ];
  for (const [label, prev, next] of pairs) {
    fam.add(
      `diffScenes ${label}`,
      'diffScenes',
      { prev: encodeScene(prev), next: encodeScene(next) },
      encodeChange(diffScenes(prev, next)),
    );
  }

  // composeChange: fold a second step into the first.
  const s1 = edit(base, MOVE_R);
  const composeCases: Array<[string, Scene, Scene, Scene]> = [
    ['two moves', base, s1, edit(s1, MOVE_R)],
    [
      'move then back',
      base,
      s1,
      edit(s1, { type: 'MOVE_ELEMENT', id: 'r', dx: -25, dy: 10 }),
    ],
    [
      'create then modify',
      base,
      edit(base, { type: 'CREATE_ELEMENT', element: sample('text') }),
      edit(
        base,
        { type: 'CREATE_ELEMENT', element: sample('text') },
        { type: 'EDIT_TEXT', id: 't', content: 'x' },
      ),
    ],
    [
      'modify then delete',
      base,
      s1,
      edit(s1, { type: 'DELETE_ELEMENTS', ids: ['r'] }),
    ],
    [
      'two reorders',
      base,
      edit(base, { type: 'REORDER_ELEMENTS', ids: ['r'], targetIndex: 4 }),
      edit(
        base,
        { type: 'REORDER_ELEMENTS', ids: ['r'], targetIndex: 4 },
        { type: 'REORDER_ELEMENTS', ids: ['e'], targetIndex: 0 },
      ),
    ],
    [
      'different elements',
      base,
      s1,
      edit(s1, { type: 'SET_ROTATION', id: 'd', rotation: 1 }),
    ],
    ['empty then step', base, base, s1],
  ];
  for (const [label, a, b, c] of composeCases) {
    const into = diffScenes(a, b);
    const step = diffScenes(b, c);
    const input = { into: encodeChange(into), step: encodeChange(step) };
    composeChange(into, step);
    fam.add(
      `composeChange ${label}`,
      'composeChange',
      input,
      encodeChange(into),
    );
  }

  // rebaseIndices after a composed erase.
  {
    const e1 = edit(base, { type: 'DELETE_ELEMENTS', ids: ['e'] });
    const e2 = edit(e1, { type: 'DELETE_ELEMENTS', ids: ['d'] });
    const e3 = edit(e2, { type: 'CREATE_ELEMENT', element: sample('note') });
    const change = diffScenes(base, e1);
    composeChange(change, diffScenes(e1, e2));
    composeChange(change, diffScenes(e2, e3));
    const input = {
      change: encodeChange(change),
      before: encodeScene(base),
      after: encodeScene(e3),
    };
    rebaseIndices(change, base, e3);
    fam.add(
      'rebaseIndices composed erase and create',
      'rebaseIndices',
      input,
      encodeChange(change),
    );
    const empty = emptyChange();
    rebaseIndices(empty, base, e3);
    fam.add(
      'rebaseIndices empty change',
      'rebaseIndices',
      {
        change: encodeChange(emptyChange()),
        before: encodeScene(base),
        after: encodeScene(e3),
      },
      encodeChange(empty),
    );
  }

  // buildRevertPatch against clean and concurrently edited scenes.
  const revert = (label: string, change: SceneChange, current: Scene) => {
    for (const direction of ['undo', 'redo'] as const) {
      fam.add(
        `buildRevertPatch ${label} ${direction}`,
        'buildRevertPatch',
        {
          change: encodeChange(change),
          current: encodeScene(current),
          direction,
        },
        buildRevertPatch(change, current, direction),
      );
    }
  };
  const moved = edit(base, MOVE_R);
  const moveChange = diffScenes(base, moved);
  revert('move on after', moveChange, moved);
  revert('move on before', moveChange, base);
  revert(
    'move after peer moved',
    moveChange,
    edit(moved, { type: 'MOVE_ELEMENT', id: 'r', dx: 1, dy: 0 }),
  );
  revert(
    'move after peer recolor',
    moveChange,
    edit(moved, { type: 'APPLY_STYLE', ids: ['r'], strokeColor: '#f00' }),
  );
  revert(
    'move after peer delete',
    moveChange,
    edit(moved, { type: 'DELETE_ELEMENTS', ids: ['r'] }),
  );
  const added = edit(base, { type: 'SET_ROTATION', id: 'e', rotation: 2 });
  revert('field added on after', diffScenes(base, added), added);
  const created = edit(base, {
    type: 'CREATE_ELEMENT',
    element: sample('text'),
  });
  revert('create on after', diffScenes(base, created), created);
  revert('create on before', diffScenes(base, created), base);
  const deleted = edit(base, { type: 'DELETE_ELEMENTS', ids: ['r', 'd'] });
  revert('cascade delete on after', diffScenes(base, deleted), deleted);
  revert(
    'cascade delete with peer insert',
    diffScenes(base, deleted),
    edit(deleted, { type: 'CREATE_ELEMENT', element: sample('note') }),
  );
  const reordered = edit(base, {
    type: 'REORDER_ELEMENTS',
    ids: ['f'],
    targetIndex: 0,
  });
  revert('reorder on after', diffScenes(base, reordered), reordered);
  revert(
    'reorder after peer reorder',
    diffScenes(base, reordered),
    edit(reordered, { type: 'REORDER_ELEMENTS', ids: ['e'], targetIndex: 0 }),
  );
  revert(
    'reorder after peer insert',
    diffScenes(base, reordered),
    edit(reordered, { type: 'CREATE_ELEMENT', element: sample('note') }),
  );
  revert('empty change', emptyChange(), base);

  // deepEqual on JSON-like values.
  const eq: Array<[string, unknown, unknown]> = [
    ['equal numbers', 1, 1],
    ['different numbers', 1, 2],
    ['NaN and NaN', Number.NaN, Number.NaN],
    ['equal strings', 'a', 'a'],
    ['number and string', 1, '1'],
    ['null and null', null, null],
    ['null and object', null, {}],
    ['empty objects', {}, {}],
    ['empty array and object', [], {}],
    ['equal nested', { a: [1, { b: 2 }] }, { a: [1, { b: 2 }] }],
    ['key order ignored', { a: 1, b: 2 }, { b: 2, a: 1 }],
    ['extra key', { a: 1 }, { a: 1, b: 2 }],
    ['different arrays', [1, 2], [2, 1]],
    ['array length', [1], [1, 1]],
    [
      'point arrays',
      [
        [0, 0],
        [1, 1],
      ],
      [
        [0, 0],
        [1, 1],
      ],
    ],
    ['true and 1', true, 1],
  ];
  for (const [label, a, b] of eq) {
    fam.add(`deepEqual ${label}`, 'deepEqual', { a, b }, deepEqual(a, b));
  }
}

const SAMPLE_POINTS: ReadonlyArray<readonly [number, number]> = [
  [500, 600],
  [510, 612.5],
  [527.25, 618],
];

export function buildHistory(lifted: ReadonlyArray<[string, Session]>): Family {
  const fam = new Family('history', {
    sceneEncoding: SCENE_ENCODING,
    changeEncoding: CHANGE_ENCODING,
    traceEncoding: TRACE_ENCODING,
  });
  for (const [testName, session] of lifted) {
    const { input, output } = traceCase(session.steps);
    fam.add(`test: ${testName}`, 'History', input, output);
  }
  scripts(fam);
  sceneDiff(fam);
  return fam;
}
