/**
 * Semantic diagram parity. Each method case constructs Diagram(initial ?? []),
 * replays setup in order, then calls fn(...args). Async methods are awaited.
 * moveNodes accepts an entry array converted to Map. undo/redo in setup call
 * history.undo()/redo(). Output is {result,elements,nodeKeys,snapshot}; void
 * results are null, Maps are ordered entries. Errors are exactly {error:message}.
 * Pure exports take named inputs and return their result directly.
 * UUID counter resets before construction/setup for EVERY case and yields
 * 00000001-0000-4000-8000-000000000001, ...0002 (hex counter in both ends).
 * This keeps edgeShortId prefixes distinct. No clock/random calls occur in
 * these paths; bundled icon resolution uses the real local bundled registry.
 */
import { vi } from 'vitest';
import {
  Diagram,
  edgeShortId,
  elementLabel,
  NODE_COLORS,
  NODE_KINDS,
  type NodeSpec,
  resolveIconRef,
  slugify,
} from '../../mcp/src/diagram';
import { ARROW_HEAD_STYLES, type Element } from '../../src/elements/element';
import { Family } from './common';

type Method =
  | 'addNodes'
  | 'connect'
  | 'update'
  | 'updateEdge'
  | 'disconnect'
  | 'remove'
  | 'layout'
  | 'moveNodes'
  | 'nodeKeys'
  | 'snapshot'
  | 'undo'
  | 'redo';
type Step = { fn: Method; args: unknown[] };

async function call(d: Diagram, step: Step): Promise<unknown> {
  if (step.fn === 'undo' || step.fn === 'redo') return d.history[step.fn]();
  if (step.fn === 'moveNodes')
    return d.moveNodes(
      new Map(step.args[0] as [string, { x: number; y: number }][]),
    );
  // Runtime dispatch deliberately also permits invalid JSON inputs as probes.
  const method = d[step.fn] as (...args: unknown[]) => unknown;
  const result = await method.apply(d, step.args);
  return result instanceof Map ? [...result] : result;
}

export async function buildDiagram(): Promise<Family> {
  const fam = new Family('diagram', {
    inputs:
      'Method cases: new Diagram(initial ?? []); replay setup [{fn,args}] in order; call fn(...args). Await async calls. moveNodes args[0] entries become a Map; undo/redo address history. Output {result: return value or null for void, elements: live scene, nodeKeys: ordered Map entries, snapshot: snapshot()}. Errors output only {error: message}. Pure functions call slugify(input.text), resolveIconRef(input.input), elementLabel(input.element), edgeShortId(input.element) and return directly.',
    ids: 'Per case, before initial/setup: crypto.randomUUID counter n starts at 0, increments per call, returns n.toString(16).padStart(8,"0") + "-0000-4000-8000-" + n.toString(16).padStart(12,"0"). No time or Math.random used by covered paths. Real local bundled icons, no network mocks.',
  });
  const capture = async (fn: () => unknown) => {
    try {
      return await fn();
    } catch (e) {
      return { error: e instanceof Error ? e.message : String(e) };
    }
  };
  const add = async (
    name: string,
    fn: Method,
    args: unknown[],
    setup: Step[] = [],
    initial: Element[] = [],
  ) => {
    let n = 0;
    const spy = vi
      .spyOn(globalThis.crypto, 'randomUUID')
      .mockImplementation(() => {
        n++;
        return `${n.toString(16).padStart(8, '0')}-0000-4000-8000-${n.toString(16).padStart(12, '0')}` as ReturnType<
          Crypto['randomUUID']
        >;
      });
    try {
      const output = await capture(async () => {
        const d = new Diagram(initial);
        for (const step of setup) await call(d, step);
        const result = await call(d, { fn, args });
        return {
          result: result ?? null,
          elements: d.elements,
          nodeKeys: [...d.nodeKeys()],
          snapshot: d.snapshot(),
        };
      });
      fam.add(name, fn, { initial, setup, args }, output);
    } finally {
      spy.mockRestore();
    }
  };
  const sample: Step[] = [
    {
      fn: 'addNodes',
      args: [
        [
          { key: 'user', kind: 'icon', icon: 'user', label: 'Customer' },
          { key: 'api', label: 'API gateway', color: 'blue' },
          { key: 'orders-db', kind: 'database', label: 'Orders' },
        ],
      ],
    },
    {
      fn: 'connect',
      args: [
        [
          { from: 'user', to: 'api', label: 'HTTPS' },
          {
            from: 'api',
            to: 'orders-db',
            routing: 'elbow',
            endHead: 'triangleFilled',
          },
        ],
      ],
    },
  ];
  const labels = [
    '',
    'Orders DB',
    '  Città / Servizio ',
    '你好 👩🏽‍💻',
    'Cafe\u0301',
    'A NEW VERSION IS OUT!',
    'Modello linguistico\nlocale: gemma3:12b (Ollama)\nproduzione: GPT 4.1, AI Factory Azure',
    'long label '.repeat(35),
  ];
  for (const [i, text] of labels.entries())
    fam.add(`slug ${i}`, 'slugify', { text }, slugify(text));
  for (const input of [
    'database',
    'generic/server',
    'pod',
    'Deployment',
    'k8s/pod',
    ' generic/user ',
    'spaceship',
    'generic/spaceship',
    'k8s/nope',
    '../bad',
    '',
    'custom/icon',
  ])
    fam.add(
      `icon ${input}`,
      'resolveIconRef',
      { input },
      await capture(() => resolveIconRef(input)),
    );
  for (const kind of NODE_KINDS)
    for (const color of Object.keys(
      NODE_COLORS,
    ) as (keyof typeof NODE_COLORS)[]) {
      await add(`node ${kind} ${color}`, 'addNodes', [
        [
          {
            key: 'Orders DB',
            kind,
            color,
            icon: 'database',
            label:
              labels[
                (NODE_KINDS.indexOf(kind) +
                  Object.keys(NODE_COLORS).indexOf(color)) %
                  labels.length
              ],
          },
        ],
      ]);
    }
  for (const [i, spec] of (
    [
      {},
      { width: 0, height: 0 },
      { width: -1 },
      { height: -1 },
      { fontSize: 0 },
      { fontSize: -2 },
      { width: 12.25, height: 30.5, x: -7.25, y: 0.125 },
      { kind: 'nonsense' },
      { color: 'invalid' },
      { kind: 'icon', icon: 'spaceship' },
    ] as Partial<NodeSpec>[]
  ).entries())
    await add(`node validation ${i}`, 'addNodes', [[{ key: 'a', ...spec }]]);
  const originalKeys: Step[] = [
    {
      fn: 'addNodes',
      args: [
        [
          { key: 'Client' },
          { key: 'Server' },
          { key: 'API gateway' },
          { key: 'Città' },
        ],
      ],
    },
  ];
  const originalConnection: Step = {
    fn: 'connect',
    args: [[{ from: 'Client', to: 'Server' }]],
  };
  await add(
    'connect original keys',
    'connect',
    originalConnection.args,
    originalKeys,
  );
  await add(
    'update original spaces',
    'update',
    ['Orders DB', { label: 'Updated orders' }],
    sample,
  );
  await add(
    'update original accents',
    'update',
    ['Città', { label: 'Updated city' }],
    originalKeys,
  );
  await add('remove original key', 'remove', [['API gateway']], originalKeys);
  await add(
    'layout original keys',
    'layout',
    ['TB', ['Client', 'Server', 'Città']],
    [...originalKeys, originalConnection],
  );
  await add(
    'disconnect original keys',
    'disconnect',
    [[{ from: 'Client', to: 'Server' }]],
    [...originalKeys, originalConnection],
  );
  await add(
    'edge update original keys',
    'updateEdge',
    [{ from: 'Client', to: 'Server' }, { label: 'calls' }],
    [...originalKeys, originalConnection],
  );
  await add('layout unknown key', 'layout', ['TB', ['Missing Città']], sample);
  await add('unknown original key', 'update', ['Missing Città', {}], sample);
  await add('unknown empty slug', 'update', ['你好', {}], sample);
  await add('empty nodes', 'addNodes', [[]]);
  await add('duplicate batch', 'addNodes', [[{ key: 'API' }, { key: 'api' }]]);
  await add('duplicate existing', 'addNodes', [[{ key: 'api' }]], sample);
  await add('new row', 'addNodes', [[{ key: 'next' }]], sample);
  await add('sample batch', 'connect', sample[1]!.args, [sample[0]!]);
  for (const arrow of ['none', 'start', 'end', 'both'])
    for (const routing of ['straight', 'elbow'])
      await add(
        `connect ${arrow} ${routing}`,
        'connect',
        [
          [
            {
              from: 'api',
              to: 'orders-db',
              arrow,
              routing,
              label: 'calls',
              fontSize: 18,
              dashed: true,
              color: 'purple',
            },
          ],
        ],
        sample,
      );
  for (const head of ARROW_HEAD_STYLES)
    await add(
      `heads ${head}`,
      'connect',
      [[{ from: 'api', to: 'api', startHead: head, endHead: head }]],
      sample,
    );
  await add('empty connect', 'connect', [[]], sample);
  await add(
    'unknown endpoint',
    'connect',
    [[{ from: 'api', to: 'nope' }]],
    sample,
  );
  for (const [i, patch] of [
    {},
    { label: 'Gateway', color: 'green', x: 500, y: 40, width: 200 },
    { label: '' },
    { label: labels[7], fontSize: 32 },
    { x: -1.25, y: 20.5 },
    { width: 0, height: 0 },
    { height: 100 },
  ].entries())
    await add(`update ${i}`, 'update', ['api', patch], sample);
  for (const kind of NODE_KINDS) {
    const setup: Step[] = [
      {
        fn: 'addNodes',
        args: [[{ key: 'a', kind, icon: 'database', label: 'Orders service' }]],
      },
    ];
    await add(
      `resize auto ${kind}`,
      'update',
      ['a', { label: 'Long changed label', fontSize: 32 }],
      setup,
    );
    await add(
      `resize fixed ${kind}`,
      'update',
      ['a', { fontSize: 24 }],
      [
        {
          fn: 'addNodes',
          args: [
            [{ key: 'a', kind, icon: 'database', width: 200, height: 90 }],
          ],
        },
      ],
    );
  }
  await add('unknown update', 'update', ['nope', {}], sample);
  for (const [i, patch] of [
    {},
    { label: 'gRPC', routing: 'elbow', dashed: true, color: 'red' },
    { label: '', dashed: false },
    {
      fontSize: 10,
      arrow: 'both',
      startHead: 'circle',
      endHead: 'triangleFilled',
    },
  ].entries())
    await add(
      `edge update ${i}`,
      'updateEdge',
      [{ from: 'user', to: 'api' }, patch],
      sample,
    );
  const edited: Step[] = [
    ...sample,
    {
      fn: 'updateEdge',
      args: [
        { from: 'user', to: 'api' },
        { label: 'gRPC', routing: 'elbow', dashed: true, color: 'red' },
      ],
    },
  ];
  await add(
    'clear edge label dash',
    'updateEdge',
    [
      { from: 'user', to: 'api' },
      { label: '', dashed: false },
    ],
    edited,
  );
  const duplicate: Step[] = [
    ...sample,
    {
      fn: 'connect',
      args: [[{ from: 'user', to: 'api', label: 'WebSocket' }]],
    },
  ];
  for (const ref of [
    {},
    { id: 'missing' },
    { from: 'api', to: 'user' },
    { from: 'missing', to: 'api' },
    { from: 'user', to: 'api' },
    { id: '0000000' },
  ]) {
    await add(
      `bad edge update ${JSON.stringify(ref)}`,
      'updateEdge',
      [ref, {}],
      duplicate,
    );
    await add(
      `bad disconnect ${JSON.stringify(ref)}`,
      'disconnect',
      [[ref]],
      duplicate,
    );
  }
  for (const refs of [
    [],
    [{ from: 'user', to: 'api' }],
    [{ id: '00000005' }],
    [{ from: 'user', to: 'api', label: 'WebSocket' }],
    [{ id: '00000004' }, { id: '00000004' }],
  ])
    await add(
      `disconnect ${JSON.stringify(refs)}`,
      'disconnect',
      [refs],
      refs.some((r) => 'label' in r) ? duplicate : sample,
    );
  for (const keys of [
    [],
    ['api'],
    ['api', 'api'],
    ['nope'],
    ['user', 'api', 'orders-db'],
  ])
    await add(`remove ${keys}`, 'remove', [keys], sample);
  for (const direction of ['TB', 'LR'])
    for (const keys of [undefined, [], ['api', 'orders-db'], ['missing']])
      await add(
        `layout ${direction} ${JSON.stringify(keys)}`,
        'layout',
        keys === undefined ? [direction] : [direction, keys],
        sample,
      );
  await add('empty layout', 'layout', ['TB']);
  await add(
    'icon multiline layout',
    'layout',
    ['TB'],
    [
      {
        fn: 'addNodes',
        args: [
          [
            { key: 'llm', kind: 'icon', icon: 'server', label: labels[6] },
            { key: 'app', label: 'App' },
          ],
        ],
      },
      { fn: 'connect', args: [[{ from: 'llm', to: 'app', routing: 'elbow' }]] },
    ],
  );
  await add(
    'move node',
    'moveNodes',
    [[['00000002-0000-4000-8000-000000000002', { x: 1000, y: 500 }]]],
    sample,
  );
  await add(
    'snapshot after layout',
    'snapshot',
    [],
    [...sample, { fn: 'layout', args: ['TB'] }],
  );
  await add(
    'snapshot after resize',
    'snapshot',
    [],
    [
      ...sample,
      { fn: 'layout', args: ['TB'] },
      {
        fn: 'update',
        args: ['api', { x: 600, y: 400, width: 200, height: 100 }],
      },
    ],
  );
  await add('undo batch', 'undo', [], sample);
  await add('undo nodes', 'undo', [], [...sample, { fn: 'undo', args: [] }]);
  await add(
    'redo edge patch',
    'redo',
    [],
    [...edited, { fn: 'undo', args: [] }],
  );
  const base = {
    strokeColor: '#000',
    fillColor: 'transparent',
    strokeWidth: 1,
    opacity: 1,
    roughness: 0,
    x: 0,
    y: 0,
    width: 10,
    height: 10,
  };
  const foreign: Element[] = [
    { ...base, id: 'aaaa1111', type: 'rectangle', label: 'Billing Service' },
    { ...base, id: 'bbbb2222', type: 'rectangle', label: 'Billing service' },
    { ...base, id: 'cccc3333', type: 'ellipse' },
  ];
  const longKey = 'a'.repeat(40);
  await add(
    'exact key shadows truncated slug',
    'update',
    [`${longKey}-2`, { label: 'Exact match' }],
    [],
    [
      { ...foreign[0]!, label: longKey },
      { ...foreign[1]!, label: longKey },
    ],
  );
  await add('foreign keys', 'nodeKeys', [], [], foreign);
  await add('sample keys', 'nodeKeys', [], sample);
  const arrow: Element = {
    strokeColor: '#000',
    fillColor: 'transparent',
    strokeWidth: 2,
    opacity: 1,
    roughness: 0,
    id: 'arrow001',
    type: 'arrow',
    x: 0,
    y: 0,
    x2: 100,
    y2: 40,
    label: '',
  };
  await add(
    'plain arrow fixed heads',
    'updateEdge',
    [{ id: 'arrow001' }, { arrow: 'both' }],
    [],
    [arrow],
  );
  await add(
    'plain arrow patch',
    'updateEdge',
    [{ id: 'arrow001' }, { label: 'updated', color: 'yellow' }],
    [],
    [arrow],
  );
  await add('plain arrow snapshot', 'snapshot', [], [], [arrow]);
  for (const color of Object.keys(NODE_COLORS))
    await add(
      `edge color ${color}`,
      'updateEdge',
      [{ from: 'user', to: 'api' }, { color }],
      sample,
    );
  await add(
    'empty edge label',
    'connect',
    [[{ from: 'api', to: 'orders-db', label: '' }]],
    sample,
  );
  await add(
    'explicit size stops autosizing',
    'update',
    ['api', { label: 'a long replacement label', fontSize: 40 }],
    [...sample, { fn: 'update', args: ['api', { width: 200, height: 90 }] }],
  );
  await add(
    'edge patch undo',
    'undo',
    [],
    [
      ...edited,
      {
        fn: 'updateEdge',
        args: [
          { from: 'user', to: 'api' },
          { label: '', dashed: false },
        ],
      },
    ],
  );
  for (const element of [
    ...foreign,
    {
      ...base,
      id: 'short',
      type: 'text' as const,
      content: '你好',
      fontSize: 20,
      fontFamily: 'sans-serif',
    },
  ]) {
    fam.add(
      `label ${element.id}`,
      'elementLabel',
      { element },
      elementLabel(element),
    );
    fam.add(
      `short id ${element.id}`,
      'edgeShortId',
      { element },
      edgeShortId(element),
    );
  }
  return fam;
}
