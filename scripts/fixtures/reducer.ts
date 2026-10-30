/**
 * `reducer` family: `reducer(scene, command, isRemote)` for every command
 * type, local and remote, on small scenes, plus every reducer call made by
 * tests/reducer.test.ts (recorded, see recording.ts).
 */
import type { Command } from '../../src/commands/commands';
import type { Scene } from '../../src/core/scene';
import { reducer } from '../../src/engine/reducer';
import { Family } from './common';
import type { Session } from './recording';
import { makeScene, SAMPLE_NAMES, sample } from './samples';
import { encodeScene, SCENE_ENCODING } from './scene_codec';

/** Every Command type in src/commands/commands.ts (checked below). */
export const COMMAND_TYPES = [
  'CREATE_ELEMENT',
  'CREATE_ELEMENTS',
  'UPDATE_ELEMENT',
  'MOVE_ELEMENT',
  'MOVE_ELEMENTS',
  'RESIZE_ELEMENT',
  'DELETE_ELEMENTS',
  'PATCH_ELEMENTS',
  'EDIT_TEXT',
  'SET_SHAPE_LABEL',
  'SELECT_ELEMENTS',
  'CLEAR_SELECTION',
  'PAN_VIEWPORT',
  'ZOOM_VIEWPORT',
  'SET_VIEWPORT',
  'SET_TOOL',
  'SET_STROKE_COLOR',
  'SET_FILL_COLOR',
  'SET_STROKE_WIDTH',
  'SET_FONT_FAMILY',
  'SET_FONT_SIZE',
  'TOGGLE_GRID',
  'SET_GRID_TYPE',
  'SET_ROTATION',
  'SET_STROKE_STYLE',
  'REORDER_ELEMENTS',
  'TOGGLE_ELEMENT_VISIBILITY',
  'RENAME_LAYER',
  'LOAD_SCENE',
  'GROUP_ELEMENTS',
  'UNGROUP_ELEMENTS',
  'LOCK_ELEMENTS',
  'UNLOCK_ELEMENTS',
  'CLEAR_JUST_CREATED_TEXT',
  'SET_JUST_CREATED_TEXT',
  'SET_TOOL_LOCK',
  'SET_TEXT_MODE',
  'ALIGN_ELEMENTS',
  'APPLY_STYLE',
] as const satisfies ReadonlyArray<Command['type']>;

// Compile-time check that the list above is exhaustive.
type MissingCommand = Exclude<Command['type'], (typeof COMMAND_TYPES)[number]>;
const exhaustive: [MissingCommand] extends [never] ? true : MissingCommand =
  true;
void exhaustive;

/** The small scenes the commands run on. */
function scenes(): Record<string, Scene> {
  return {
    boxes: makeScene(
      [
        sample('rect'),
        sample('ellipse'),
        sample('rhombus'),
        sample('shape'),
        sample('arrow'),
        sample('line'),
      ],
      ['r'],
    ),
    icons: makeScene(
      [
        sample('icon'),
        sample('vendorIcon'),
        sample('image'),
        sample('text'),
        sample('note'),
      ],
      ['gi', 'vi'],
    ),
    paths: makeScene(
      [
        sample('curve'),
        sample('polygon'),
        sample('freehand'),
        sample('freeArrow'),
        sample('line', {
          startElementId: undefined,
          endElementId: undefined,
          startAnchor: undefined,
        }),
      ].map(dropUndefined),
      ['c', 'f'],
    ),
    texts: makeScene(
      [sample('text'), sample('note'), sample('rect')],
      ['t', 'n'],
    ),
    pair: makeScene([sample('rect'), sample('ellipse')], [], {
      lastCreatedId: 'e',
    }),
    reversed: makeScene(
      [sample('rect'), sample('ellipse'), sample('rhombus')],
      ['e', 'r'],
    ),
    grouped: makeScene(
      [
        sample('rect', { groupId: 'g1' }),
        sample('ellipse', { groupId: 'g1' }),
        sample('rhombus', { groupId: 'g2' }),
        sample('text', { locked: true, visible: false, layerName: 'Notes' }),
      ],
      ['r', 'e'],
    ),
    textTool: makeScene([sample('text'), sample('rect')], ['t'], {
      activeTool: 'text',
      fontSize: 36,
      strokeColor: '#ff0000',
      gridVisible: false,
      gridType: 'line',
      toolLocked: true,
      justCreatedText: true,
      textMode: 'code',
    }),
    zoomed: makeScene(
      [sample('rect'), sample('curve')],
      [],
      {},
      { offsetX: -250.5, offsetY: 120, zoom: 2.5 },
    ),
    empty: makeScene([]),
  };
}

function dropUndefined<T extends object>(el: T): T {
  return Object.fromEntries(
    Object.entries(el).filter(([, v]) => v !== undefined),
  ) as T;
}

/** [scene name, command, label] per variant; each runs local and remote. */
function variants(): Array<[string, Command, string]> {
  const v: Array<[string, Command, string]> = [];
  const add = (scene: string, command: Command, label = '') =>
    v.push([scene, command, label]);

  // CREATE_ELEMENT: one of every type, and the select flag.
  for (const name of SAMPLE_NAMES) {
    add(
      'pair',
      { type: 'CREATE_ELEMENT', element: sample(name, { id: `new-${name}` }) },
      name,
    );
  }
  add(
    'boxes',
    {
      type: 'CREATE_ELEMENT',
      element: sample('note', { id: 'x' }),
      select: true,
    },
    'select true',
  );
  add(
    'boxes',
    {
      type: 'CREATE_ELEMENT',
      element: sample('note', { id: 'x' }),
      select: false,
    },
    'select false',
  );
  add(
    'boxes',
    { type: 'CREATE_ELEMENT', element: sample('rect') },
    'duplicate id',
  );

  add(
    'pair',
    { type: 'CREATE_ELEMENTS', elements: [sample('curve'), sample('text')] },
    'two',
  );
  add('boxes', { type: 'CREATE_ELEMENTS', elements: [] }, 'none');
  add(
    'pair',
    { type: 'CREATE_ELEMENTS', elements: [sample('ellipse', { x: 9 })] },
    'duplicate id',
  );

  add(
    'boxes',
    {
      type: 'UPDATE_ELEMENT',
      id: 'r',
      props: { x: 5, label: 'X', rotation: 0.5 },
    },
    'fields',
  );
  add(
    'boxes',
    { type: 'UPDATE_ELEMENT', id: 'zz', props: { x: 5 } },
    'unknown id',
  );
  add(
    'boxes',
    { type: 'UPDATE_ELEMENT', id: 'r', props: { x: 0 } },
    'same value',
  );
  add(
    'boxes',
    {
      type: 'UPDATE_ELEMENT',
      id: 'a',
      props: { startElementId: 'e', startAnchor: { x: 0, y: 0.5 } },
    },
    'rebind',
  );
  add(
    'boxes',
    { type: 'UPDATE_ELEMENT', id: 'e', props: { type: 'rectangle' } as never },
    'type change',
  );
  add('boxes', { type: 'UPDATE_ELEMENT', id: 'r', props: {} }, 'empty props');

  for (const id of ['r', 'l', 'a', 'c', 'p', 'f', 't', 'gi', 'im']) {
    const scene = ['c', 'p', 'f'].includes(id)
      ? 'paths'
      : ['t', 'gi', 'im'].includes(id)
        ? 'icons'
        : 'boxes';
    add(scene, { type: 'MOVE_ELEMENT', id, dx: 12.5, dy: -7 }, id);
  }
  add(
    'paths',
    { type: 'MOVE_ELEMENT', id: 'l', dx: 3, dy: 4 },
    'line without cx',
  );
  add('boxes', { type: 'MOVE_ELEMENT', id: 'r', dx: 0, dy: 0 }, 'zero');
  add('boxes', { type: 'MOVE_ELEMENT', id: 'zz', dx: 1, dy: 0 }, 'unknown id');
  add('boxes', { type: 'MOVE_ELEMENT', id: 'r', dx: 0, dy: -0.1 }, 'dy only');

  add(
    'paths',
    {
      type: 'MOVE_ELEMENTS',
      ids: ['c', 'p', 'f', 'fa', 'l'],
      dx: -10,
      dy: 20.25,
    },
    'all',
  );
  add(
    'boxes',
    { type: 'MOVE_ELEMENTS', ids: ['r', 'zz'], dx: 5, dy: 5 },
    'with unknown',
  );
  add(
    'boxes',
    { type: 'MOVE_ELEMENTS', ids: ['zz'], dx: 5, dy: 5 },
    'only unknown',
  );
  add('boxes', { type: 'MOVE_ELEMENTS', ids: ['r'], dx: 0, dy: 0 }, 'zero');
  add('boxes', { type: 'MOVE_ELEMENTS', ids: [], dx: 5, dy: 0 }, 'no ids');

  add(
    'boxes',
    { type: 'RESIZE_ELEMENT', id: 'r', x: -10, y: -5, width: 200, height: 90 },
    'box',
  );
  add(
    'boxes',
    { type: 'RESIZE_ELEMENT', id: 's', width: -40, fontSize: 30 },
    'shape ignores fontSize',
  );
  add(
    'icons',
    { type: 'RESIZE_ELEMENT', id: 't', width: 320, height: 48, fontSize: 40 },
    'text fontSize',
  );
  add(
    'icons',
    { type: 'RESIZE_ELEMENT', id: 'im', x: 1, y: 2, width: 3, height: 4 },
    'image',
  );
  add(
    'paths',
    {
      type: 'RESIZE_ELEMENT',
      id: 'c',
      x: 1,
      y: 2,
      x2: 3,
      y2: 4,
      cx: 5,
      cy: 6,
      width: 99,
    },
    'curve',
  );
  add(
    'boxes',
    {
      type: 'RESIZE_ELEMENT',
      id: 'l',
      x2: 310,
      y2: 50,
      cx: 0,
      cy: 0,
      endElementId: 'd',
      endAnchor: { x: 0.5, y: 0 },
    },
    'line bind',
  );
  add(
    'boxes',
    {
      type: 'RESIZE_ELEMENT',
      id: 'l',
      startElementId: null,
      startAnchor: null,
      endElementId: null,
    },
    'line unbind',
  );
  add(
    'boxes',
    { type: 'RESIZE_ELEMENT', id: 'a', cx: 5, cy: 6, x: 70 },
    'arrow ignores cx',
  );
  add(
    'boxes',
    {
      type: 'RESIZE_ELEMENT',
      id: 'a',
      startElementId: null,
      endElementId: null,
    },
    'arrow unbind both',
  );
  add(
    'paths',
    {
      type: 'RESIZE_ELEMENT',
      id: 'f',
      points: [
        [0, 0],
        [1, 1],
      ],
      x: 0,
      y: 0,
      width: 4,
    },
    'freehand points',
  );
  add(
    'paths',
    {
      type: 'RESIZE_ELEMENT',
      id: 'p',
      points: [
        [1, 2],
        [3, 4],
        [5, 6],
        [7, 8],
      ],
    },
    'polygon points',
  );
  add('boxes', { type: 'RESIZE_ELEMENT', id: 'zz', width: 1 }, 'unknown id');
  add('boxes', { type: 'RESIZE_ELEMENT', id: 'r' }, 'no fields');

  add(
    'boxes',
    { type: 'DELETE_ELEMENTS', ids: ['r'] },
    'cascade both connectors',
  );
  add('boxes', { type: 'DELETE_ELEMENTS', ids: ['e'] }, 'cascade line');
  add('boxes', { type: 'DELETE_ELEMENTS', ids: ['a', 'l'] }, 'connectors only');
  add('boxes', { type: 'DELETE_ELEMENTS', ids: ['zz'] }, 'unknown');
  add('boxes', { type: 'DELETE_ELEMENTS', ids: [] }, 'none');
  add('icons', { type: 'DELETE_ELEMENTS', ids: ['vi', 'n'] }, 'selected');

  add('boxes', { type: 'PATCH_ELEMENTS' }, 'empty');
  add(
    'boxes',
    { type: 'PATCH_ELEMENTS', create: [], update: [], delete: [], order: [] },
    'empty lists',
  );
  add(
    'boxes',
    {
      type: 'PATCH_ELEMENTS',
      delete: ['r', 'zz'],
      update: [{ id: 'e', set: { x: 1, label: 'L' }, unset: ['strokeStyle'] }],
    },
    'delete and update',
  );
  add(
    'boxes',
    {
      type: 'PATCH_ELEMENTS',
      update: [
        {
          id: 'e',
          set: { id: 'q', type: 'rectangle', x: 2 } as never,
          unset: ['id', 'type', 'missing'],
        },
      ],
    },
    'identity fields ignored',
  );
  add(
    'boxes',
    { type: 'PATCH_ELEMENTS', update: [{ id: 'zz', set: { x: 1 } }] },
    'update unknown',
  );
  for (const index of [0, 2, 6, 99, -3]) {
    add(
      'boxes',
      { type: 'PATCH_ELEMENTS', create: [{ element: sample('text'), index }] },
      `create at ${index}`,
    );
  }
  add(
    'boxes',
    {
      type: 'PATCH_ELEMENTS',
      create: [{ element: sample('rect', { x: 999 }), index: 3 }],
    },
    'create existing id',
  );
  add(
    'boxes',
    {
      type: 'PATCH_ELEMENTS',
      create: [
        { element: sample('text'), index: 1 },
        { element: sample('note'), index: 1 },
      ],
    },
    'two creates same index',
  );
  add(
    'boxes',
    {
      type: 'PATCH_ELEMENTS',
      delete: ['r'],
      create: [{ element: sample('rect', { x: 7 }), index: 0 }],
    },
    'delete then recreate',
  );
  add(
    'boxes',
    { type: 'PATCH_ELEMENTS', order: ['l', 'a', 'r'] },
    'order subset',
  );
  add(
    'boxes',
    { type: 'PATCH_ELEMENTS', order: ['s', 'zz', 'r'] },
    'order with unknown',
  );
  add(
    'pair',
    { type: 'PATCH_ELEMENTS', delete: ['e'] },
    'delete lastCreatedId',
  );
  add('icons', { type: 'PATCH_ELEMENTS', delete: ['gi'] }, 'delete selected');

  add(
    'icons',
    { type: 'EDIT_TEXT', id: 't', content: 'Line one\nLine two' },
    'text',
  );
  add('icons', { type: 'EDIT_TEXT', id: 'n', content: '' }, 'note empty');
  add('boxes', { type: 'EDIT_TEXT', id: 'r', content: 'nope' }, 'non-text');
  add('boxes', { type: 'EDIT_TEXT', id: 'zz', content: 'nope' }, 'unknown');

  for (const id of ['r', 'e', 'd', 's', 'a', 'l']) {
    add(
      'boxes',
      {
        type: 'SET_SHAPE_LABEL',
        id,
        label: 'Label',
        labelFontSize: 18,
        labelFontFamily: 'Georgia, serif',
      },
      id,
    );
  }
  add(
    'icons',
    {
      type: 'SET_SHAPE_LABEL',
      id: 'gi',
      label: '',
      labelFontSize: 12,
      labelFontFamily: 'Arial',
    },
    'stencil',
  );
  add(
    'icons',
    {
      type: 'SET_SHAPE_LABEL',
      id: 't',
      label: 'x',
      labelFontSize: 12,
      labelFontFamily: 'Arial',
    },
    'text ignored',
  );
  add(
    'icons',
    {
      type: 'SET_SHAPE_LABEL',
      id: 'im',
      label: 'x',
      labelFontSize: 12,
      labelFontFamily: 'Arial',
    },
    'image ignored',
  );
  add(
    'paths',
    {
      type: 'SET_SHAPE_LABEL',
      id: 'c',
      label: 'x',
      labelFontSize: 12,
      labelFontFamily: 'Arial',
    },
    'curve ignored',
  );

  add('boxes', { type: 'SELECT_ELEMENTS', ids: ['e', 'r'] }, 'order kept');
  add('boxes', { type: 'SELECT_ELEMENTS', ids: [] }, 'none');
  add(
    'boxes',
    { type: 'SELECT_ELEMENTS', ids: ['zz', 'e', 'e'] },
    'unknown and duplicate',
  );
  add('pair', { type: 'SELECT_ELEMENTS', ids: ['r'] }, 'clears lastCreatedId');
  add('boxes', { type: 'CLEAR_SELECTION' }, 'selected');
  add('pair', { type: 'CLEAR_SELECTION' }, 'lastCreatedId');

  add('zoomed', { type: 'PAN_VIEWPORT', dx: 10.5, dy: -3 }, 'offset');
  add('zoomed', { type: 'PAN_VIEWPORT', dx: 0, dy: 0 }, 'zero');
  for (const [factor, ox, oy] of [
    [2, 400, 300],
    [0.5, 0, 0],
    [1.1, -50, 999],
    [1e-4, 100, 100],
    [1000, 100, 100],
    [1, 5, 5],
  ] as const) {
    add(
      'zoomed',
      { type: 'ZOOM_VIEWPORT', factor, originX: ox, originY: oy },
      `x${factor} at ${ox},${oy}`,
    );
  }
  add(
    'zoomed',
    { type: 'SET_VIEWPORT', offsetX: 1, offsetY: 2, zoom: 3 },
    'values',
  );
  add(
    'zoomed',
    { type: 'SET_VIEWPORT', offsetX: 0, offsetY: 0, zoom: 100 },
    'unclamped zoom',
  );

  for (const tool of [
    'rectangle',
    'select',
    'hand',
    'eraser',
    'text',
    'line',
    'freehand',
    'sticky',
    'rombo',
    'shape',
  ] as const) {
    add('boxes', { type: 'SET_TOOL', tool }, tool);
  }
  add(
    'boxes',
    { type: 'SET_TOOL', tool: 'ellipse', keepSelection: true },
    'keepSelection',
  );
  add(
    'boxes',
    { type: 'SET_TOOL', tool: 'shape', shapeKind: 'delay' },
    'shapeKind',
  );
  add(
    'reversed',
    { type: 'SET_TOOL', tool: 'rectangle' },
    'inherits first selected',
  );
  add('textTool', { type: 'SET_TOOL', tool: 'text' }, 'stays on text');
  add('textTool', { type: 'SET_TOOL', tool: 'select' }, 'leaves text');
  add(
    'textTool',
    { type: 'SET_TOOL', tool: 'rectangle', keepSelection: true },
    'leaves text keepSelection',
  );
  add('icons', { type: 'SET_TOOL', tool: 'line' }, 'from stencils');
  add('pair', { type: 'SET_TOOL', tool: 'line' }, 'no selection');

  add('boxes', { type: 'SET_STROKE_COLOR', color: '#ff0000' }, 'red');
  add('boxes', { type: 'SET_FILL_COLOR', color: '#00ff0080' }, 'alpha');
  add('boxes', { type: 'SET_STROKE_WIDTH', width: 4.5 }, 'width');

  add(
    'texts',
    { type: 'SET_FONT_FAMILY', family: '"Courier New", monospace' },
    'selected texts',
  );
  add(
    'boxes',
    { type: 'SET_FONT_FAMILY', family: 'Georgia, serif' },
    'non-text selection',
  );
  add('texts', { type: 'SET_FONT_SIZE', size: 28 }, 'size only');
  add(
    'texts',
    { type: 'SET_FONT_SIZE', size: 28, width: 300, height: 34 },
    'with bounds',
  );
  add('texts', { type: 'SET_FONT_SIZE', size: 12, height: 15 }, 'height only');
  add('boxes', { type: 'SET_FONT_SIZE', size: 40 }, 'non-text selection');

  add('boxes', { type: 'TOGGLE_GRID' }, 'visible');
  add('textTool', { type: 'TOGGLE_GRID' }, 'hidden');
  add('boxes', { type: 'SET_GRID_TYPE', gridType: 'mm' }, 'mm');

  add(
    'boxes',
    { type: 'SET_ROTATION', id: 'r', rotation: Math.PI / 4 },
    'rectangle',
  );
  add('boxes', { type: 'SET_ROTATION', id: 'l', rotation: -1 }, 'line');
  add(
    'icons',
    { type: 'SET_ROTATION', id: 'gi', rotation: 1 },
    'builtin stencil',
  );
  add(
    'icons',
    { type: 'SET_ROTATION', id: 'vi', rotation: 1 },
    'vendor stencil',
  );
  add('boxes', { type: 'SET_ROTATION', id: 'zz', rotation: 1 }, 'unknown');

  add('boxes', { type: 'SET_STROKE_STYLE', style: 'dotted' }, 'dotted');

  add(
    'boxes',
    { type: 'REORDER_ELEMENTS', ids: ['a'], targetIndex: 0 },
    'to back',
  );
  add(
    'boxes',
    { type: 'REORDER_ELEMENTS', ids: ['l', 'r'], targetIndex: 2 },
    'two in given order',
  );
  add(
    'boxes',
    { type: 'REORDER_ELEMENTS', ids: ['r'], targetIndex: 99 },
    'beyond end',
  );
  add(
    'boxes',
    { type: 'REORDER_ELEMENTS', ids: ['r'], targetIndex: -5 },
    'negative',
  );
  add(
    'boxes',
    { type: 'REORDER_ELEMENTS', ids: ['zz'], targetIndex: 0 },
    'unknown',
  );
  add(
    'boxes',
    { type: 'REORDER_ELEMENTS', ids: ['r', 'r'], targetIndex: 1 },
    'duplicate id',
  );
  add('boxes', { type: 'REORDER_ELEMENTS', ids: [], targetIndex: 0 }, 'none');

  add('boxes', { type: 'TOGGLE_ELEMENT_VISIBILITY', id: 'r' }, 'visible');
  add('grouped', { type: 'TOGGLE_ELEMENT_VISIBILITY', id: 't' }, 'hidden');
  add('boxes', { type: 'TOGGLE_ELEMENT_VISIBILITY', id: 'zz' }, 'unknown');
  add('boxes', { type: 'RENAME_LAYER', id: 'e', name: 'Database' }, 'name');
  add('grouped', { type: 'RENAME_LAYER', id: 't', name: '' }, 'empty');

  add(
    'boxes',
    {
      type: 'LOAD_SCENE',
      elements: [sample('note'), sample('curve')],
      viewport: { offsetX: 5, offsetY: 6, zoom: 0.5 },
    },
    'replace',
  );
  add(
    'pair',
    {
      type: 'LOAD_SCENE',
      elements: [],
      viewport: { offsetX: 0, offsetY: 0, zoom: 1 },
    },
    'empty keeps lastCreatedId',
  );

  add(
    'boxes',
    { type: 'GROUP_ELEMENTS', ids: ['r', 'e', 'zz'], groupId: 'g9' },
    'new group',
  );
  add(
    'grouped',
    { type: 'GROUP_ELEMENTS', ids: ['d'], groupId: 'g1' },
    'regroup',
  );
  add('grouped', { type: 'UNGROUP_ELEMENTS', groupId: 'g1' }, 'g1');
  add('grouped', { type: 'UNGROUP_ELEMENTS', groupId: 'none' }, 'unknown');
  add('boxes', { type: 'LOCK_ELEMENTS', ids: ['r', 'a'] }, 'two');
  add(
    'grouped',
    { type: 'UNLOCK_ELEMENTS', ids: ['t', 'r'] },
    'locked and unlocked',
  );

  add('textTool', { type: 'CLEAR_JUST_CREATED_TEXT' }, 'set');
  add('boxes', { type: 'SET_JUST_CREATED_TEXT' }, 'clear');
  add('boxes', { type: 'SET_TOOL_LOCK', locked: true }, 'lock');
  add('textTool', { type: 'SET_TOOL_LOCK', locked: false }, 'unlock');
  add('texts', { type: 'SET_TEXT_MODE', mode: 'code' }, 'code');
  add('textTool', { type: 'SET_TEXT_MODE', mode: 'text' }, 'text');
  add('boxes', { type: 'SET_TEXT_MODE', mode: 'code' }, 'non-text selection');

  add(
    'boxes',
    {
      type: 'ALIGN_ELEMENTS',
      moves: [
        { id: 'r', x: 50, y: 0 },
        { id: 'l', x: 0, y: 0 },
        { id: 'a', x: 60, y: 60 },
      ],
    },
    'mixed',
  );
  add(
    'paths',
    {
      type: 'ALIGN_ELEMENTS',
      moves: [
        { id: 'c', x: 10, y: 10 },
        { id: 'p', x: 0, y: 0 },
        { id: 'f', x: 500, y: 0 },
        { id: 'l', x: 1, y: 2 },
      ],
    },
    'paths',
  );
  add(
    'boxes',
    { type: 'ALIGN_ELEMENTS', moves: [{ id: 'r', x: 0, y: 0 }] },
    'already aligned',
  );
  add(
    'boxes',
    { type: 'ALIGN_ELEMENTS', moves: [{ id: 'zz', x: 1, y: 1 }] },
    'unknown',
  );
  add('boxes', { type: 'ALIGN_ELEMENTS', moves: [] }, 'none');

  const fullStyle = {
    strokeColor: '#e03131',
    fillColor: '#ffc9c9',
    labelColor: '#1971c2',
    strokeWidth: 3,
    opacity: 0.5,
    roughness: 2,
    strokeStyle: 'dashed',
    lineCap: 'square',
    lineJoin: 'bevel',
    shadowBlur: 4,
    shadowColor: '#00000080',
    shadowOffsetX: 2,
    shadowOffsetY: -2,
    cornerRadius: 12,
    textAlign: 'right',
    bold: true,
    italic: true,
    underline: false,
    strikethrough: true,
    arrowHead: 'both',
    shapeKind: 'document',
    routing: 'straight',
    startHeadStyle: 'diamond',
    endHeadStyle: 'diamondFilled',
  } as const;
  add(
    'boxes',
    { type: 'APPLY_STYLE', ids: ['r', 'e', 'd', 's', 'a', 'l'], ...fullStyle },
    'every field on boxes',
  );
  add(
    'icons',
    { type: 'APPLY_STYLE', ids: ['gi', 'vi', 'im', 't', 'n'], ...fullStyle },
    'every field on icons',
  );
  add(
    'paths',
    { type: 'APPLY_STYLE', ids: ['c', 'p', 'f', 'fa', 'l'], ...fullStyle },
    'every field on paths',
  );
  add('boxes', { type: 'APPLY_STYLE', strokeColor: '#123456' }, 'selection');
  add(
    'reversed',
    { type: 'APPLY_STYLE', fillColor: '#abcdef' },
    'selection two',
  );
  add(
    'pair',
    { type: 'APPLY_STYLE', strokeWidth: 6 },
    'lastCreatedId fallback',
  );
  add(
    'pair',
    { type: 'APPLY_STYLE', ids: [], strokeWidth: 6 },
    'explicit empty ids',
  );
  add(
    'boxes',
    { type: 'APPLY_STYLE', ids: ['zz'], opacity: 0.2 },
    'unknown id',
  );
  add(
    'boxes',
    { type: 'APPLY_STYLE', ids: ['s', 'r'], shapeKind: 'delay' },
    'shapeKind',
  );
  add(
    'boxes',
    {
      type: 'APPLY_STYLE',
      ids: ['a', 'l', 'r'],
      routing: 'elbow',
      startHeadStyle: 'triangleFilled',
      endHeadStyle: 'open',
    },
    'connector fields',
  );
  add(
    'icons',
    { type: 'APPLY_STYLE', ids: ['vi'], labelColor: '#ff0000', opacity: 0.3 },
    'vendor label color and opacity',
  );
  add(
    'icons',
    { type: 'APPLY_STYLE', ids: ['vi'], strokeColor: '#ff0000' },
    'vendor stroke ignored',
  );
  add(
    'textTool',
    { type: 'APPLY_STYLE', ids: ['t'], textAlign: 'center', bold: false },
    'text fields',
  );
  add('boxes', { type: 'APPLY_STYLE', ids: ['r'] }, 'no fields');
  return v;
}

export function buildReducer(lifted: ReadonlyArray<[string, Session]>): Family {
  const fam = new Family('reducer', { sceneEncoding: SCENE_ENCODING });
  const covered = new Set<string>();

  for (const [testName, session] of lifted) {
    const calls = session.reducerCalls;
    calls.forEach((call, i) => {
      const name =
        calls.length === 1
          ? `test: ${testName}`
          : `test: ${testName} #${i + 1}`;
      fam.add(name, 'reducer', call.input, call.output);
      covered.add(call.input.command.type);
    });
  }

  const all = scenes();
  for (const [sceneName, command, label] of variants()) {
    const scene = all[sceneName]!;
    for (const isRemote of [false, true]) {
      const next = reducer(scene, command, isRemote);
      fam.add(
        `${command.type}${label ? ` ${label}` : ''} on ${sceneName} ${isRemote ? 'remote' : 'local'}`,
        'reducer',
        { scene: encodeScene(scene), command, isRemote },
        { scene: encodeScene(next), unchanged: next === scene },
      );
      covered.add(command.type);
    }
  }
  const missing = COMMAND_TYPES.filter((type) => !covered.has(type));
  if (missing.length > 0) {
    throw new Error(`reducer: no case for ${missing.join(', ')}`);
  }
  return fam;
}
