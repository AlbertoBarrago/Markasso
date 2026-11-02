/**
 * `draw` family: draw-call recordings of `drawElement`, `drawConnectorLabels`
 * (src/rendering/draw_element.ts) and `drawGrid` (src/rendering/draw_grid.ts)
 * on a recording context (scripts/fixtures/canvas_recorder.ts). One scene per
 * element type and variant (labels, stencils, images, text decorations,
 * connector heads and routes), roughness on and off, light and dark theme.
 *
 * Browser APIs are stubbed deterministically (described in the header):
 * `document` (theme), `Image` (image cache), `window.devicePixelRatio`
 * (grid) and the context's `measureText`. `src/` is not changed.
 */

import type { Element } from '../../src/elements/element';
import { ARROW_HEAD_STYLES, SHAPE_KINDS } from '../../src/elements/element';
import {
  getBundledIcon,
  loadBundledPack,
} from '../../src/elements/stencils/packs';
import { createStencil } from '../../src/elements/stencils/registry';
import {
  drawConnectorLabels,
  drawElement,
} from '../../src/rendering/draw_element';
import { drawGrid } from '../../src/rendering/draw_grid';
import { getCachedImage } from '../../src/rendering/image_cache';
import { invalidateThemeCache } from '../../src/rendering/theme_cache';
import {
  CALL_ENCODING,
  MEASURE_TEXT_STUB,
  recordingContext,
  STATE_ENCODING,
} from './canvas_recorder';
import { Family, prng } from './common';

type Theme = 'light' | 'dark';
const THEMES: ReadonlyArray<Theme> = ['light', 'dark'];
const ROUGHNESS: ReadonlyArray<number> = [0, 1];

/** Background drawConnectorLabels paints under labels, per theme. */
const CANVAS_COLOR: Readonly<Record<Theme, string>> = {
  light: '#ffffff',
  dark: '#141414',
};

const PNG_LOADED = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB';
const PNG_LOADING = 'data:image/png;base64,bG9hZGluZw==';
const PNG_FAILED = 'data:image/png;base64,YnJva2Vu';
const SVG_LOADED =
  'data:image/svg+xml;base64,PHN2ZyB2aWV3Qm94PSIwIDAgNDggMzIiLz4=';
const SVG_LOADING = 'data:image/svg+xml;base64,PHN2Zy8+';
const K8S_POD = 'k8s/pod';

interface ImageEntry {
  readonly src: string;
  readonly state: 'loaded' | 'loading' | 'failed';
  readonly naturalWidth?: number;
  readonly naturalHeight?: number;
}

const BASE = {
  strokeColor: '#e2e2ef',
  fillColor: 'transparent',
  strokeWidth: 2,
  opacity: 1,
  roughness: 0,
} as const;

function el(fields: Record<string, unknown>): Element {
  return { ...BASE, ...fields } as Element;
}

interface Variant {
  readonly label: string;
  readonly elements: Element[];
  /** Element drawn (the others are context: bound connector targets). */
  readonly id: string;
  readonly editingShapeLabelId?: string;
}

function variants(): Variant[] {
  const out: Variant[] = [];
  const one = (label: string, e: Element, editing?: string) =>
    out.push({
      label,
      elements: [e],
      id: e.id,
      ...(editing && { editingShapeLabelId: editing }),
    });
  const box = { x: 40, y: 30, width: 160, height: 90 };

  // rectangle
  one('rectangle plain', el({ id: 'r1', type: 'rectangle', ...box }));
  one(
    'rectangle corner radius label',
    el({
      id: 'r2',
      type: 'rectangle',
      ...box,
      fillColor: '#ffd966',
      cornerRadius: 12,
      label: 'Start',
    }),
  );
  one(
    'rectangle dashed wrapped label color',
    el({
      id: 'r3',
      type: 'rectangle',
      ...box,
      strokeWidth: 3,
      strokeStyle: 'dashed',
      fillColor: '#1e3a5f',
      label: 'A rather long label that wraps over several lines inside',
      labelFontSize: 18,
      labelFontFamily: 'Georgia, serif',
      labelColor: '#ff8800',
    }),
  );
  one(
    'rectangle dotted',
    el({ id: 'r4', type: 'rectangle', ...box, strokeStyle: 'dotted' }),
  );
  one(
    'rectangle default shadow',
    el({ id: 'r5', type: 'rectangle', ...box, shadowBlur: 8 }),
  );
  one(
    'rectangle custom shadow',
    el({
      id: 'r6',
      type: 'rectangle',
      ...box,
      shadowBlur: 4,
      shadowColor: 'rgba(0, 0, 0, 0.5)',
      shadowOffsetX: -2,
      shadowOffsetY: 6,
    }),
  );
  one(
    'rectangle colored shadow',
    el({
      id: 'r7',
      type: 'rectangle',
      ...box,
      shadowBlur: 10,
      shadowColor: '#ff000080',
    }),
  );
  one(
    'rectangle rotated',
    el({ id: 'r8', type: 'rectangle', ...box, rotation: 0.6, label: 'Tilt' }),
  );
  one(
    'rectangle negative size big radius',
    el({
      id: 'r9',
      type: 'rectangle',
      x: 200,
      y: 120,
      width: -60,
      height: -40,
      cornerRadius: 100,
    }),
  );
  one(
    'rectangle opacity caps joins',
    el({
      id: 'r10',
      type: 'rectangle',
      ...box,
      opacity: 0.5,
      lineCap: 'square',
      lineJoin: 'miter',
      strokeColor: '#1e1e1e',
    }),
  );
  one(
    'rectangle label being edited',
    el({ id: 'r11', type: 'rectangle', ...box, label: 'Hidden' }),
    'r11',
  );
  one(
    'rectangle zero stroke',
    el({ id: 'r12', type: 'rectangle', ...box, strokeWidth: 0 }),
  );

  // ellipse
  one('ellipse plain', el({ id: 'e1', type: 'ellipse', ...box }));
  one(
    'ellipse filled label',
    el({
      id: 'e2',
      type: 'ellipse',
      ...box,
      fillColor: '#a5d8ff',
      label: 'Decision point',
    }),
  );
  one(
    'ellipse zero height',
    el({ id: 'e3', type: 'ellipse', ...box, height: 0 }),
  );
  one(
    'ellipse rotated dashed',
    el({
      id: 'e4',
      type: 'ellipse',
      ...box,
      rotation: -0.4,
      strokeStyle: 'dashed',
    }),
  );

  // rhombus
  one('rhombus plain', el({ id: 'd1', type: 'rhombus', ...box }));
  one(
    'rhombus corner radius label',
    el({
      id: 'd2',
      type: 'rhombus',
      ...box,
      cornerRadius: 10,
      fillColor: '#b2f2bb',
      label: 'Yes or no?',
    }),
  );
  one(
    'rhombus rotated',
    el({ id: 'd3', type: 'rhombus', ...box, rotation: Math.PI / 4 }),
  );

  // shape: every kind
  for (const kind of SHAPE_KINDS) {
    one(
      `shape ${kind}`,
      el({
        id: `s-${kind}`,
        type: 'shape',
        kind,
        ...box,
        fillColor: '#e7f5ff',
        label: 'Label text',
      }),
    );
  }
  one(
    'shape database tall',
    el({
      id: 's-tall',
      type: 'shape',
      kind: 'database',
      x: 0,
      y: 0,
      width: 60,
      height: 200,
    }),
  );
  one(
    'shape document rotated',
    el({
      id: 's-rot',
      type: 'shape',
      kind: 'document',
      ...box,
      rotation: 1.1,
      label: 'Rotated',
    }),
  );

  // stencil
  const style = { ...BASE };
  for (const id of ['server', 'api', 'user', 'database']) {
    out.push({
      label: `stencil generic ${id}`,
      elements: [
        createStencil(
          `gi-${id}`,
          { kind: 'builtin', ref: `generic/${id}` },
          100,
          100,
          style,
          id,
        ),
      ],
      id: `gi-${id}`,
    });
  }
  one(
    'stencil two-line label',
    el({
      id: 'gi-long',
      type: 'stencil',
      source: { kind: 'builtin', ref: 'generic/cache' },
      x: 0,
      y: 0,
      width: 64,
      height: 64,
      label: 'Primary cache cluster west',
      labelColor: '#ffaa00',
    }),
  );
  one(
    'stencil rotated thick stroke',
    el({
      id: 'gi-rot',
      type: 'stencil',
      source: { kind: 'builtin', ref: 'generic/queue' },
      x: 0,
      y: 0,
      width: 96,
      height: 48,
      strokeWidth: 6,
      rotation: 0.3,
    }),
  );
  one(
    'stencil label being edited',
    el({
      id: 'gi-edit',
      type: 'stencil',
      source: { kind: 'builtin', ref: 'generic/server' },
      x: 0,
      y: 0,
      width: 64,
      height: 64,
      label: 'Hidden',
    }),
    'gi-edit',
  );
  one(
    'stencil embedded loaded',
    el({
      id: 'vi1',
      type: 'stencil',
      source: { kind: 'embedded', src: SVG_LOADED, pack: 'azure', name: 'AKS' },
      x: 0,
      y: 0,
      width: 64,
      height: 64,
      label: 'AKS',
    }),
  );
  one(
    'stencil embedded loading',
    el({
      id: 'vi2',
      type: 'stencil',
      source: { kind: 'embedded', src: SVG_LOADING, pack: 'azure', name: 'X' },
      x: 0,
      y: 0,
      width: 80,
      height: 40,
    }),
  );
  one(
    'stencil bundled k8s',
    el({
      id: 'k1',
      type: 'stencil',
      source: { kind: 'builtin', ref: K8S_POD },
      x: 0,
      y: 0,
      width: 64,
      height: 64,
      label: 'pod',
    }),
  );
  one(
    'stencil unknown id in known pack',
    el({
      id: 'k2',
      type: 'stencil',
      source: { kind: 'builtin', ref: 'k8s/nothing' },
      x: 0,
      y: 0,
      width: 64,
      height: 64,
    }),
  );
  one(
    'stencil unknown pack',
    el({
      id: 'k3',
      type: 'stencil',
      source: { kind: 'builtin', ref: 'acme/widget' },
      x: 0,
      y: 0,
      width: 64,
      height: 64,
      label: 'Widget',
    }),
  );
  one(
    'stencil zero size',
    el({
      id: 'gi-zero',
      type: 'stencil',
      source: { kind: 'builtin', ref: 'generic/server' },
      x: 0,
      y: 0,
      width: 0,
      height: 0,
    }),
  );

  // text
  const text = {
    type: 'text',
    x: 20,
    y: 20,
    width: 200,
    height: 30,
    fontSize: 20,
    fontFamily: 'Arial, sans-serif',
    strokeWidth: 0,
  };
  one('text plain', el({ id: 't1', ...text, content: 'Hello world' }));
  one(
    'text wrapped',
    el({
      id: 't2',
      ...text,
      width: 120,
      height: 100,
      content: 'The quick brown fox jumps over the lazy dog',
    }),
  );
  one(
    'text center',
    el({ id: 't3', ...text, content: 'Centered\nlines', textAlign: 'center' }),
  );
  one(
    'text right bold italic',
    el({
      id: 't4',
      ...text,
      content: 'Right side',
      textAlign: 'right',
      bold: true,
      italic: true,
    }),
  );
  one(
    'text underline strikethrough center',
    el({
      id: 't5',
      ...text,
      content: 'Decorated text that wraps',
      width: 140,
      textAlign: 'center',
      underline: true,
      strikethrough: true,
      bold: true,
    }),
  );
  one(
    'text underline right small',
    el({
      id: 't5b',
      ...text,
      content: 'tiny',
      fontSize: 10,
      textAlign: 'right',
      underline: true,
    }),
  );
  one(
    'text sticky note',
    el({
      id: 't6',
      ...text,
      width: 200,
      height: 180,
      padding: 12,
      fontSize: 16,
      fillColor: '#FFD966',
      strokeColor: '#5c4a00',
      textAlign: 'center',
      content: 'Sticky note with a verylongwordthatmustbreakacrosslines',
    }),
  );
  one(
    'text code',
    el({
      id: 't7',
      ...text,
      width: 220,
      height: 80,
      isCode: true,
      fontFamily: '"Courier New", monospace',
      content: 'const a = 1;\n  return a;',
    }),
  );
  one(
    'text code centered',
    el({
      id: 't7b',
      ...text,
      width: 220,
      height: 80,
      isCode: true,
      textAlign: 'center',
      fontFamily: '"Courier New", monospace',
      content: 'x',
    }),
  );
  one(
    'text empty lines',
    el({ id: 't8', ...text, content: 'first\n\nthird\n' }),
  );
  one(
    'text background rotated',
    el({
      id: 't9',
      ...text,
      fillColor: '#222244',
      rotation: 0.25,
      content: 'Boxed',
      fontFamily: 'Georgia, serif',
    }),
  );

  // image
  const img = {
    type: 'image',
    x: 10,
    y: 10,
    width: 160,
    height: 120,
    naturalWidth: 640,
    naturalHeight: 480,
  };
  one('image loaded', el({ id: 'im1', ...img, src: PNG_LOADED }));
  one('image loading', el({ id: 'im2', ...img, src: PNG_LOADING }));
  one('image failed', el({ id: 'im3', ...img, src: PNG_FAILED }));
  one(
    'image rotated half opacity',
    el({ id: 'im4', ...img, src: PNG_LOADED, rotation: -0.7, opacity: 0.5 }),
  );

  // Connectors: two boxes to bind to.
  const a = el({
    id: 'A',
    type: 'rectangle',
    x: 0,
    y: 0,
    width: 120,
    height: 60,
  });
  const b = el({
    id: 'B',
    type: 'ellipse',
    x: 300,
    y: 160,
    width: 100,
    height: 80,
  });
  const bound = (label: string, conn: Element) =>
    out.push({ label, elements: [a, b, conn], id: conn.id });
  const free = { x: 20, y: 30, x2: 260, y2: 140 };

  one('line free plain', el({ id: 'l1', type: 'line', ...free }));
  for (const style of ARROW_HEAD_STYLES) {
    one(
      `line both heads ${style}`,
      el({
        id: `lh-${style}`,
        type: 'line',
        ...free,
        arrowHead: 'both',
        startHeadStyle: style,
        endHeadStyle: style,
        strokeWidth: 3,
      }),
    );
    one(
      `arrow head ${style}`,
      el({ id: `ah-${style}`, type: 'arrow', ...free, endHeadStyle: style }),
    );
  }
  one(
    'line start head only',
    el({ id: 'l2', type: 'line', ...free, arrowHead: 'start' }),
  );
  one(
    'line curved with end head',
    el({
      id: 'l3',
      type: 'line',
      ...free,
      cx: 200,
      cy: -20,
      arrowHead: 'end',
      endHeadStyle: 'triangleFilled',
    }),
  );
  one(
    'line dashed',
    el({ id: 'l4', type: 'line', ...free, strokeStyle: 'dashed' }),
  );
  one(
    'line very short',
    el({ id: 'l5', type: 'line', x: 10, y: 10, x2: 10.5, y2: 10.2 }),
  );
  bound(
    'line bound curved circle head',
    el({
      id: 'lb1',
      type: 'line',
      x: 120,
      y: 30,
      x2: 300,
      y2: 200,
      cx: 250,
      cy: 40,
      startElementId: 'A',
      endElementId: 'B',
      startAnchor: { x: 1, y: 0.5 },
      startHeadStyle: 'circle',
      arrowHead: 'start',
    }),
  );
  bound(
    'line bound elbow',
    el({
      id: 'lb2',
      type: 'line',
      x: 60,
      y: 60,
      x2: 350,
      y2: 160,
      routing: 'elbow',
      startElementId: 'A',
      endElementId: 'B',
      arrowHead: 'both',
      startHeadStyle: 'diamond',
      endHeadStyle: 'open',
    }),
  );
  bound(
    'arrow bound straight',
    el({
      id: 'ab1',
      type: 'arrow',
      x: 60,
      y: 30,
      x2: 350,
      y2: 200,
      startElementId: 'A',
      endElementId: 'B',
      label: 'calls',
    }),
  );
  bound(
    'arrow bound elbow pinned',
    el({
      id: 'ab2',
      type: 'arrow',
      x: 60,
      y: 60,
      x2: 350,
      y2: 160,
      routing: 'elbow',
      startElementId: 'A',
      endElementId: 'B',
      startAnchor: { x: 0.5, y: 1 },
      endAnchor: { x: 0, y: 0.5 },
      endHeadStyle: 'triangle',
    }),
  );
  one(
    'arrow elbow free',
    el({ id: 'af1', type: 'arrow', ...free, routing: 'elbow' }),
  );
  one(
    'arrow rotated',
    el({ id: 'af2', type: 'arrow', ...free, rotation: 0.5 }),
  );

  // curve, polygon
  one(
    'curve',
    el({
      id: 'c1',
      type: 'curve',
      x: 0,
      y: 100,
      x2: 200,
      y2: 100,
      cx: 100,
      cy: 20,
    }),
  );
  one(
    'curve dotted',
    el({
      id: 'c2',
      type: 'curve',
      x: 0,
      y: 100,
      x2: 200,
      y2: 100,
      cx: 100,
      cy: 20,
      strokeStyle: 'dotted',
    }),
  );
  const tri = [
    [300, 600],
    [380, 600],
    [340, 660],
  ];
  one(
    'polygon closed filled',
    el({
      id: 'p1',
      type: 'polygon',
      x: 300,
      y: 600,
      points: tri,
      closed: true,
      fillColor: '#ffc9c9',
    }),
  );
  one(
    'polygon open',
    el({
      id: 'p2',
      type: 'polygon',
      x: 300,
      y: 600,
      points: tri,
      closed: false,
    }),
  );
  one(
    'polygon single point',
    el({
      id: 'p3',
      type: 'polygon',
      x: 0,
      y: 0,
      points: [[0, 0]],
      closed: true,
    }),
  );

  // freehand
  const rand = prng(0x64726177);
  const walk: Array<[number, number]> = [[0, 0]];
  const pressures: number[] = [0.5];
  let angle = 0.3;
  for (let i = 1; i < 40; i++) {
    angle += (rand() - 0.5) * 0.8;
    const [px, py] = walk[i - 1]!;
    walk.push([px + Math.cos(angle) * 6, py + Math.sin(angle) * 6]);
    pressures.push(0.2 + rand() * 0.8);
  }
  one(
    'freehand pressure',
    el({
      id: 'f1',
      type: 'freehand',
      x: 0,
      y: 0,
      points: walk,
      pressures,
      strokeWidth: 4,
    }),
  );
  one(
    'freehand no pressure',
    el({ id: 'f2', type: 'freehand', x: 0, y: 0, points: walk.slice(0, 12) }),
  );
  one(
    'freehand two points',
    el({
      id: 'f3',
      type: 'freehand',
      x: 0,
      y: 0,
      points: [
        [0, 0],
        [30, 10],
      ],
      pressures: [0.3, 0.9],
    }),
  );
  one(
    'freehand single point',
    el({ id: 'f4', type: 'freehand', x: 5, y: 5, points: [[5, 5]] }),
  );
  return out;
}

/** Scenes for drawConnectorLabels. */
function labelScenes(): Array<[string, Element[], string | undefined]> {
  const a = el({
    id: 'A',
    type: 'rectangle',
    x: 0,
    y: 0,
    width: 120,
    height: 60,
  });
  const b = el({
    id: 'B',
    type: 'rectangle',
    x: 300,
    y: 200,
    width: 120,
    height: 60,
  });
  const c = el({
    id: 'C',
    type: 'ellipse',
    x: 0,
    y: 300,
    width: 100,
    height: 70,
  });
  const conn = (id: string, fields: Record<string, unknown>) =>
    el({ id, type: 'arrow', x: 0, y: 0, x2: 10, y2: 10, ...fields });
  const s1 = conn('a1', {
    startElementId: 'A',
    endElementId: 'B',
    label: 'calls',
  });
  const s2 = conn('a2', {
    startElementId: 'A',
    endElementId: 'C',
    routing: 'elbow',
    label: 'two\nlines',
    labelFontSize: 16,
    labelFontFamily: 'Georgia, serif',
    labelColor: '#ff0000',
    opacity: 0.6,
  });
  const s3 = el({
    id: 'l1',
    type: 'line',
    x: 120,
    y: 30,
    x2: 300,
    y2: 230,
    cx: 260,
    cy: 20,
    label: 'curved',
    strokeColor: '#1e1e1e',
  });
  const s4 = conn('a3', { x: 500, y: 0, x2: 500, y2: 300, label: '' });
  const crossing = conn('a4', {
    x: 0,
    y: 250,
    x2: 450,
    y2: 0,
    label: 'crossing label',
  });
  return [
    ['single straight', [a, b, s1], undefined],
    ['elbow two lines styled', [a, c, s2], undefined],
    ['curved line', [s3], undefined],
    ['empty label skipped', [s4], undefined],
    ['all together', [a, b, c, s1, s2, s3, s4, crossing], undefined],
    ['one being edited', [a, b, c, s1, s2], 'a1'],
    ['no connectors', [a, b], undefined],
  ];
}

const GRID_VIEWPORTS: ReadonlyArray<
  [string, { offsetX: number; offsetY: number; zoom: number }, number, number]
> = [
  ['default', { offsetX: 0, offsetY: 0, zoom: 1 }, 320, 200],
  ['offset zoom 1.5', { offsetX: 37.5, offsetY: -12.25, zoom: 1.5 }, 320, 200],
  ['zoom 0.3 doubling', { offsetX: -100, offsetY: 50, zoom: 0.3 }, 320, 200],
  ['zoom 0.05', { offsetX: 0, offsetY: 0, zoom: 0.05 }, 240, 160],
  ['zoom 4', { offsetX: 13, offsetY: 7, zoom: 4 }, 200, 120],
];

class StubImage {
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  complete = false;
  naturalWidth = 0;
  naturalHeight = 0;
  private source = '';
  static table = new Map<string, ImageEntry>();

  get src(): string {
    return this.source;
  }

  set src(value: string) {
    this.source = value;
    const entry = StubImage.table.get(value);
    if (entry?.state === 'loaded') {
      this.complete = true;
      this.naturalWidth = entry.naturalWidth!;
      this.naturalHeight = entry.naturalHeight!;
    } else if (entry?.state === 'failed') {
      this.onerror?.();
    }
  }
}

type GlobalStubs = Record<string, unknown>;

function withGlobals<T>(stubs: GlobalStubs, run: () => T): T {
  const g = globalThis as unknown as GlobalStubs;
  const saved = new Map<string, PropertyDescriptor | undefined>();
  for (const [key, value] of Object.entries(stubs)) {
    saved.set(key, Object.getOwnPropertyDescriptor(g, key));
    Object.defineProperty(g, key, {
      value,
      configurable: true,
      writable: true,
    });
  }
  try {
    return run();
  } finally {
    for (const [key, desc] of saved) {
      if (desc) Object.defineProperty(g, key, desc);
      else delete g[key];
    }
  }
}

function themeDocument(theme: Theme): unknown {
  return {
    documentElement: {
      getAttribute: (name: string) =>
        name === 'data-theme' && theme === 'light' ? 'light' : null,
    },
  };
}

export async function buildDraw(): Promise<Family> {
  await loadBundledPack('k8s');
  const k8s = getBundledIcon(K8S_POD);
  if (!k8s) throw new Error('draw: k8s pack did not load');

  const images: ImageEntry[] = [
    { src: PNG_LOADED, state: 'loaded', naturalWidth: 640, naturalHeight: 480 },
    { src: PNG_LOADING, state: 'loading' },
    { src: PNG_FAILED, state: 'failed' },
    { src: SVG_LOADED, state: 'loaded', naturalWidth: 48, naturalHeight: 32 },
    { src: SVG_LOADING, state: 'loading' },
    { src: k8s.src, state: 'loaded', naturalWidth: 18, naturalHeight: 17.5 },
  ];
  StubImage.table = new Map(images.map((i) => [i.src, i]));

  const fam = new Family('draw', {
    callEncoding: CALL_ENCODING,
    stateEncoding: STATE_ENCODING,
    measureText: MEASURE_TEXT_STUB,
    inputs:
      'drawElement: {elements, id, theme, editingShapeLabelId?} runs drawElement(ctx, element id, elements, ' +
      'editingShapeLabelId) on a fresh recording context. drawConnectorLabels: {elements, canvasColor, theme, ' +
      'editingShapeLabelId?}. drawGrid: {viewport, gridSize, gridType, canvasWidth, canvasHeight, ' +
      'devicePixelRatio} with canvasWidth/Height in device pixels.',
    themeStub:
      'theme "light" or "dark": document.documentElement.getAttribute("data-theme") returns "light" or null ' +
      '(src/rendering/theme_cache.ts), cache invalidated before every case. Light remaps stroke #e2e2ef to ' +
      '#000000; dark remaps black shadows to a white glow.',
    imageStub:
      'Image is stubbed: src lookups in `images` below. loaded: complete with the given natural size; loading: ' +
      'never completes (naturalWidth 0); failed: onerror fires when src is set, so the image cache reports the ' +
      'source as broken. Every source is requested once before the first case. Other sources stay loading. ' +
      'The k8s pack (src/libraries/kubernetes) is loaded before the first case.',
    devicePixelRatioStub:
      'window.devicePixelRatio = the case devicePixelRatio (drawGrid only).',
    images,
  });

  const warnings = console.warn;
  console.warn = () => {};
  try {
    withGlobals({ Image: StubImage }, () => {
      for (const image of images) getCachedImage(image.src);
    });
  } finally {
    console.warn = warnings;
  }

  const record = (theme: Theme, run: (ctx: CanvasRenderingContext2D) => void) =>
    withGlobals({ Image: StubImage, document: themeDocument(theme) }, () => {
      invalidateThemeCache();
      const { ctx, recording } = recordingContext();
      run(ctx);
      invalidateThemeCache();
      return recording;
    });

  for (const v of variants()) {
    for (const roughness of ROUGHNESS) {
      const elements = v.elements.map((e) =>
        e.id === v.id ? ({ ...e, roughness } as Element) : e,
      );
      const target = elements.find((e) => e.id === v.id)!;
      for (const theme of THEMES) {
        const recording = record(theme, (ctx) =>
          drawElement(ctx, target, elements, v.editingShapeLabelId),
        );
        fam.add(
          `${v.label} roughness ${roughness} ${theme}`,
          'drawElement',
          {
            elements,
            id: v.id,
            theme,
            editingShapeLabelId: v.editingShapeLabelId,
          },
          recording,
        );
      }
    }
  }

  for (const [label, elements, editing] of labelScenes()) {
    for (const theme of THEMES) {
      const canvasColor = CANVAS_COLOR[theme];
      const recording = record(theme, (ctx) =>
        drawConnectorLabels(ctx, elements, canvasColor, editing),
      );
      fam.add(
        `labels ${label} ${theme}`,
        'drawConnectorLabels',
        { elements, canvasColor, theme, editingShapeLabelId: editing },
        recording,
      );
    }
  }

  for (const gridType of ['dot', 'line', 'mm'] as const) {
    for (const [vl, viewport, cssW, cssH] of GRID_VIEWPORTS) {
      for (const dpr of [1, 2]) {
        if (dpr === 2 && vl !== 'default' && vl !== 'offset zoom 1.5') continue;
        const gridSize = 20;
        const canvasWidth = cssW * dpr;
        const canvasHeight = cssH * dpr;
        const recording = withGlobals(
          { window: { devicePixelRatio: dpr } },
          () => {
            const { ctx, recording } = recordingContext();
            drawGrid(
              ctx,
              viewport,
              gridSize,
              gridType,
              canvasWidth,
              canvasHeight,
            );
            return recording;
          },
        );
        fam.add(
          `grid ${gridType} ${vl} dpr ${dpr}`,
          'drawGrid',
          {
            viewport,
            gridSize,
            gridType,
            canvasWidth,
            canvasHeight,
            devicePixelRatio: dpr,
          },
          recording,
        );
      }
    }
  }
  // An odd grid size that is not a power-of-two multiple.
  {
    const viewport = { offsetX: 3, offsetY: 4, zoom: 0.7 };
    const recording = withGlobals({ window: { devicePixelRatio: 1 } }, () => {
      const { ctx, recording } = recordingContext();
      drawGrid(ctx, viewport, 7, 'line', 300, 180);
      return recording;
    });
    fam.add(
      'grid line size 7 zoom 0.7',
      'drawGrid',
      {
        viewport,
        gridSize: 7,
        gridType: 'line',
        canvasWidth: 300,
        canvasHeight: 180,
        devicePixelRatio: 1,
      },
      recording,
    );
  }
  return fam;
}
