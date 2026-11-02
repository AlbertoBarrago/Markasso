/**
 * `labels` family: where labels go and how they wrap.
 *
 * - Connector labels (src/rendering/connector_labels.ts): `getConnectorLabelSize`
 *   and `getConnectorLabelBoxes` on small scenes and on dense diagrams (fan
 *   outs, crossings, overlapping nodes, curved, elbow and straight
 *   connectors, hidden connectors, custom fonts, multi-line labels).
 * - Shape labels: `shapeLabelLayout` is what the canvas and the SVG export
 *   do before drawing a rectangle, ellipse, rhombus or flowchart label:
 *   `getLabelWrapWidth(el, w, h)` with w, h the normalized box size, then
 *   `wrapTextLines(label, wrapWidth, fontSize, fontFamily, false, true)`.
 * - Stencil labels (src/elements/stencils/registry.ts): label width, lines,
 *   height and box, plus `getConnectorBox` and `resolveConnectorRoute` for
 *   connectors that must route around a label.
 *
 * Cases named `test: ...` reproduce the scenes of
 * tests/connector_labels.test.ts and tests/stencil_label_routing.test.ts.
 */
import { normalizeRect } from '../../src/core/geometry';
import { wrapTextLines } from '../../src/core/text_metrics';
import {
  type Element,
  type LineElement,
  SHAPE_KINDS,
  type StencilElement,
} from '../../src/elements/element';
import {
  DEFAULT_LABEL_FONT_FAMILY,
  DEFAULT_SHAPE_LABEL_FONT_SIZE,
} from '../../src/elements/label_defaults';
import {
  createStencil,
  getStencilLabelBox,
  getStencilLabelHeight,
  getStencilLabelLines,
  getStencilLabelWidth,
} from '../../src/elements/stencils/registry';
import {
  getConnectorLabelBoxes,
  getConnectorLabelSize,
} from '../../src/rendering/connector_labels';
import {
  getConnectorBox,
  resolveConnectorRoute,
} from '../../src/rendering/draw_selection';
import {
  getLabelWrapWidth,
  type LabeledShape,
} from '../../src/rendering/shape_geometry';
import { Family, type Json, prng } from './common';

const BASE = {
  strokeColor: '#e2e2ef',
  fillColor: 'transparent',
  strokeWidth: 2,
  opacity: 1,
  roughness: 0,
} as const;

function rect(
  id: string,
  x: number,
  y: number,
  extra: Partial<Record<string, unknown>> = {},
): Element {
  return {
    ...BASE,
    id,
    type: 'rectangle',
    x,
    y,
    width: 160,
    height: 70,
    ...extra,
  } as Element;
}

function edge(
  id: string,
  from: string,
  to: string,
  label: string | undefined,
  extra: Partial<Record<string, unknown>> = {},
): LineElement {
  return {
    ...BASE,
    id,
    type: 'line',
    x: 0,
    y: -1000,
    x2: 0,
    y2: -1000,
    arrowHead: 'end',
    routing: 'elbow',
    startElementId: from,
    endElementId: to,
    ...(label !== undefined && { label }),
    ...extra,
  } as LineElement;
}

/** `getConnectorLabelBoxes` result as a plain object keyed by connector id. */
function boxesOf(elements: ReadonlyArray<Element>): Json {
  // A fresh array each time: the function caches by array identity.
  const out: Json = {};
  for (const [id, box] of getConnectorLabelBoxes([...elements])) {
    out[id] = { x: box.x, y: box.y, w: box.w, h: box.h };
  }
  return out;
}

const STENCIL_LABEL =
  'Modello linguistico\nlocale: gemma3:12b (Ollama)\nproduzione: GPT 4.1, AI Factory Azure';

/** Dense diagram: a grid of nodes, connectors between random pairs. */
function denseDiagram(
  seed: number,
  cols: number,
  rows: number,
  edges: number,
  options: {
    readonly spacing?: number;
    readonly routings?: ReadonlyArray<'elbow' | 'straight' | 'curved'>;
    readonly jitter?: number;
    readonly stencils?: boolean;
  } = {},
): Element[] {
  const rand = prng(seed);
  const spacing = options.spacing ?? 220;
  const routings = options.routings ?? ['elbow'];
  const jitter = options.jitter ?? 0;
  const out: Element[] = [];
  const ids: string[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const id = `n${r}-${c}`;
      const x = c * spacing + Math.round((rand() - 0.5) * jitter);
      const y = r * spacing * 0.8 + Math.round((rand() - 0.5) * jitter);
      if (options.stencils && (r + c) % 3 === 0) {
        out.push(
          createStencil(
            id,
            { kind: 'builtin', ref: 'generic/server' },
            x + 32,
            y + 32,
            BASE,
            (r + c) % 2 === 0 ? `Service ${id}` : STENCIL_LABEL,
          ),
        );
      } else {
        out.push(rect(id, x, y, { width: 120, height: 60, label: id }));
      }
      ids.push(id);
    }
  }
  const words = ['calls', 'reads', 'writes to', 'publishes', 'sync', 'HTTP'];
  for (let i = 0; i < edges; i++) {
    const a = ids[Math.floor(rand() * ids.length)]!;
    let b = ids[Math.floor(rand() * ids.length)]!;
    if (a === b) b = ids[(ids.indexOf(a) + 1) % ids.length]!;
    const routing = routings[i % routings.length]!;
    const label =
      i % 5 === 4
        ? `${words[i % words.length]}\nline ${i}`
        : `${words[i % words.length]} ${i}`;
    const extra: Record<string, unknown> = {};
    if (routing === 'curved') {
      extra.routing = undefined;
      extra.cx = Math.round(rand() * cols * spacing);
      extra.cy = Math.round(rand() * rows * spacing * 0.8);
    } else {
      extra.routing = routing;
    }
    if (i % 7 === 3) extra.labelFontSize = 18;
    if (i % 11 === 5) extra.labelFontFamily = 'Georgia, serif';
    const el = edge(`e${i}`, a, b, label, extra) as unknown as Record<
      string,
      unknown
    >;
    if (el.routing === undefined) delete el.routing;
    out.push(el as unknown as LineElement);
  }
  return out;
}

function connectorCases(fam: Family): void {
  const scene = (name: string, elements: Element[]) =>
    fam.add(name, 'getConnectorLabelBoxes', { elements }, boxesOf(elements));

  // tests/connector_labels.test.ts
  const fanOut = [
    rect('src', 220, 0),
    rect('a', 0, 260),
    rect('b', 220, 260),
    rect('c', 440, 260),
    edge('e1', 'src', 'a', 'indicizza'),
    edge('e2', 'src', 'b', 'confronto'),
    edge('e3', 'src', 'c', 'archivia'),
  ];
  scene('test: connector label placement (fan out)', fanOut);
  for (const id of ['e1', 'e2', 'e3']) {
    const el = fanOut.find((e) => e.id === id) as LineElement;
    fam.add(
      `test: fan out route ${id}`,
      'resolveConnectorRoute',
      { el, allElements: fanOut },
      resolveConnectorRoute(el, fanOut),
    );
  }
  scene('test: keeps a lone label in the middle of its route', [
    rect('p', 0, 0),
    rect('q', 0, 300),
    edge('e', 'p', 'q', 'x'),
  ]);

  // Small scenes, one feature at a time.
  const pair = [rect('p', 0, 0), rect('q', 400, 200)];
  scene('straight bound', [
    ...pair,
    edge('e', 'p', 'q', 'label', { routing: 'straight' }),
  ]);
  scene('elbow bound', [...pair, edge('e', 'p', 'q', 'label')]);
  scene('curved bound', [
    ...pair,
    edge('e', 'p', 'q', 'curved', { routing: undefined, cx: 300, cy: -80 }),
  ]);
  scene('arrow element', [
    ...pair,
    {
      ...BASE,
      id: 'a',
      type: 'arrow',
      x: 160,
      y: 35,
      x2: 400,
      y2: 235,
      startElementId: 'p',
      endElementId: 'q',
      label: 'arrow label',
    } as Element,
  ]);
  scene('unbound straight line', [
    {
      ...BASE,
      id: 'u',
      type: 'line',
      x: 0,
      y: 0,
      x2: 300,
      y2: 0,
      label: 'free',
    } as Element,
  ]);
  scene('zero length line', [
    {
      ...BASE,
      id: 'z',
      type: 'line',
      x: 50,
      y: 50,
      x2: 50,
      y2: 50,
      label: 'dot',
    } as Element,
  ]);
  scene('hidden connector has no box', [
    ...pair,
    edge('e', 'p', 'q', 'hidden', { visible: false }),
    edge('f', 'q', 'p', 'shown', { routing: 'straight' }),
  ]);
  scene('hidden connector does not block', [
    ...pair,
    edge('e', 'p', 'q', undefined, { visible: false }),
    edge('f', 'p', 'q', 'shown'),
  ]);
  scene('empty label', [...pair, edge('e', 'p', 'q', '')]);
  scene('unlabeled connector blocks a labeled one', [
    ...pair,
    edge('e', 'p', 'q', undefined),
    edge('f', 'p', 'q', 'same path', { routing: 'straight' }),
  ]);
  scene('multi line and custom font', [
    ...pair,
    edge('e', 'p', 'q', 'first line\nsecond, longer line\n3', {
      labelFontSize: 20,
      labelFontFamily: 'Georgia, serif',
    }),
  ]);
  scene('dangling end id', [
    rect('p', 0, 0),
    edge('e', 'p', 'missing', 'dangling', { x2: 300, y2: 300 }),
  ]);
  scene('parallel connectors', [
    rect('p', 0, 0),
    rect('q', 0, 400),
    edge('e1', 'p', 'q', 'one'),
    edge('e2', 'p', 'q', 'two'),
    edge('e3', 'p', 'q', 'three'),
    edge('e4', 'q', 'p', 'four'),
  ]);
  scene('crossing straight connectors', [
    rect('a', 0, 0),
    rect('b', 400, 400),
    rect('c', 400, 0),
    rect('d', 0, 400),
    edge('ad', 'a', 'b', 'diagonal one', { routing: 'straight' }),
    edge('cd', 'c', 'd', 'diagonal two', { routing: 'straight' }),
  ]);
  scene('overlapping nodes', [
    rect('a', 0, 0),
    rect('b', 60, 30),
    rect('c', 400, 0),
    edge('ac', 'a', 'c', 'over a'),
    edge('bc', 'b', 'c', 'over b'),
  ]);
  scene('label wider than its route', [
    rect('a', 0, 0),
    rect('b', 200, 0),
    edge('e', 'a', 'b', 'a label much wider than the gap between nodes'),
  ]);
  scene('anchored ends', [
    ...pair,
    edge('e', 'p', 'q', 'anchored', {
      startAnchor: { x: 0.5, y: 1 },
      endAnchor: { x: 0, y: 0.5 },
    }),
  ]);

  // Dense diagrams.
  scene('dense 3x3 elbow', denseDiagram(1, 3, 3, 10));
  scene(
    'dense 4x3 mixed',
    denseDiagram(2, 4, 3, 16, {
      routings: ['elbow', 'straight', 'curved'],
    }),
  );
  scene(
    'dense 4x4 tight spacing',
    denseDiagram(3, 4, 4, 20, {
      spacing: 150,
    }),
  );
  scene(
    'dense 3x3 overlapping jitter',
    denseDiagram(4, 3, 3, 12, {
      spacing: 140,
      jitter: 120,
    }),
  );
  scene(
    'dense 3x3 stencils',
    denseDiagram(5, 3, 3, 10, {
      routings: ['elbow', 'straight'],
      stencils: true,
    }),
  );
  scene(
    'dense 5x2 straight crossings',
    denseDiagram(6, 5, 2, 18, {
      routings: ['straight'],
    }),
  );

  // Label sizes.
  const sizes: Array<[string, Record<string, unknown>]> = [
    ['default', { label: 'yes' }],
    ['empty', { label: '' }],
    ['no label', {}],
    ['multi line', { label: 'a\nbb\nccc' }],
    ['trailing newline', { label: 'end\n' }],
    ['font size 8', { label: 'small', labelFontSize: 8 }],
    ['font size 36', { label: 'big', labelFontSize: 36 }],
    ['font size 12.5', { label: 'fraction', labelFontSize: 12.5 }],
    ['serif', { label: 'serif text', labelFontFamily: 'Georgia, serif' }],
    ['mono', { label: 'code()', labelFontFamily: '"Courier New", monospace' }],
    ['unicode', { label: 'Caffè 日本語 \u{1F680}' }],
    ['spaces only', { label: '   ' }],
  ];
  for (const [name, extra] of sizes) {
    for (const type of ['line', 'arrow'] as const) {
      const el = {
        ...BASE,
        id: 'l',
        type,
        x: 0,
        y: 0,
        x2: 100,
        y2: 0,
        ...extra,
      } as Element;
      fam.add(
        `size ${type} ${name}`,
        'getConnectorLabelSize',
        { el },
        getConnectorLabelSize(el as LineElement),
      );
    }
  }
}

const SHAPE_LABELS: ReadonlyArray<[string, string]> = [
  ['short', 'Start'],
  ['sentence', 'Validate the incoming request and store it'],
  ['long word', 'siasdasdasdasdasdasdasdasd'],
  ['newlines', 'line one\nline two\n\nafter blank'],
  ['unicode', 'Caffè crème 日本語の文字列 \u{1F680}'],
  ['spaces', '  padded   words  '],
];

const SHAPE_SIZES: ReadonlyArray<[number, number]> = [
  [160, 70],
  [60, 40],
  [300, 120],
  [-160, -70],
  [10, 10],
  [0, 0],
];

function shapeLabelCases(fam: Family): void {
  const layout = (name: string, el: Element) => {
    const { w, h } = normalizeRect(
      el as Element & { x: number; y: number; width: number; height: number },
    );
    const shape = el as LabeledShape & {
      label: string;
      labelFontSize?: number;
      labelFontFamily?: string;
    };
    const wrapWidth = getLabelWrapWidth(shape, w, h);
    const lines = wrapTextLines(
      shape.label,
      wrapWidth,
      shape.labelFontSize ?? DEFAULT_SHAPE_LABEL_FONT_SIZE,
      shape.labelFontFamily ?? DEFAULT_LABEL_FONT_FAMILY,
      false,
      true,
    );
    fam.add(name, 'shapeLabelLayout', { el }, { wrapWidth, lines });
  };
  const types = ['rectangle', 'ellipse', 'rhombus'] as const;
  for (const type of types) {
    for (const [w, h] of SHAPE_SIZES) {
      for (const [labelName, label] of SHAPE_LABELS) {
        layout(`${type} ${w}x${h} ${labelName}`, {
          ...BASE,
          id: 'el',
          type,
          x: 10,
          y: 20,
          width: w,
          height: h,
          label,
        } as Element);
      }
    }
    for (const [fontName, extra] of [
      ['font 24', { labelFontSize: 24 }],
      ['font 9', { labelFontSize: 9 }],
      ['font 200 wider than box', { labelFontSize: 200 }],
      ['serif', { labelFontFamily: 'Georgia, serif' }],
    ] as const) {
      layout(`${type} 160x70 sentence ${fontName}`, {
        ...BASE,
        id: 'el',
        type,
        x: 0,
        y: 0,
        width: 160,
        height: 70,
        label: SHAPE_LABELS[1]![1],
        ...extra,
      } as Element);
    }
  }
  for (const kind of SHAPE_KINDS) {
    for (const [w, h] of [
      [160, 80],
      [80, 160],
      [40, 30],
    ] as const) {
      for (const [labelName, label] of [SHAPE_LABELS[1]!, SHAPE_LABELS[2]!]) {
        layout(`shape ${kind} ${w}x${h} ${labelName}`, {
          ...BASE,
          id: 'el',
          type: 'shape',
          kind,
          x: 0,
          y: 0,
          width: w,
          height: h,
          label,
        } as Element);
      }
    }
  }
}

function stencil(
  label: string | undefined,
  extra: Partial<Record<string, unknown>> = {},
): StencilElement {
  return {
    ...createStencil(
      'st',
      { kind: 'builtin', ref: 'generic/server' },
      32,
      32,
      BASE,
      label ?? '',
    ),
    ...extra,
  } as StencilElement;
}

function stencilCases(fam: Family): void {
  for (const w of [0, 32, 64, 89.5, 90, 91, 200, -64]) {
    fam.add(
      `label width ${w}`,
      'getStencilLabelWidth',
      { boxWidth: w },
      getStencilLabelWidth(w),
    );
  }
  const variants: Array<[string, StencilElement]> = [
    ['no label', stencil(undefined)],
    ['short', stencil('API')],
    ['wraps', stencil(STENCIL_LABEL)],
    ['long word', stencil('Supercalifragilisticexpialidocious_service_name')],
    ['blank lines', stencil('first\n\nthird\n')],
    ['font 20', stencil('Gateway service', { labelFontSize: 20 })],
    [
      'serif',
      stencil('Gateway service', { labelFontFamily: 'Georgia, serif' }),
    ],
    ['wide icon', stencil(STENCIL_LABEL, { width: 160, x: -48 })],
    [
      'negative size',
      stencil('Flipped', { width: -64, height: -64, x: 64, y: 64 }),
    ],
    ['rotated', stencil('Rotated', { rotation: Math.PI / 2 })],
    ['zero size', stencil('Zero', { width: 0, height: 0 })],
    ['unicode', stencil('Caffè 日本語 \u{1F680} name')],
    [
      'embedded',
      {
        ...stencil('Amazon S3'),
        source: {
          kind: 'embedded',
          src: 'data:image/svg+xml;base64,PHN2Zy8+',
          pack: 'aws',
          name: 'Amazon S3',
        },
      } as StencilElement,
    ],
  ];
  for (const [name, el] of variants) {
    fam.add(
      `lines ${name}`,
      'getStencilLabelLines',
      { el },
      getStencilLabelLines(el),
    );
    fam.add(
      `height ${name}`,
      'getStencilLabelHeight',
      { el },
      getStencilLabelHeight(el),
    );
    fam.add(
      `box ${name}`,
      'getStencilLabelBox',
      { el },
      getStencilLabelBox(el),
    );
    fam.add(
      `connector box ${name}`,
      'getConnectorBox',
      { el },
      getConnectorBox(el),
    );
  }

  // tests/stencil_label_routing.test.ts
  const routing = (
    target: { x: number; y: number },
    mode: 'elbow' | 'straight',
  ): { elements: Element[]; line: LineElement } => {
    const icon = createStencil(
      'llm',
      { kind: 'builtin', ref: 'generic/server' },
      32,
      32,
      BASE,
      STENCIL_LABEL,
    );
    const target2 = rect('rect', target.x, target.y);
    const line: LineElement = {
      ...BASE,
      id: 'line',
      type: 'line',
      x: 32,
      y: 32,
      x2: target.x + 80,
      y2: target.y + 35,
      arrowHead: 'end',
      routing: mode,
      startElementId: 'llm',
      endElementId: 'rect',
    };
    return { elements: [icon, target2, line], line };
  };
  const scenes: Array<
    [string, { x: number; y: number }, 'elbow' | 'straight']
  > = [
    [
      'test: starts an elbow going down below the label',
      { x: -48, y: 400 },
      'elbow',
    ],
    [
      'test: turns past the label when leaving sideways',
      { x: 500, y: 120 },
      'elbow',
    ],
    [
      'test: keeps a diagonal straight connector off the label',
      { x: 260, y: 260 },
      'straight',
    ],
    ['above the icon elbow', { x: -48, y: -300 }, 'elbow'],
    ['left of the icon elbow', { x: -500, y: 40 }, 'elbow'],
    ['below and right straight', { x: 300, y: 500 }, 'straight'],
    ['overlapping the label elbow', { x: -40, y: 70 }, 'elbow'],
  ];
  for (const [name, target, mode] of scenes) {
    const { elements, line } = routing(target, mode);
    fam.add(
      `${name} route`,
      'resolveConnectorRoute',
      { el: line, allElements: elements },
      resolveConnectorRoute(line, elements),
    );
  }
  const { elements } = routing({ x: -48, y: 400 }, 'elbow');
  const icon = elements[0] as StencilElement;
  fam.add(
    'test: wraps the label and counts the wrapped lines in its box (lines)',
    'getStencilLabelLines',
    { el: icon },
    getStencilLabelLines(icon),
  );
  fam.add(
    'test: wraps the label and counts the wrapped lines in its box (box)',
    'getStencilLabelBox',
    { el: icon },
    getStencilLabelBox(icon),
  );
  fam.add(
    'test: wraps the label and counts the wrapped lines in its box (connector box)',
    'getConnectorBox',
    { el: icon },
    getConnectorBox(icon),
  );
  // A labeled connector leaving a labeled stencil: both label kinds at once.
  const both = routing({ x: 500, y: 120 }, 'elbow').elements.map((el) =>
    el.id === 'line' ? { ...el, label: 'inference' } : el,
  );
  fam.add(
    'stencil label and connector label',
    'getConnectorLabelBoxes',
    { elements: both },
    boxesOf(both),
  );
}

export function buildLabels(): Family {
  const fam = new Family('labels', {
    inputs:
      'TS parameter names. getConnectorLabelBoxes {elements} returns an object keyed by connector id ' +
      '(the Map entries; key order is not significant), each {x, y, w, h} with x, y the label center. ' +
      'shapeLabelLayout {el}: w, h = normalizeRect(el) size; wrapWidth = getLabelWrapWidth(el, w, h); ' +
      'lines = wrapTextLines(el.label, wrapWidth, el.labelFontSize ?? 16, el.labelFontFamily ?? ' +
      '"Arial, sans-serif", false, true). Routes are arrays of [x, y].',
  });
  connectorCases(fam);
  shapeLabelCases(fam);
  stencilCases(fam);
  return fam;
}
