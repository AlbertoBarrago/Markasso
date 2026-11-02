/**
 * `svg` family: the export module (src/rendering/export.ts).
 *
 * - `sceneToSVG(elements, options)`: the exact output string (or null), on
 *   one scene per element type and variant, on every option combination,
 *   on composite diagrams (the scenes of tests/svg_export.test.ts and
 *   tests/export_parity.test.ts) and on the `.markasso` corpus scenes
 *   (scripts/fixtures/corpus.ts). The bundled Kubernetes pack is loaded
 *   first, so its icons export as images, as in the app once loaded.
 * - `exportPNG(scene, withBackground)`: only the geometry the export
 *   computes, recorded on a fake canvas: the canvas size it assigns and the
 *   context calls made before the first element is drawn.
 * - `exportHTML(scene)`: the exact HTML string, with the PNG data URL
 *   stubbed (see the header).
 */
import type { Scene } from '../../src/core/scene';
import {
  ARROW_HEAD_STYLES,
  type Element,
  SHAPE_KINDS,
} from '../../src/elements/element';
import { loadBundledPack } from '../../src/elements/stencils/packs';
import { createStencil } from '../../src/elements/stencils/registry';
import {
  exportHTML,
  exportPNG,
  type SceneToSVGOptions,
  sceneToSVG,
} from '../../src/rendering/export';
import { recordingContext } from './canvas_recorder';
import { Family } from './common';
import {
  allTypes,
  bigScene,
  extrasScene,
  fieldsScene,
  unicodeScene,
} from './corpus';
import { makeScene, SAMPLE_NAMES, sample } from './samples';

const BASE = {
  strokeColor: '#e2e2ef',
  fillColor: 'transparent',
  strokeWidth: 2,
  opacity: 1,
  roughness: 0,
} as const;

const DARK: SceneToSVGOptions = {
  canvasColor: '#080808',
  withBackground: true,
};
const OPTION_SETS: ReadonlyArray<
  [string, { canvasColor: string; withBackground: boolean }]
> = [
  ['dark', DARK],
  ['dark no background', { canvasColor: '#080808', withBackground: false }],
  ['light', { canvasColor: '#ffffff', withBackground: true }],
  ['light no background', { canvasColor: '#ffffff', withBackground: false }],
];

const PNG_STUB = 'data:image/png;base64,U1RVQg==';

function clean<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/** tests/svg_export.test.ts `diagram()`. */
function svgTestDiagram(): Element[] {
  return [
    {
      ...BASE,
      id: 'a',
      type: 'rectangle',
      x: 0,
      y: 0,
      width: 120,
      height: 60,
      label: 'API <gateway> & "edge"',
    },
    {
      ...BASE,
      id: 'db',
      type: 'shape',
      kind: 'database',
      x: 300,
      y: 200,
      width: 120,
      height: 80,
      label: 'Orders',
    },
    createStencil(
      's',
      { kind: 'builtin', ref: 'generic/server' },
      600,
      30,
      BASE,
      'Server',
    ),
    {
      ...BASE,
      id: 'l',
      type: 'line',
      x: 0,
      y: 0,
      x2: 0,
      y2: 0,
      arrowHead: 'end',
      routing: 'elbow',
      startElementId: 'a',
      endElementId: 'db',
      label: 'query',
    },
  ] as Element[];
}

/** tests/export_parity.test.ts `document()`. */
function parityDocument(): Element[] {
  const node = (
    id: string,
    type: string,
    x: number,
    y: number,
    width: number,
    height: number,
    label: string,
    extra: Record<string, unknown> = {},
  ) => ({ ...BASE, id, type, x, y, width, height, label, ...extra });
  return [
    node(
      'api',
      'rectangle',
      0,
      0,
      160,
      90,
      'API gateway with a label long enough to wrap twice',
    ),
    node('check', 'rhombus', 400, 0, 180, 110, 'Authorized?'),
    node('cache', 'ellipse', 0, 300, 160, 80, 'Cache layer'),
    node('db', 'shape', 400, 300, 140, 90, 'Orders database', {
      kind: 'database',
    }),
    createStencil(
      'llm',
      { kind: 'builtin', ref: 'generic/server' },
      232,
      532,
      BASE,
      'Modello linguistico\nlocale: gemma3:12b (Ollama)\nproduzione: GPT 4.1, AI Factory Azure',
    ),
    {
      ...BASE,
      id: 'title',
      type: 'text',
      x: 0,
      y: -120,
      width: 260,
      height: 60,
      content: 'Architecture\nof the system',
      fontSize: 20,
      fontFamily: 'Arial, sans-serif',
      textAlign: 'center',
      bold: true,
    },
    {
      ...BASE,
      id: 'straight',
      type: 'line',
      x: 80,
      y: 45,
      x2: 490,
      y2: 55,
      arrowHead: 'end',
      routing: 'straight',
      startElementId: 'api',
      endElementId: 'check',
      label: 'auth',
    },
    {
      ...BASE,
      id: 'elbow',
      type: 'line',
      x: 80,
      y: 340,
      x2: 470,
      y2: 345,
      arrowHead: 'end',
      routing: 'elbow',
      startElementId: 'cache',
      endElementId: 'db',
      label: 'miss',
    },
    {
      ...BASE,
      id: 'arrow',
      type: 'arrow',
      x: 490,
      y: 55,
      x2: 470,
      y2: 345,
      startElementId: 'check',
      endElementId: 'db',
      label: 'yes',
    },
  ] as Element[];
}

/** Single-element variants: one scene each, exported with the dark options. */
function variants(): Array<[string, Element[]]> {
  const out: Array<[string, Element[]]> = [];
  const one = (name: string, el: Record<string, unknown>) =>
    out.push([name, [el as unknown as Element]]);
  const rect = {
    ...BASE,
    id: 'r',
    type: 'rectangle',
    x: 10,
    y: 20,
    width: 120,
    height: 60,
  };
  one('rectangle plain', rect);
  one('rectangle filled dashed', {
    ...rect,
    fillColor: '#a5d8ff',
    strokeStyle: 'dashed',
  });
  one('rectangle dotted width 3', {
    ...rect,
    strokeStyle: 'dotted',
    strokeWidth: 3,
  });
  one('rectangle corner radius 8', { ...rect, cornerRadius: 8 });
  one('rectangle corner radius clamped', { ...rect, cornerRadius: 500 });
  one('rectangle negative size', { ...rect, width: -120, height: -60 });
  one('rectangle rotated', { ...rect, rotation: 0.7 });
  one('rectangle rotated negative', { ...rect, rotation: -2.5 });
  one('rectangle opacity', { ...rect, opacity: 0.35 });
  one('rectangle fractional', {
    ...rect,
    x: 10.123456,
    y: -3.335,
    width: 99.995,
    height: 0.004,
  });
  one('rectangle label escaped', { ...rect, label: 'A <b> & "c" \'d\'' });
  one('rectangle label colors', {
    ...rect,
    fillColor: '#ffffff',
    label: 'Contrast',
  });
  one('rectangle label color set', {
    ...rect,
    label: 'Red',
    labelColor: '#ff0000',
    labelFontSize: 22,
    labelFontFamily: 'Georgia, serif',
  });
  one('rectangle long word label', {
    ...rect,
    label: 'siasdasdasdasdasdasdasdasd',
  });
  one('rectangle color escaping', {
    ...rect,
    strokeColor: '"><x',
    fillColor: 'a&b',
  });
  const ellipse = {
    ...BASE,
    id: 'e',
    type: 'ellipse',
    x: 0,
    y: 0,
    width: 100,
    height: 80,
  };
  one('ellipse plain', ellipse);
  one('ellipse label', { ...ellipse, label: 'Round label that wraps' });
  one('ellipse negative size rotated', {
    ...ellipse,
    width: -100,
    height: -80,
    rotation: 1,
  });
  const rhombus = {
    ...BASE,
    id: 'd',
    type: 'rhombus',
    x: 0,
    y: 0,
    width: 120,
    height: 90,
  };
  one('rhombus plain', rhombus);
  one('rhombus label filled', {
    ...rhombus,
    fillColor: '#222222',
    label: 'Decision?',
  });
  one('rhombus rotated', { ...rhombus, rotation: Math.PI / 4 });
  for (const kind of SHAPE_KINDS) {
    one(`shape ${kind}`, {
      ...BASE,
      id: 's',
      type: 'shape',
      kind,
      x: 0,
      y: 0,
      width: 140,
      height: 90,
      fillColor: '#ffeeaa',
      label: `${kind} label`,
    });
  }
  one('shape rotated dashed', {
    ...BASE,
    id: 's',
    type: 'shape',
    kind: 'document',
    x: 0,
    y: 0,
    width: 140,
    height: 90,
    rotation: 0.3,
    strokeStyle: 'dashed',
    label: 'Doc',
  });
  const icon = (
    ref: string,
    label: string,
    extra: Record<string, unknown> = {},
  ) => ({
    ...createStencil('i', { kind: 'builtin', ref }, 32, 32, BASE, label),
    ...extra,
  });
  one('stencil generic', icon('generic/server', 'Server'));
  one(
    'stencil generic filled',
    icon('generic/database', 'DB', { fillColor: '#00ff00' }),
  );
  one('stencil generic no label', icon('generic/api', ''));
  one(
    'stencil generic long label',
    icon(
      'generic/cloud',
      'Modello linguistico\nlocale: gemma3:12b (Ollama)\nproduzione: GPT 4.1, AI Factory Azure',
    ),
  );
  one(
    'stencil generic wide box',
    icon('generic/user', 'User', { width: 120, height: 40 }),
  );
  one(
    'stencil generic rotated',
    icon('generic/server', 'Rotated', { rotation: 1.2 }),
  );
  one(
    'stencil generic negative size',
    icon('generic/server', 'Flip', { width: -64, height: -64 }),
  );
  one(
    'stencil generic stroke width 4',
    icon('generic/queue', 'Queue', { strokeWidth: 4, opacity: 0.5 }),
  );
  one('stencil unknown generic', icon('generic/nope', 'Missing'));
  one('stencil unknown pack', icon('aws/s3', 'S3'));
  one('stencil k8s', icon('k8s/pod', 'Pod'));
  one('stencil embedded', {
    ...icon('generic/server', 'Amazon S3'),
    source: {
      kind: 'embedded',
      src: 'data:image/svg+xml;base64,PHN2Zy8+',
      pack: 'aws',
      name: 'S3',
    },
  });
  one(
    'stencil label color and font',
    icon('generic/server', 'Styled', {
      labelColor: '#123456',
      labelFontSize: 20,
      labelFontFamily: 'Georgia, serif',
    }),
  );
  const line = { ...BASE, id: 'l', type: 'line', x: 0, y: 0, x2: 200, y2: 50 };
  one('line plain', line);
  one('line dashed', { ...line, strokeStyle: 'dashed' });
  one('line dotted', { ...line, strokeStyle: 'dotted' });
  one('line curved', { ...line, cx: 100, cy: -60 });
  one('line curved arrow end', { ...line, cx: 100, cy: -60, arrowHead: 'end' });
  one('line arrow both', { ...line, arrowHead: 'both' });
  one('line arrow start', { ...line, arrowHead: 'start' });
  one('line rotated', { ...line, rotation: 0.4, arrowHead: 'end' });
  one('line zero length', { ...line, x2: 0, y2: 0, arrowHead: 'end' });
  one('line elbow unbound', { ...line, routing: 'elbow', arrowHead: 'end' });
  one('line label', { ...line, label: 'label', arrowHead: 'end' });
  one('line multi line label', {
    ...line,
    label: 'two\nlines',
    labelColor: '#ff0000',
    labelFontSize: 16,
  });
  one('line id needing mask sanitizing', {
    ...line,
    id: 'a b/c"d',
    arrowHead: 'end',
    endHeadStyle: 'triangleFilled',
  });
  for (const style of ARROW_HEAD_STYLES) {
    one(`line heads ${style}`, {
      ...line,
      arrowHead: 'both',
      startHeadStyle: style,
      endHeadStyle: style,
    });
    one(`elbow heads ${style}`, {
      ...line,
      routing: 'elbow',
      arrowHead: 'end',
      endHeadStyle: style,
    });
    one(`arrow head ${style}`, {
      ...BASE,
      id: 'a',
      type: 'arrow',
      x: 0,
      y: 0,
      x2: 150,
      y2: 100,
      endHeadStyle: style,
    });
  }
  const arrow = {
    ...BASE,
    id: 'a',
    type: 'arrow',
    x: 0,
    y: 0,
    x2: 150,
    y2: 100,
  };
  one('arrow plain', arrow);
  one('arrow dashed ignored', { ...arrow, strokeStyle: 'dashed' });
  one('arrow rotated', { ...arrow, rotation: -0.6 });
  one('arrow elbow', { ...arrow, routing: 'elbow' });
  one('arrow label', { ...arrow, label: 'go' });
  const text = {
    ...BASE,
    id: 't',
    type: 'text',
    x: 0,
    y: 0,
    width: 200,
    height: 24,
    content: 'Hello world',
    fontSize: 20,
    fontFamily: 'Arial, sans-serif',
  };
  one('text plain', text);
  one('text center', { ...text, textAlign: 'center' });
  one('text right', { ...text, textAlign: 'right' });
  one('text bold italic', { ...text, bold: true, italic: true });
  one('text underline strikethrough', {
    ...text,
    underline: true,
    strikethrough: true,
  });
  one('text multi line wrap', {
    ...text,
    width: 80,
    height: 100,
    content: 'A longer text that wraps\nand a second paragraph',
  });
  one('text escaped', { ...text, content: '<tag> & "quote"' });
  one('text background', { ...text, fillColor: '#333333' });
  one('text rotated background', {
    ...text,
    fillColor: '#333333',
    rotation: 0.5,
  });
  one('text code', {
    ...text,
    content: 'const a = 1;\n  return a;',
    fontFamily: '"Courier New", monospace',
    isCode: true,
    width: 200,
    height: 60,
  });
  one('text sticky note', {
    ...text,
    width: 200,
    height: 180,
    padding: 12,
    fillColor: '#FFD966',
    strokeColor: '#5c4a00',
    content:
      'Sticky note with a long line that has to wrap and anoverlongwordthatbreaksbycharacter',
    shadowBlur: 6,
    shadowColor: 'rgba(0,0,0,0.25)',
    shadowOffsetX: 3,
    shadowOffsetY: 3,
    textAlign: 'center',
  });
  one('text unicode', { ...text, content: 'Caffè 日本語 \u{1F680}' });
  one('text empty lines', { ...text, content: '\n\nthird', height: 72 });
  const image = {
    ...BASE,
    id: 'im',
    type: 'image',
    x: 0,
    y: 0,
    width: 160,
    height: 120,
    src: 'data:image/png;base64,iVBORw0KGgo=',
    naturalWidth: 640,
    naturalHeight: 480,
  };
  one('image plain', image);
  one('image rotated negative size', {
    ...image,
    width: -160,
    rotation: 0.25,
    opacity: 0.8,
  });
  const freehand = (points: number[][]) => ({
    ...BASE,
    id: 'f',
    type: 'freehand',
    x: points[0]?.[0] ?? 0,
    y: points[0]?.[1] ?? 0,
    points,
  });
  one('freehand one point', freehand([[5, 5]]));
  one(
    'freehand two points',
    freehand([
      [0, 0],
      [10.555, 20.004],
    ]),
  );
  one(
    'freehand many points',
    freehand([
      [0, 0],
      [10, 5],
      [20, 15],
      [35, 12],
      [50, 30],
      [52.5, 31.25],
    ]),
  );
  one('freehand pressures rotated', {
    ...freehand([
      [0, 0],
      [10, 5],
      [20, 15],
    ]),
    pressures: [0.2, 0.9, 0.4],
    rotation: 1,
  });
  const polygon = (points: number[][], closed: boolean) => ({
    ...BASE,
    id: 'p',
    type: 'polygon',
    x: 0,
    y: 0,
    points,
    closed,
  });
  one(
    'polygon closed',
    polygon(
      [
        [0, 0],
        [80, 0],
        [40, 60],
      ],
      true,
    ),
  );
  one('polygon open dashed', {
    ...polygon(
      [
        [0, 0],
        [80, 0],
        [40, 60],
      ],
      false,
    ),
    strokeStyle: 'dashed',
    fillColor: '#ff0000',
  });
  one('polygon dotted fractional', {
    ...polygon(
      [
        [0.1, 0.2],
        [80.333, 0],
        [40, 60.07],
      ],
      true,
    ),
    strokeStyle: 'dotted',
  });
  one('polygon one point', polygon([[0, 0]], true));
  const curve = {
    ...BASE,
    id: 'c',
    type: 'curve',
    x: 0,
    y: 0,
    x2: 200,
    y2: 0,
    cx: 100,
    cy: -80,
  };
  one('curve plain', curve);
  one('curve dashed', { ...curve, strokeStyle: 'dashed' });
  one('curve dotted fractional', {
    ...curve,
    strokeStyle: 'dotted',
    cx: 100.1,
    cy: -80.2,
  });
  return out;
}

/** Bound connectors: every routing and binding on a small scene. */
function connectorScenes(): Array<[string, Element[]]> {
  const a = {
    ...BASE,
    id: 'A',
    type: 'rectangle',
    x: 0,
    y: 0,
    width: 120,
    height: 60,
    label: 'A',
  };
  const b = {
    ...BASE,
    id: 'B',
    type: 'ellipse',
    x: 300,
    y: 200,
    width: 120,
    height: 80,
    label: 'B',
  };
  const c = createStencil(
    'C',
    { kind: 'builtin', ref: 'generic/server' },
    600,
    40,
    BASE,
    'Service C',
  );
  const nodes = [a, b, c] as unknown as Element[];
  const conn = (
    id: string,
    from: string,
    to: string,
    extra: Record<string, unknown>,
  ) =>
    ({
      ...BASE,
      id,
      type: 'line',
      x: 0,
      y: 0,
      x2: 0,
      y2: 0,
      startElementId: from,
      endElementId: to,
      arrowHead: 'end',
      ...extra,
    }) as unknown as Element;
  return [
    [
      'bound straight',
      [
        ...nodes,
        conn('l', 'A', 'B', { routing: 'straight', label: 'straight' }),
      ],
    ],
    [
      'bound elbow',
      [...nodes, conn('l', 'A', 'B', { routing: 'elbow', label: 'elbow' })],
    ],
    [
      'bound curved',
      [...nodes, conn('l', 'A', 'B', { cx: 100, cy: 250, label: 'curved' })],
    ],
    [
      'bound anchors',
      [
        ...nodes,
        conn('l', 'A', 'B', {
          routing: 'elbow',
          startAnchor: { x: 0.5, y: 1 },
          endAnchor: { x: 0, y: 0.5 },
        }),
      ],
    ],
    [
      'bound to stencil label',
      [
        ...nodes,
        conn('l', 'A', 'C', { routing: 'elbow', label: 'to icon' }),
        conn('m', 'C', 'B', { routing: 'straight' }),
      ],
    ],
    [
      'bound arrow element',
      [
        ...nodes,
        {
          ...BASE,
          id: 'ar',
          type: 'arrow',
          x: 0,
          y: 0,
          x2: 0,
          y2: 0,
          startElementId: 'A',
          endElementId: 'B',
          label: 'arrow',
        } as unknown as Element,
      ],
    ],
    [
      'dangling binding',
      [
        a as unknown as Element,
        conn('l', 'A', 'missing', { x2: 400, y2: 400, routing: 'elbow' }),
      ],
    ],
    [
      'hidden connector label',
      [...nodes, conn('l', 'A', 'B', { label: 'hidden', visible: false })],
    ],
  ];
}

/** Minimal `Image` for the image cache: never loads. */
class NeverLoadingImage {
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  complete = false;
  naturalWidth = 0;
  naturalHeight = 0;
  src = '';
}

/**
 * Runs `exportPNG` / `exportHTML` with stubbed DOM globals. The canvas
 * context is the `draw` family's recorder, so the whole export runs as in a
 * browser; only the calls before the first element draws are kept.
 */
function withExportStubs<T>(
  canvasBg: string,
  run: (captured: {
    canvas: { width?: number; height?: number } | null;
    html: string | null;
  }) => T,
): { result: T; calls: unknown[][] } {
  const g = globalThis as Record<string, unknown>;
  const savedProps = new Map<string, PropertyDescriptor | undefined>();
  const stub = (key: string, value: unknown) => {
    savedProps.set(key, Object.getOwnPropertyDescriptor(g, key));
    Object.defineProperty(g, key, {
      value,
      configurable: true,
      writable: true,
    });
  };
  const saved = {
    createObjectURL: URL.createObjectURL,
    revokeObjectURL: URL.revokeObjectURL,
  };
  const captured = {
    canvas: null as { width?: number; height?: number } | null,
    html: null as string | null,
  };
  const { ctx, recording } = recordingContext();
  // canvas.width / height are `unsigned long` attributes: a browser stores
  // ToUint32 of the assigned value, so fractional sizes are truncated.
  let width = 300;
  let height = 150;
  const canvas = {
    getContext: () => ctx,
    toDataURL: () => PNG_STUB,
    get width() {
      return width;
    },
    set width(value: number) {
      width = value >>> 0;
    },
    get height() {
      return height;
    },
    set height(value: number) {
      height = value >>> 0;
    },
  } as Record<string, unknown>;
  stub('document', {
    documentElement: { getAttribute: () => null },
    createElement: (tag: string) => {
      if (tag === 'canvas') {
        captured.canvas = canvas as { width?: number; height?: number };
        return canvas;
      }
      return { click() {} };
    },
  });
  stub('getComputedStyle', () => ({ getPropertyValue: () => canvasBg }));
  stub('Image', NeverLoadingImage);
  stub(
    'Blob',
    class {
      constructor(parts: string[]) {
        captured.html = parts.join('');
      }
    },
  );
  // The revoke timer would outlive the stubs: drop it.
  stub('setTimeout', () => 0);
  URL.createObjectURL = () => 'blob:svg-fixture';
  URL.revokeObjectURL = () => {};
  try {
    const result = run(captured);
    // Setup calls: the prefix up to the export's translate.
    const calls: unknown[][] = [];
    for (const call of recording.calls) {
      const [name, ...args] = call;
      if (name === 'fillRect') {
        const state = recording.states[args.pop() as number]!;
        calls.push([name, ...args, state.fillStyle]);
      } else if (name === 'scale') {
        calls.push(call);
      } else if (name === 'translate') {
        calls.push(call);
        break;
      } else {
        break;
      }
    }
    return { result, calls };
  } finally {
    URL.createObjectURL = saved.createObjectURL;
    URL.revokeObjectURL = saved.revokeObjectURL;
    for (const [key, desc] of savedProps) {
      if (desc) Object.defineProperty(g, key, desc);
      else delete g[key];
    }
  }
}

function pngGeometry(
  elements: Element[],
  withBackground: boolean,
  canvasBg: string,
) {
  const { result, calls } = withExportStubs(canvasBg, (captured) => {
    exportPNG(makeScene(elements) as Scene, withBackground);
    return captured.canvas;
  });
  if (!result) return null;
  return { width: result.width, height: result.height, calls };
}

function htmlExport(elements: Element[], canvasBg: string) {
  let html: string | null = null;
  const { result, calls } = withExportStubs(canvasBg, (captured) => {
    exportHTML(makeScene(elements) as Scene);
    html = captured.html;
    return captured.canvas;
  });
  if (!result) return null;
  return { width: result.width, height: result.height, calls, html };
}

export async function buildSvg(): Promise<Family> {
  await loadBundledPack('k8s');
  const fam = new Family('svg', {
    inputs:
      'sceneToSVG {elements, options: {canvasColor, withBackground}}: output is the exact string, or null. ' +
      'The bundled k8s pack is loaded before any case runs. exportPNG {elements, withBackground, canvasBg} ' +
      'and exportHTML {elements, canvasBg}: the export runs on a stub DOM; canvasBg is what ' +
      'getComputedStyle(documentElement).getPropertyValue("--canvas-bg") returns (before trim). Output null ' +
      'when no canvas was created (empty scene), else {width, height, calls[, html]}: width and height are ' +
      'canvas.width / canvas.height after the export set them (stored as ToUint32 of the assigned value, as a ' +
      'browser does: fractions truncated), calls are ' +
      'the context calls before the first element draws: ["fillRect", x, y, w, h, fillStyle] (fillStyle at ' +
      'that moment), ["scale", sx, sy], ["translate", tx, ty] (recording stops after it). html is the exact ' +
      `document handed to the Blob, with canvas.toDataURL() stubbed to "${PNG_STUB}".`,
  });
  const svg = (
    name: string,
    elements: Element[],
    options: SceneToSVGOptions = DARK,
  ) =>
    fam.add(
      name,
      'sceneToSVG',
      { elements: clean(elements), options },
      sceneToSVG(clean(elements), options),
    );

  // Options on a small diagram and on the empty scene.
  for (const [label, options] of OPTION_SETS) {
    svg(`test: diagram ${label}`, svgTestDiagram(), options);
    svg(`empty scene ${label}`, [], options);
  }
  svg('canvas color escaping', svgTestDiagram(), {
    canvasColor: 'a"b<c>&d',
    withBackground: true,
  });
  svg('canvas color rgba', svgTestDiagram(), {
    canvasColor: 'rgba(8, 8, 8, 0.5)',
    withBackground: false,
  });

  // tests/svg_export.test.ts
  const [first] = svgTestDiagram();
  svg('test: breaks an overlong word inside a shape label', [
    { ...first!, label: 'siasdasdasdasdasdasdasdasd' } as Element,
  ]);
  svg('test: rounds rectangle corners like the canvas', [
    { ...first!, cornerRadius: 8 } as Element,
  ]);
  svg('test: export parity document', parityDocument());
  svg('test: export parity document light', parityDocument(), {
    canvasColor: '#ffffff',
    withBackground: true,
  });

  // One element per type and variant.
  for (const [name, elements] of variants()) svg(name, elements);
  for (const [name, elements] of connectorScenes()) {
    svg(name, elements);
    svg(`${name} light`, elements, {
      canvasColor: '#ffffff',
      withBackground: false,
    });
  }
  // Every sample element alone.
  for (const name of SAMPLE_NAMES) {
    const el = sample(name) as unknown as Record<string, unknown>;
    delete el.startElementId;
    delete el.endElementId;
    delete el.startAnchor;
    delete el.endAnchor;
    svg(`sample ${name}`, [el as unknown as Element]);
  }

  // Corpus scenes.
  svg('corpus: all element types', allTypes());
  svg('corpus: unicode labels and text', unicodeScene());
  svg('corpus: unknown element fields', extrasScene());
  svg('corpus: every optional field', fieldsScene());
  svg('corpus: every optional field light', fieldsScene(), {
    canvasColor: '#ffffff',
    withBackground: false,
  });
  svg('corpus: first 300 of the 5000 elements board', bigScene(300));

  // PNG and HTML exports.
  const scenes: Array<[string, Element[]]> = [
    ['empty', []],
    ['diagram', svgTestDiagram()],
    ['parity document', parityDocument()],
    ['all element types', allTypes()],
    [
      'fractional bounds',
      [
        {
          ...BASE,
          id: 'r',
          type: 'rectangle',
          x: 0.3,
          y: -0.7,
          width: 10.45,
          height: 3.3,
        } as Element,
      ],
    ],
  ];
  for (const [name, elements] of scenes) {
    for (const [bgName, bg] of [
      ['default background', ''],
      ['light background', ' #ffffff '],
    ] as const) {
      for (const withBackground of [true, false]) {
        fam.add(
          `png ${name} ${bgName}${withBackground ? '' : ' transparent'}`,
          'exportPNG',
          { elements: clean(elements), withBackground, canvasBg: bg },
          pngGeometry(clean(elements), withBackground, bg),
        );
      }
      fam.add(
        `html ${name} ${bgName}`,
        'exportHTML',
        { elements: clean(elements), canvasBg: bg },
        htmlExport(clean(elements), bg),
      );
    }
  }
  return fam;
}
