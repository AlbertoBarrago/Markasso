/**
 * `selection` family: the exported geometry of src/rendering/draw_selection.ts
 * (bounds, border points, anchors, ports, snap targets, handles, rotation
 * handle, endpoint hits) and the geometric helpers of src/tools/select_tool.ts
 * (`hitTest`, `computeResize`, `anchorX`, `anchorY`, and the private
 * alignment guides read back from a SelectTool drag). Every element type,
 * rotated and not, bound and unbound connectors. `resolveArrowEndpoints` and
 * `resolveConnectorRoute` live in the `connectors` family and are only
 * repeated here when a lifted test calls them.
 *
 * Inputs carry the TS parameter names. Cases named `test: ...` are calls
 * recorded from tests/draw_selection.test.ts (scripts/fixtures/lift.ts).
 */
import type { Viewport } from '../../src/core/viewport';
import type { ConnectorAnchor, Element } from '../../src/elements/element';
import { SHAPE_KINDS } from '../../src/elements/element';
import { History } from '../../src/engine/history';
import {
  anchorToWorld,
  distToShapeBoundary,
  findConnectorSnapTarget,
  findNearestElementSnapTarget,
  getElementBorderPoint,
  getElementBounds,
  getElementCenter,
  getElementPorts,
  getNearestElementBorderPoint,
  getRotationHandleScreen,
  getSelectionHandles,
  type HandlePosition,
  hitTestEndpoint,
  hitTestHandle,
  worldToAnchor,
} from '../../src/rendering/draw_selection';
import {
  anchorX,
  anchorY,
  computeResize,
  hitTest,
  SelectTool,
} from '../../src/tools/select_tool';
import type { ToolContext } from '../../src/tools/tool';
import { Family, prng } from './common';
import type { LiftedCall } from './lift';
import { makeScene, SAMPLE_NAMES, type SampleName, sample } from './samples';

export const HANDLES: ReadonlyArray<HandlePosition> = [
  'nw',
  'n',
  'ne',
  'w',
  'e',
  'sw',
  's',
  'se',
];

const ROTATIONS: ReadonlyArray<[string, number]> = [
  ['rot 0.5', 0.5],
  ['rot pi/2', Math.PI / 2],
  ['rot -1.2', -1.2],
];

const VIEWPORTS: ReadonlyArray<[string, Viewport]> = [
  ['default', { offsetX: 0, offsetY: 0, zoom: 1 }],
  ['zoom 2 offset', { offsetX: 120, offsetY: -40, zoom: 2 }],
  ['zoom 0.5 offset', { offsetX: -75.5, offsetY: 33, zoom: 0.5 }],
];

const ANCHORS: ReadonlyArray<[string, ConnectorAnchor]> = [
  ['center', { x: 0.5, y: 0.5 }],
  ['top', { x: 0.5, y: 0 }],
  ['right', { x: 1, y: 0.5 }],
  ['corner', { x: 1, y: 1 }],
  ['quarter', { x: 0.25, y: 0 }],
  ['interior', { x: 0.3, y: 0.6 }],
];

/** Scene with every sample: the bound line and arrow find their targets. */
function sampleScene(): Element[] {
  return SAMPLE_NAMES.map((name) => sample(name));
}

/** Element variants: every sample, rotated copies and extra shapes. */
function variants(): Array<[string, Element]> {
  const out: Array<[string, Element]> = [];
  for (const name of SAMPLE_NAMES) {
    out.push([name, sample(name)]);
    for (const [label, rotation] of ROTATIONS) {
      out.push([`${name} ${label}`, sample(name, { rotation })]);
    }
  }
  out.push([
    'rect negative size',
    sample('rect', { x: 200, y: 100, width: -80, height: -50 }),
  ]);
  out.push([
    'rect negative size rot 0.5',
    sample('rect', { x: 200, y: 100, width: -80, height: -50, rotation: 0.5 }),
  ]);
  out.push(['rect zero size', sample('rect', { width: 0, height: 0 })]);
  out.push(['ellipse flat', sample('ellipse', { width: 120, height: 0.0005 })]);
  out.push([
    'icon two-line label',
    sample('icon', { label: 'Primary database cluster west' }),
  ]);
  out.push(['icon no label', sample('icon', { label: undefined })]);
  out.push([
    'straight line bent',
    sample('line', {
      startElementId: undefined,
      endElementId: undefined,
      startAnchor: undefined,
    }),
  ]);
  out.push([
    'line straight no cp',
    sample('line', {
      cx: undefined,
      cy: undefined,
      startElementId: undefined,
      endElementId: undefined,
      startAnchor: undefined,
    }),
  ]);
  out.push(['freehand empty', sample('freehand', { points: [] })]);
  for (const kind of SHAPE_KINDS) {
    out.push([`shape ${kind}`, sample('shape', { kind })]);
    out.push([
      `shape ${kind} rot 0.5`,
      sample('shape', { kind, rotation: 0.5 }),
    ]);
    out.push([
      `shape ${kind} wide`,
      sample('shape', { kind, width: 240, height: 60 }),
    ]);
  }
  return out;
}

function clean(el: Element): Element {
  return JSON.parse(JSON.stringify(el)) as Element;
}

/** Hit-test probes: just inside and just outside each edge, and the center. */
function hitProbes(el: Element): Array<[number, number]> {
  const b = getElementBounds(el);
  const pts: Array<[number, number]> = [];
  for (const fx of [-0.06, 0.03, 0.5, 0.97, 1.06]) {
    for (const fy of [-0.06, 0.5, 1.06]) {
      pts.push([b.x + b.w * fx, b.y + b.h * fy]);
    }
  }
  return pts;
}

/** Points around an element's bounds: inside, on the edges, outside. */
function probePoints(el: Element): Array<[number, number]> {
  const b = getElementBounds(el);
  const pts: Array<[number, number]> = [];
  for (const fx of [-0.25, 0, 0.1, 0.5, 1, 1.25]) {
    for (const fy of [-0.25, 0, 0.5, 1, 1.25]) {
      pts.push([b.x + b.w * fx, b.y + b.h * fy]);
    }
  }
  return pts;
}

function makeToolCtx(history: History): ToolContext {
  return {
    history,
    canvas: {
      getBoundingClientRect: () => ({ left: 0, top: 0 }) as DOMRect,
    } as HTMLCanvasElement,
  };
}

/**
 * Alignment guides as the SelectTool computes them after a move: a press on
 * the first selected element and a zero-length drag (MOVE_ELEMENTS by 0, 0)
 * leave the scene unchanged and expose `alignGuides`.
 */
export function alignGuidesFor(
  elements: ReadonlyArray<Element>,
  selectedIds: ReadonlyArray<string>,
  zoom: number,
): Array<{ axis: 'x' | 'y'; worldPos: number }> {
  const history = new History(
    makeScene(elements, selectedIds, {}, { offsetX: 0, offsetY: 0, zoom }),
  );
  const ctx = makeToolCtx(history);
  const tool = new SelectTool();
  const first = elements.find((el) => el.id === selectedIds[0])!;
  const [wx, wy] = getElementCenter(first);
  const ev = {
    clientX: wx * zoom,
    clientY: wy * zoom,
    shiftKey: false,
    altKey: false,
    preventDefault: () => {},
  } as unknown as MouseEvent;
  tool.onMouseDown(ev, wx, wy, ctx);
  const selected = [...history.present.selectedIds];
  if (JSON.stringify(selected) !== JSON.stringify(selectedIds)) {
    throw new Error('alignGuidesFor: press changed the selection');
  }
  tool.onMouseMove(ev, wx, wy, ctx);
  const guides = tool.alignGuides.map((g) => ({ ...g }));
  tool.onMouseUp(ev, wx, wy, ctx);
  if (JSON.stringify(history.present.elements) !== JSON.stringify(elements)) {
    throw new Error('alignGuidesFor: drag moved the elements');
  }
  return guides;
}

export function buildSelection(lifted: ReadonlyArray<[string, LiftedCall[]]>) {
  const fam = new Family('selection', {
    inputs:
      'TS parameter names. Elements are plain element objects; viewport is {offsetX, offsetY, zoom}; ' +
      'screen coordinates are CSS pixels relative to the canvas.',
    alignGuides:
      'fn alignGuides is SelectTool.computeAlignGuides (private): {elements, selectedIds, zoom} -> the guides ' +
      'the tool exposes after a move of the selection, in push order.',
  });

  // Lifted test calls first, deduplicated on (fn, input).
  const seen = new Set<string>();
  for (const [testName, calls] of lifted) {
    calls.forEach((call, i) => {
      const key = JSON.stringify([call.fn, call.input]);
      if (seen.has(key)) return;
      seen.add(key);
      fam.add(`test: ${testName} #${i}`, call.fn, call.input, call.output);
    });
  }

  const scene = sampleScene();
  const all = variants();

  for (const [label, el] of all) {
    const e = clean(el);
    fam.add(
      `bounds ${label}`,
      'getElementBounds',
      { el: e },
      getElementBounds(e),
    );
    fam.add(
      `bounds in scene ${label}`,
      'getElementBounds',
      { el: e, allElements: scene },
      getElementBounds(e, scene),
    );
    fam.add(
      `center ${label}`,
      'getElementCenter',
      { el: e },
      getElementCenter(e),
    );
    fam.add(`ports ${label}`, 'getElementPorts', { el: e }, getElementPorts(e));

    const b = getElementBounds(e);
    const cx = b.x + b.w / 2;
    const cy = b.y + b.h / 2;
    const reach = Math.max(b.w, b.h, 10) * 1.5;
    for (let k = 0; k < 16; k++) {
      const angle = (k / 16) * Math.PI * 2 + 0.1;
      const targetX = cx + Math.cos(angle) * reach;
      const targetY = cy + Math.sin(angle) * reach;
      fam.add(
        `border point ${label} dir ${k}`,
        'getElementBorderPoint',
        { el: e, targetX, targetY },
        getElementBorderPoint(e, targetX, targetY),
      );
    }
    fam.add(
      `border point ${label} at center`,
      'getElementBorderPoint',
      { el: e, targetX: cx, targetY: cy },
      getElementBorderPoint(e, cx, cy),
    );

    probePoints(e).forEach(([px, py], i) => {
      fam.add(
        `nearest border ${label} #${i}`,
        'getNearestElementBorderPoint',
        { el: e, px, py },
        getNearestElementBorderPoint(e, px, py),
      );
      fam.add(
        `dist to boundary ${label} #${i}`,
        'distToShapeBoundary',
        { el: e, b, px, py },
        distToShapeBoundary(e, b, px, py),
      );
      if (i % 3 === 0) {
        fam.add(
          `world to anchor ${label} #${i}`,
          'worldToAnchor',
          { el: e, wx: px, wy: py },
          worldToAnchor(e, px, py),
        );
      }
    });
    for (const [al, anchor] of ANCHORS) {
      fam.add(
        `anchor to world ${label} ${al}`,
        'anchorToWorld',
        { el: e, anchor },
        anchorToWorld(e, anchor),
      );
    }

    for (const [vl, viewport] of VIEWPORTS) {
      const handles = getSelectionHandles([e], viewport);
      fam.add(
        `handles ${label} ${vl}`,
        'getSelectionHandles',
        { elements: [e], viewport },
        handles,
      );
      // The scene only matters for connectors (bound or elbow bounds).
      const connector = e.type === 'line' || e.type === 'arrow';
      const allElements = connector ? scene : undefined;
      fam.add(
        `rotation handle ${label} ${vl}`,
        'getRotationHandleScreen',
        { elements: [e], viewport, allElements },
        getRotationHandleScreen([e], viewport, allElements),
      );
      if (vl === 'zoom 2 offset') {
        // Probes around two handles: on it, at the tolerance edge, outside.
        for (const h of [handles[0], handles[4]]) {
          if (!h) continue;
          for (const [dl, d] of [
            ['on', 0],
            ['edge', 12],
            ['past', 12.5],
          ] as const) {
            for (const tolerance of [undefined, 14]) {
              const screenX = h.screenX + d;
              const screenY = h.screenY - d / 2;
              fam.add(
                `hit handle ${label} ${h.position} ${dl} tol ${tolerance ?? 'default'}`,
                'hitTestHandle',
                { handles, screenX, screenY, tolerance },
                hitTestHandle(handles, screenX, screenY, tolerance),
              );
            }
          }
        }
      }
    }

    if (e.type === 'line' || e.type === 'arrow') {
      for (const [vl, viewport] of VIEWPORTS) {
        const pts = [
          [e.x, e.y],
          [e.x2, e.y2],
          [(e.x + e.x2) / 2, (e.y + e.y2) / 2],
        ];
        pts.forEach(([wx, wy], i) => {
          for (const offset of [0, 8.9, 9.1]) {
            const screenX = wx! * viewport.zoom + viewport.offsetX + offset;
            const screenY = wy! * viewport.zoom + viewport.offsetY;
            fam.add(
              `hit endpoint ${label} ${vl} #${i} +${offset}`,
              'hitTestEndpoint',
              { el: e, viewport, screenX, screenY },
              hitTestEndpoint(e, viewport, screenX, screenY),
            );
            if (vl !== 'default') continue;
            fam.add(
              `hit endpoint in scene ${label} ${vl} #${i} +${offset}`,
              'hitTestEndpoint',
              { el: e, viewport, screenX, screenY, allElements: scene },
              hitTestEndpoint(e, viewport, screenX, screenY, scene),
            );
          }
        });
      }
    }

    // select_tool hitTest on the element alone, at two zoom levels.
    for (const zoom of [1, 0.25]) {
      hitProbes(e).forEach(([wx, wy], i) => {
        if (zoom !== 1 && i % 3 !== 0) return;
        const hit = hitTest([e], wx, wy, { zoom });
        fam.add(
          `hit test ${label} zoom ${zoom} #${i}`,
          'hitTest',
          { elements: [e], wx, wy, viewport: { zoom } },
          hit?.id ?? null,
        );
      });
    }
  }

  // hitTest over the whole scene (topmost wins), with extra padding too.
  const rand = prng(0x68697474);
  for (let i = 0; i < 150; i++) {
    const wx = -150 + rand() * 900;
    const wy = -150 + rand() * 900;
    const extraPadPx = i % 4 === 0 ? 10 : undefined;
    fam.add(
      `hit test scene #${i}`,
      'hitTest',
      { elements: scene, wx, wy, viewport: { zoom: 1 }, extraPadPx },
      hitTest(scene, wx, wy, { zoom: 1 }, extraPadPx)?.id ?? null,
    );
  }

  // Snap targets over the whole scene.
  for (let i = 0; i < 120; i++) {
    const px = -150 + rand() * 900;
    const py = -150 + rand() * 900;
    const ignoreId = i % 5 === 0 ? 'r' : undefined;
    fam.add(
      `connector snap #${i}`,
      'findConnectorSnapTarget',
      { elements: scene, px, py, snapRadius: 20, portRadius: 14, ignoreId },
      findConnectorSnapTarget(scene, px, py, 20, 14, ignoreId),
    );
    fam.add(
      `nearest snap #${i}`,
      'findNearestElementSnapTarget',
      { elements: scene, px, py, snapRadius: 20, ignoreId },
      findNearestElementSnapTarget(scene, px, py, 20, ignoreId),
    );
  }
  // Exactly on ports, and with a hidden element.
  const hiddenScene = scene.map((el) =>
    el.id === 'e' ? { ...el, visible: false } : el,
  );
  for (const el of scene) {
    getElementPorts(el).forEach((port, i) => {
      const px = port.worldX + 3;
      const py = port.worldY - 2;
      fam.add(
        `connector snap port ${el.id} #${i}`,
        'findConnectorSnapTarget',
        { elements: scene, px, py, snapRadius: 20, portRadius: 14 },
        findConnectorSnapTarget(scene, px, py, 20, 14),
      );
      fam.add(
        `connector snap port hidden ${el.id} #${i}`,
        'findConnectorSnapTarget',
        { elements: hiddenScene, px, py, snapRadius: 20, portRadius: 14 },
        findConnectorSnapTarget(hiddenScene, px, py, 20, 14),
      );
    });
  }

  // Multi-element selections: union handles, no rotation.
  const groups: ReadonlyArray<[string, SampleName[]]> = [
    ['rect ellipse', ['rect', 'ellipse']],
    ['rect rotated text', ['rect', 'text']],
    ['connectors', ['line', 'arrow', 'curve']],
    ['everything', [...SAMPLE_NAMES]],
    ['icon vendor icon', ['icon', 'vendorIcon']],
  ];
  for (const [gl, names] of groups) {
    const els = names.map((n, i) =>
      sample(n, i === 1 ? { rotation: 0.7 } : {}),
    );
    for (const [vl, viewport] of VIEWPORTS) {
      fam.add(
        `handles group ${gl} ${vl}`,
        'getSelectionHandles',
        { elements: els, viewport },
        getSelectionHandles(els, viewport),
      );
      fam.add(
        `rotation handle group ${gl} ${vl}`,
        'getRotationHandleScreen',
        { elements: els, viewport, allElements: scene },
        getRotationHandleScreen(els, viewport, scene),
      );
    }
  }
  fam.add(
    'handles empty',
    'getSelectionHandles',
    { elements: [], viewport: VIEWPORTS[0]![1] },
    getSelectionHandles([], VIEWPORTS[0]![1]),
  );
  fam.add(
    'rotation handle empty',
    'getRotationHandleScreen',
    { elements: [], viewport: VIEWPORTS[0]![1] },
    getRotationHandleScreen([], VIEWPORTS[0]![1]),
  );

  // computeResize: each handle, a few pointer positions, Shift on and off.
  const resizeEls: Array<[string, Element]> = [
    ['rect', sample('rect')],
    ['ellipse', sample('ellipse')],
    ['shape', sample('shape')],
    ['icon', sample('icon')],
    ['text', sample('text')],
    ['note', sample('note')],
    ['image', sample('image')],
    ['line', sample('line')],
    ['arrow', sample('freeArrow')],
    ['curve', sample('curve')],
    ['polygon', sample('polygon')],
    ['freehand', sample('freehand')],
    [
      'flat freehand',
      sample('freehand', {
        points: [
          [0, 0],
          [50, 0],
        ],
      }),
    ],
  ];
  const pointers: ReadonlyArray<[string, number, number]> = [
    ['grow', 1.3, 1.2],
    ['shrink', 0.4, 0.6],
    ['flip', -0.5, -0.4],
    ['tiny', 0.01, 0.02],
  ];
  for (const [el_label, el] of resizeEls) {
    const origBounds = getElementBounds(el);
    for (const handle of HANDLES) {
      const ax = anchorX(handle, origBounds);
      const ay = anchorY(handle, origBounds);
      fam.add(
        `anchor ${el_label} ${handle}`,
        'anchorX',
        { h: handle, b: origBounds },
        ax,
      );
      fam.add(
        `anchor y ${el_label} ${handle}`,
        'anchorY',
        { h: handle, b: origBounds },
        ay,
      );
      // The handle's own position in world space.
      const hx = handle.includes('w')
        ? origBounds.x
        : handle.includes('e')
          ? origBounds.x + origBounds.w
          : origBounds.x + origBounds.w / 2;
      const hy = handle.includes('n')
        ? origBounds.y
        : handle.includes('s')
          ? origBounds.y + origBounds.h
          : origBounds.y + origBounds.h / 2;
      const initialSignX = Math.sign(hx - ax) || 1;
      const initialSignY = Math.sign(hy - ay) || 1;
      for (const [pl, fx, fy] of pointers) {
        const curX =
          ax + (hx - ax) * fx + (handle === 'n' || handle === 's' ? 7 : 0);
        const curY =
          ay + (hy - ay) * fy + (handle === 'w' || handle === 'e' ? 5 : 0);
        for (const shiftKey of [false, true]) {
          for (const zoom of [1, 4]) {
            if (zoom === 4 && (shiftKey || pl !== 'tiny')) continue;
            fam.add(
              `resize ${el_label} ${handle} ${pl}${shiftKey ? ' shift' : ''} zoom ${zoom}`,
              'computeResize',
              {
                el,
                handle,
                ax,
                ay,
                curX,
                curY,
                origBounds,
                shiftKey,
                initialSignX,
                initialSignY,
                zoom,
              },
              computeResize(
                el,
                handle,
                ax,
                ay,
                curX,
                curY,
                origBounds,
                shiftKey,
                initialSignX,
                initialSignY,
                zoom,
              ),
            );
          }
        }
      }
    }
  }

  // Alignment guides through the SelectTool.
  const base = sample('rect', { x: 0, y: 0, width: 100, height: 60 });
  const guideCases: ReadonlyArray<[string, Element[], string[], number]> = [
    [
      'left edges aligned',
      [
        base,
        sample('ellipse', { id: 'e', x: 2, y: 200, width: 80, height: 40 }),
      ],
      ['e'],
      1,
    ],
    [
      'centers aligned',
      [
        base,
        sample('ellipse', { id: 'e', x: 10, y: 120, width: 80, height: 40 }),
      ],
      ['e'],
      1,
    ],
    [
      'tolerance scales with zoom',
      [
        base,
        sample('ellipse', { id: 'e', x: 4, y: 200, width: 80, height: 40 }),
      ],
      ['e'],
      2,
    ],
    [
      'no guide past tolerance',
      [
        base,
        sample('ellipse', { id: 'e', x: 6, y: 200, width: 80, height: 40 }),
      ],
      ['e'],
      1,
    ],
    [
      'tops and bottoms',
      [
        base,
        sample('ellipse', { id: 'e', x: 300, y: 0.004, width: 80, height: 60 }),
      ],
      ['e'],
      1,
    ],
    [
      'rounding to 2 decimals',
      [
        sample('rect', { x: 0.123456, y: 0, width: 100, height: 60 }),
        sample('ellipse', { id: 'e', x: 0.12, y: 200, width: 80, height: 40 }),
      ],
      ['e'],
      1,
    ],
    [
      'hidden elements ignored',
      [
        sample('rect', { visible: false }),
        sample('ellipse', { id: 'e', x: 0, y: 200, width: 80, height: 40 }),
      ],
      ['e'],
      1,
    ],
    [
      'multi selection',
      [
        base,
        sample('ellipse', { id: 'e', x: 300, y: 300, width: 80, height: 40 }),
        sample('rhombus', { id: 'd', x: 200, y: 400, width: 100, height: 20 }),
        sample('text', { id: 't', x: 380, y: 0, width: 50, height: 60 }),
      ],
      ['e', 'd'],
      1,
    ],
  ];
  for (const [gl, elements, selectedIds, zoom] of guideCases) {
    fam.add(
      `align guides ${gl}`,
      'alignGuides',
      { elements, selectedIds, zoom },
      alignGuidesFor(elements, selectedIds, zoom),
    );
  }
  const full = sampleScene().filter((el) => el.id !== 'l' && el.id !== 'a');
  for (const id of ['r', 'e', 'd', 's', 't', 'n', 'gi', 'im']) {
    fam.add(
      `align guides sample scene ${id}`,
      'alignGuides',
      { elements: full, selectedIds: [id], zoom: 1 },
      alignGuidesFor(full, [id], 1),
    );
  }

  return fam;
}
