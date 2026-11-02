/**
 * `clone` family: src/elements/clone.ts, the copies made by duplicate (Cmd+D,
 * command palette, context panel: offset 20, 20), paste (offset per paste)
 * and Alt/Shift drag (offset 0, 0).
 *
 * `cloneElementsWithOffset` takes a `createId` callback: the generator passes
 * one that returns `id-1`, `id-2`, ... in call order, and the output records
 * how many ids were requested, so the Swift port must call it in the same
 * order (one per element, then one per remapped group on first use).
 * Cases named `test: ...` reproduce tests/clone.test.ts.
 */
import {
  cloneElementsWithOffset,
  cloneElementWithOffset,
} from '../../src/elements/clone';
import type { Element } from '../../src/elements/element';
import { Family } from './common';
import { SAMPLE_NAMES, sample } from './samples';

const BASE = {
  strokeColor: '#000',
  fillColor: 'transparent',
  strokeWidth: 1,
  opacity: 1,
  roughness: 0,
} as const;

function clean<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function rect(
  id: string,
  extra: Partial<Record<string, unknown>> = {},
): Element {
  return {
    ...BASE,
    id,
    type: 'rectangle',
    x: 0,
    y: 0,
    width: 10,
    height: 10,
    ...extra,
  } as Element;
}

function line(
  id: string,
  extra: Partial<Record<string, unknown>> = {},
): Element {
  return {
    ...BASE,
    id,
    type: 'line',
    x: 5,
    y: 5,
    x2: 20,
    y2: 20,
    ...extra,
  } as Element;
}

const OFFSETS: ReadonlyArray<[number, number]> = [
  [20, 20],
  [0, 0],
  [-15.5, 7.25],
  [0.1, 0.2],
];

export function buildClone(): Family {
  const fam = new Family('clone', {
    inputs:
      'cloneElementsWithOffset {elements, dx, dy}: createId returns "id-1", "id-2", ... in call order; ' +
      'output {elements, ids} with ids the number of createId calls. cloneElementWithOffset {el, id, dx, dy} ' +
      'returns the element.',
  });

  const many = (name: string, elements: Element[], dx: number, dy: number) => {
    let n = 0;
    const out = cloneElementsWithOffset(elements, dx, dy, () => `id-${++n}`);
    fam.add(
      name,
      'cloneElementsWithOffset',
      { elements: clean(elements), dx, dy },
      { elements: clean(out), ids: n },
    );
  };

  // tests/clone.test.ts
  many(
    'test: offsets point geometry and creates deterministic IDs',
    [
      {
        ...BASE,
        id: 'polygon',
        type: 'polygon',
        x: 0,
        y: 0,
        points: [
          [0, 0],
          [10, 5],
        ],
        closed: false,
      } as Element,
    ],
    20,
    -5,
  );
  many(
    'test: remaps connector references and group IDs within the cloned set',
    [
      rect('rect', { groupId: 'group' }),
      line('line', {
        startElementId: 'rect',
        endElementId: 'outside',
        groupId: 'group',
      }),
    ],
    0,
    0,
  );
  many(
    'test: detaches a partial group clone',
    [rect('rect', { groupId: 'group' })],
    0,
    0,
  );
  many(
    'test: keeps anchors only on ends that stay connected',
    [
      rect('rect'),
      line('line', {
        x: 10,
        y: 5,
        x2: 50,
        y2: 5,
        startElementId: 'rect',
        startAnchor: { x: 1, y: 0.5 },
        endElementId: 'outside',
        endAnchor: { x: 0, y: 0.5 },
      }),
    ],
    0,
    0,
  );

  // Every element type, alone, at several offsets.
  for (const name of SAMPLE_NAMES) {
    for (const [dx, dy] of OFFSETS) {
      const el = sample(name);
      many(`single ${name} by ${dx},${dy}`, [el], dx, dy);
      fam.add(
        `one ${name} by ${dx},${dy}`,
        'cloneElementWithOffset',
        { el: clean(el), id: 'copy', dx, dy },
        clean(cloneElementWithOffset(el, 'copy', dx, dy)),
      );
    }
  }

  // Mixed selections.
  const all = SAMPLE_NAMES.map((name) => sample(name));
  many('every sample type', all, 20, 20);
  many('every sample type reversed', [...all].reverse(), 20, 20);
  many(
    'connector with both ends inside',
    [
      sample('rect'),
      sample('ellipse'),
      sample('line', {
        startAnchor: { x: 1, y: 0.5 },
        endAnchor: { x: 0, y: 0.25 },
      }),
    ],
    20,
    20,
  );
  many(
    'connector before its targets',
    [sample('arrow'), sample('rect'), sample('rhombus')],
    20,
    20,
  );
  many(
    'connector alone loses both ends',
    [sample('line'), sample('arrow')],
    0,
    0,
  );
  many(
    'connector bound to itself',
    [line('self', { startElementId: 'self', endElementId: 'self' })],
    5,
    5,
  );
  many(
    'connector to a target cloned twice in input',
    [
      rect('r'),
      rect('r', { x: 100 }),
      line('l', { startElementId: 'r', endElementId: 'r' }),
    ],
    10,
    10,
  );
  many(
    'empty string bindings',
    [rect(''), line('l', { startElementId: '', endElementId: '' })],
    1,
    1,
  );
  many(
    'empty string group',
    [rect('a', { groupId: '' }), rect('b', { groupId: '' })],
    1,
    1,
  );
  many(
    'two groups and a loose element',
    [
      rect('a', { groupId: 'g1' }),
      rect('b', { groupId: 'g2' }),
      rect('c', { groupId: 'g1' }),
      rect('d'),
      rect('e', { groupId: 'g2' }),
      rect('f', { groupId: 'g3' }),
    ],
    20,
    20,
  );
  many(
    'group of connectors and shapes',
    [
      rect('a', { groupId: 'g' }),
      rect('b', { x: 100, groupId: 'g' }),
      line('l', {
        startElementId: 'a',
        endElementId: 'b',
        startAnchor: { x: 0.5, y: 1 },
        groupId: 'g',
        routing: 'elbow',
        label: 'link',
      }),
    ],
    20,
    20,
  );
  many(
    'curved line keeps control point offset',
    [line('c', { cx: 40, cy: -30 })],
    -20,
    20,
  );
  many('curved line with only cx', [line('c', { cx: 40 })], -20, 20);
  many('empty selection', [], 20, 20);
  many(
    'locked, hidden and rotated keep their flags',
    [
      rect('a', { locked: true }),
      rect('b', { visible: false, layerName: 'Back' }),
      rect('c', { rotation: 0.5 }),
    ],
    20,
    20,
  );
  many(
    'freehand without pressures and polygon closed',
    [
      {
        ...BASE,
        id: 'f',
        type: 'freehand',
        x: 1,
        y: 2,
        points: [
          [1, 2],
          [3, 4],
          [5, 6],
        ],
      } as Element,
      {
        ...BASE,
        id: 'p',
        type: 'polygon',
        x: 0,
        y: 0,
        points: [
          [0, 0],
          [10, 0],
          [5, 8],
        ],
        closed: true,
      } as Element,
    ],
    20,
    20,
  );
  many(
    'unknown extra fields are copied',
    [rect('x', { futureField: { a: [1, 2] }, zIndexHint: 3 })],
    20,
    20,
  );
  many(
    'large offsets',
    [sample('rect'), sample('line'), sample('freehand')],
    1e7,
    -1e7,
  );
  return fam;
}
