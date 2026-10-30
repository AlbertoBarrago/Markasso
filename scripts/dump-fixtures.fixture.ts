/**
 * Fixture generator for the Swift port (markasso-apple).
 *
 * Runs the real TypeScript functions on a corpus of inputs and writes
 * `{ generator, cases }` JSON files the Swift tests replay to prove parity
 * (format and comparison rules: markasso-apple `docs/04-fixtures.md`).
 *
 * It is a vitest file only because vitest already resolves the extensionless
 * `.ts` imports of `src/`; it asserts nothing beyond case-name uniqueness.
 * The name does not match vitest's default `*.test.ts` include, so `pnpm test`
 * never runs it: `scripts/dump-fixtures.mjs` runs it with an explicit include.
 *
 * Output dir: `MARKASSO_FIXTURES_OUT`, default
 * `../markasso-apple/Packages/MarkassoKit/Tests/Fixtures` from the repo root.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';
import type {
  ArrowElement,
  ConnectorAnchor,
  Element,
  LineElement,
} from '../src/elements/element';
import { ARROW_HEAD_STYLES, SHAPE_KINDS } from '../src/elements/element';
import { createStencil } from '../src/elements/stencils/registry';
import {
  isValidElement,
  validateElements,
  validateViewport,
} from '../src/io/element_validation';
import {
  computeElbowRoute,
  distToQuadraticCurve,
  distToRoute,
  getArrowHeadLength,
  getArrowHeadShape,
  getArrowHeadVector,
  getConnectorHeads,
  getQuadraticBounds,
  getQuadraticPoint,
  getRouteHeadVector,
  getRouteLength,
  getRoutePointAt,
  hasEndHead,
  hasStartHead,
  type RouteDirection,
  type RoutePoint,
  simplifyRoute,
} from '../src/rendering/connector_geometry';
import {
  getConnectorBox,
  resolveArrowEndpoints,
  resolveConnectorRoute,
} from '../src/rendering/draw_selection';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = resolve(
  ROOT,
  process.env.MARKASSO_FIXTURES_OUT ??
    '../markasso-apple/Packages/MarkassoKit/Tests/Fixtures',
);

// ── Fixture writing ───────────────────────────────────────────────────────────

type Json = Record<string, unknown>;

interface FixtureCase {
  readonly name: string;
  readonly fn: string;
  readonly input: unknown;
  readonly output: unknown;
}

class Family {
  readonly cases: FixtureCase[] = [];
  private readonly names = new Set<string>();

  constructor(readonly name: string) {}

  add(name: string, fn: string, input: unknown, output: unknown): void {
    if (this.names.has(name)) {
      throw new Error(`${this.name}: duplicate case name "${name}"`);
    }
    this.names.add(name);
    this.cases.push({ name, fn, input, output });
  }
}

/**
 * Makes a value JSON-safe the way the Swift side expects: `undefined` object
 * fields are dropped (as JSON.stringify does) and non-finite numbers become
 * the strings "NaN" / "Infinity" / "-Infinity", which JSON.stringify would
 * otherwise silently turn into null. `found.nonFinite` records whether any
 * such number was seen, so the header can say so.
 */
function toJsonSafe(value: unknown, found: { nonFinite: boolean }): unknown {
  if (typeof value === 'number') {
    if (Number.isFinite(value)) return value;
    found.nonFinite = true;
    return Number.isNaN(value) ? 'NaN' : value > 0 ? 'Infinity' : '-Infinity';
  }
  if (Array.isArray(value)) {
    return value.map((item) =>
      item === undefined ? null : toJsonSafe(item, found),
    );
  }
  if (typeof value === 'object' && value !== null) {
    const out: Json = {};
    for (const [key, item] of Object.entries(value)) {
      if (item !== undefined) out[key] = toJsonSafe(item, found);
    }
    return out;
  }
  return value;
}

function generatorInfo(): { version: string; commit: string } {
  const pkg = JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf8'));
  // In the colocated jj repo git's HEAD is the parent of the working-copy
  // commit (main), which is the code the fixtures were generated from.
  const commit = execFileSync('git', ['rev-parse', '--short=8', 'HEAD'], {
    cwd: ROOT,
    encoding: 'utf8',
  }).trim();
  return { version: String(pkg.version), commit };
}

function writeFamily(family: Family): string {
  const found = { nonFinite: false };
  const cases = family.cases.map((c) => ({
    name: c.name,
    fn: c.fn,
    input: toJsonSafe(c.input, found),
    output: toJsonSafe(c.output, found),
  }));
  const generator = {
    ...generatorInfo(),
    family: family.name,
    ...(found.nonFinite && { nonFinite: 'string' }),
  };
  const dir = resolve(OUT_DIR, family.name);
  mkdirSync(dir, { recursive: true });
  const file = resolve(dir, `${family.name}.json`);
  writeFileSync(file, `${JSON.stringify({ generator, cases }, null, 2)}\n`);
  return file;
}

// ── Shared helpers ────────────────────────────────────────────────────────────

/** Smallest double greater than x (exact one-ulp boundary probes). */
function nextUp(x: number): number {
  if (x === 0) return Number.MIN_VALUE;
  const f = new Float64Array([x]);
  const bits = new BigInt64Array(f.buffer);
  bits[0] = bits[0]! + (x > 0 ? 1n : -1n);
  return f[0]!;
}

function nextDown(x: number): number {
  return -nextUp(-x);
}

/** Deep copy of `obj` with the value at `path` replaced (or removed). */
function withPath(
  obj: Json,
  path: ReadonlyArray<string | number>,
  value: unknown,
): Json {
  const copy = structuredClone(obj);
  let target: Record<string | number, unknown> = copy;
  for (const key of path.slice(0, -1)) {
    target = target[key] as Record<string | number, unknown>;
  }
  const last = path[path.length - 1]!;
  if (value === undefined) delete target[last];
  else target[last] = value;
  return copy;
}

function without(obj: Json, key: string): Json {
  return withPath(obj, [key], undefined);
}

function fmt(value: unknown): string {
  if (typeof value === 'string') {
    return value.length > 48
      ? `string(${value.length} units)`
      : JSON.stringify(value);
  }
  if (typeof value === 'number') return String(value);
  return JSON.stringify(value) ?? String(value);
}

// ── validation family ─────────────────────────────────────────────────────────

const STYLE: Json = {
  strokeColor: '#000',
  fillColor: 'transparent',
  strokeWidth: 1,
  opacity: 1,
  roughness: 0,
};

const PNG_SRC = 'data:image/png;base64,iVBORw0KGgo=';
const SVG_SRC = 'data:image/svg+xml;base64,PHN2Zy8+';

/** Smallest valid element of each type: only the required fields. */
const MINIMAL: Readonly<Record<string, Json>> = {
  rectangle: {
    id: 'rect',
    type: 'rectangle',
    x: 0,
    y: 0,
    width: 100,
    height: 60,
    ...STYLE,
  },
  ellipse: {
    id: 'ellipse',
    type: 'ellipse',
    x: 0,
    y: 0,
    width: 100,
    height: 60,
    ...STYLE,
  },
  rhombus: {
    id: 'rhombus',
    type: 'rhombus',
    x: 0,
    y: 0,
    width: 100,
    height: 60,
    ...STYLE,
  },
  shape: {
    id: 'shape',
    type: 'shape',
    kind: 'terminator',
    x: 0,
    y: 0,
    width: 120,
    height: 60,
    ...STYLE,
  },
  stencil: {
    id: 'stencil',
    type: 'stencil',
    source: { kind: 'builtin', ref: 'generic/server' },
    x: 0,
    y: 0,
    width: 64,
    height: 64,
    ...STYLE,
  },
  line: { id: 'line', type: 'line', x: 0, y: 0, x2: 100, y2: 0, ...STYLE },
  arrow: { id: 'arrow', type: 'arrow', x: 0, y: 0, x2: 100, y2: 0, ...STYLE },
  curve: {
    id: 'curve',
    type: 'curve',
    x: 0,
    y: 0,
    x2: 100,
    y2: 0,
    cx: 50,
    cy: 50,
    ...STYLE,
  },
  polygon: {
    id: 'polygon',
    type: 'polygon',
    points: [
      [0, 0],
      [10, 0],
      [10, 10],
    ],
    closed: true,
    x: 0,
    y: 0,
    ...STYLE,
  },
  freehand: {
    id: 'freehand',
    type: 'freehand',
    points: [
      [0, 0],
      [5, 5],
    ],
    x: 0,
    y: 0,
    ...STYLE,
  },
  text: {
    id: 'text',
    type: 'text',
    content: 'Hello',
    fontSize: 16,
    fontFamily: 'Arial',
    x: 0,
    y: 0,
    width: 100,
    height: 20,
    ...STYLE,
  },
  image: {
    id: 'image',
    type: 'image',
    src: PNG_SRC,
    naturalWidth: 1,
    naturalHeight: 1,
    x: 0,
    y: 0,
    width: 10,
    height: 10,
    ...STYLE,
  },
};

const TYPES = Object.keys(MINIMAL);
const BOX_TYPES = [
  'rectangle',
  'ellipse',
  'rhombus',
  'shape',
  'stencil',
  'text',
  'image',
];
const LABELED_TYPES = [
  'rectangle',
  'ellipse',
  'rhombus',
  'shape',
  'stencil',
  'line',
  'arrow',
];
const CONNECTOR_TYPES = ['line', 'arrow'];

function minimal(type: string): Json {
  return structuredClone(MINIMAL[type]!);
}

const BASE_OPTIONAL = [
  'rotation',
  'strokeStyle',
  'lineCap',
  'lineJoin',
  'shadowBlur',
  'shadowColor',
  'shadowOffsetX',
  'shadowOffsetY',
  'visible',
  'layerName',
  'locked',
  'groupId',
];
const LABEL_OPTIONAL = [
  'label',
  'labelFontSize',
  'labelFontFamily',
  'labelColor',
];
const CONNECTOR_OPTIONAL = [
  'startElementId',
  'endElementId',
  'startAnchor',
  'endAnchor',
  'routing',
  'endHeadStyle',
  ...LABEL_OPTIONAL,
];

/** Optional fields each type validates (null must be rejected for these). */
const OPTIONAL_BY_TYPE: Readonly<Record<string, ReadonlyArray<string>>> = {
  rectangle: [...LABEL_OPTIONAL, 'cornerRadius'],
  ellipse: [...LABEL_OPTIONAL, 'cornerRadius'],
  rhombus: [...LABEL_OPTIONAL, 'cornerRadius'],
  shape: LABEL_OPTIONAL,
  stencil: LABEL_OPTIONAL,
  line: [...CONNECTOR_OPTIONAL, 'cx', 'cy', 'arrowHead', 'startHeadStyle'],
  arrow: CONNECTOR_OPTIONAL,
  curve: [],
  polygon: [],
  freehand: ['pressures'],
  text: [
    'padding',
    'textAlign',
    'isCode',
    'bold',
    'italic',
    'underline',
    'strikethrough',
  ],
  image: [],
};

interface NumericLimit {
  readonly path: ReadonlyArray<string | number>;
  readonly types: ReadonlyArray<string>;
  readonly min: number;
  readonly max: number;
  /** Extra fields the element needs for the path to exist. */
  readonly base?: Json;
}

const COORD = 10_000_000;

const NUMERIC_LIMITS: ReadonlyArray<NumericLimit> = [
  { path: ['x'], types: ['rectangle', 'line'], min: -COORD, max: COORD },
  { path: ['y'], types: ['rectangle', 'line'], min: -COORD, max: COORD },
  { path: ['strokeWidth'], types: ['rectangle', 'line'], min: 0, max: 1_000 },
  { path: ['opacity'], types: ['rectangle', 'line'], min: 0, max: 1 },
  { path: ['roughness'], types: ['rectangle', 'line'], min: 0, max: 10 },
  {
    path: ['rotation'],
    types: ['rectangle', 'line'],
    min: -Math.PI * 2,
    max: Math.PI * 2,
  },
  { path: ['shadowBlur'], types: ['rectangle', 'line'], min: 0, max: 1_000 },
  {
    path: ['shadowOffsetX'],
    types: ['rectangle', 'line'],
    min: -COORD,
    max: COORD,
  },
  {
    path: ['shadowOffsetY'],
    types: ['rectangle', 'line'],
    min: -COORD,
    max: COORD,
  },
  { path: ['width'], types: BOX_TYPES, min: -COORD, max: COORD },
  { path: ['height'], types: BOX_TYPES, min: -COORD, max: COORD },
  { path: ['labelFontSize'], types: LABELED_TYPES, min: 1, max: 1_000 },
  {
    path: ['cornerRadius'],
    types: ['rectangle', 'ellipse', 'rhombus'],
    min: 0,
    max: 1_000,
  },
  { path: ['x2'], types: ['line', 'arrow', 'curve'], min: -COORD, max: COORD },
  { path: ['y2'], types: ['line', 'arrow', 'curve'], min: -COORD, max: COORD },
  { path: ['cx'], types: ['line', 'curve'], min: -COORD, max: COORD },
  { path: ['cy'], types: ['line', 'curve'], min: -COORD, max: COORD },
  {
    path: ['startAnchor', 'x'],
    types: CONNECTOR_TYPES,
    min: 0,
    max: 1,
    base: { startAnchor: { x: 0.5, y: 0.5 } },
  },
  {
    path: ['startAnchor', 'y'],
    types: CONNECTOR_TYPES,
    min: 0,
    max: 1,
    base: { startAnchor: { x: 0.5, y: 0.5 } },
  },
  {
    path: ['endAnchor', 'x'],
    types: CONNECTOR_TYPES,
    min: 0,
    max: 1,
    base: { endAnchor: { x: 0.5, y: 0.5 } },
  },
  {
    path: ['endAnchor', 'y'],
    types: CONNECTOR_TYPES,
    min: 0,
    max: 1,
    base: { endAnchor: { x: 0.5, y: 0.5 } },
  },
  { path: ['padding'], types: ['text'], min: 0, max: 1_000 },
  { path: ['fontSize'], types: ['text'], min: 1, max: 1_000 },
  { path: ['naturalWidth'], types: ['image'], min: 1, max: 100_000 },
  { path: ['naturalHeight'], types: ['image'], min: 1, max: 100_000 },
  {
    path: ['points', 0, 0],
    types: ['polygon', 'freehand'],
    min: -COORD,
    max: COORD,
  },
  {
    path: ['points', 1, 1],
    types: ['polygon', 'freehand'],
    min: -COORD,
    max: COORD,
  },
  {
    path: ['pressures', 0],
    types: ['freehand'],
    min: 0,
    max: 1,
    base: { pressures: [0.5, 0.5] },
  },
];

interface StringLimit {
  readonly path: ReadonlyArray<string | number>;
  readonly types: ReadonlyArray<string>;
  readonly max: number;
  /** Free text: also probed with multi-unit characters at the limit. */
  readonly freeText: boolean;
  readonly base?: Json;
}

const STRING_LIMITS: ReadonlyArray<StringLimit> = [
  { path: ['id'], types: ['rectangle'], max: 128, freeText: false },
  { path: ['layerName'], types: ['rectangle'], max: 1_000, freeText: true },
  { path: ['groupId'], types: ['rectangle'], max: 128, freeText: false },
  {
    path: ['label'],
    types: ['rectangle', 'line'],
    max: 10_000,
    freeText: true,
  },
  {
    path: ['labelFontFamily'],
    types: ['rectangle', 'line'],
    max: 256,
    freeText: true,
  },
  {
    path: ['startElementId'],
    types: CONNECTOR_TYPES,
    max: 128,
    freeText: false,
  },
  { path: ['endElementId'], types: CONNECTOR_TYPES, max: 128, freeText: false },
  { path: ['content'], types: ['text'], max: 10_000, freeText: true },
  { path: ['fontFamily'], types: ['text'], max: 256, freeText: true },
  {
    path: ['source', 'pack'],
    types: ['stencil'],
    max: 128,
    freeText: true,
    base: {
      source: { kind: 'embedded', src: SVG_SRC, pack: 'azure', name: 'AKS' },
    },
  },
  {
    path: ['source', 'name'],
    types: ['stencil'],
    max: 256,
    freeText: true,
    base: {
      source: { kind: 'embedded', src: SVG_SRC, pack: 'azure', name: 'AKS' },
    },
  },
];

const EMOJI = '\u{1F600}'; // 2 UTF-16 units, 1 grapheme
const FLAG = '\u{1F1EE}\u{1F1F9}'; // 4 UTF-16 units, 1 grapheme
const ACCENT = 'é'; // 2 UTF-16 units, 1 grapheme (combining mark)

function buildValidation(): Family {
  const fam = new Family('validation');
  const isValid = (name: string, value: unknown) =>
    fam.add(name, 'isValidElement', { value }, isValidElement(value));
  const validate = (name: string, value: unknown) =>
    fam.add(name, 'validateElements', { value }, validateElements(value));
  const viewport = (name: string, value: unknown) =>
    fam.add(name, 'validateViewport', { value }, validateViewport(value));

  // Cases lifted from tests/element_validation.test.ts.
  const testRect = {
    id: 'duplicate',
    type: 'rectangle',
    x: 0,
    y: 0,
    width: 10,
    height: 10,
    strokeColor: '#000',
    fillColor: 'transparent',
    strokeWidth: 1,
    opacity: 1,
    roughness: 0,
  };
  validate('test: rejects freehand without points', [
    { id: 'bad-freehand', type: 'freehand', x: 0, y: 0, ...STYLE },
  ]);
  validate('test: rejects box with NaN width', [
    { ...testRect, id: 'bad-rect', width: Number.NaN, height: 20 },
  ]);
  validate('test: rejects unsafe colors', [
    { ...testRect, id: 'unsafe', strokeColor: `red' onmouseover='alert(1)` },
  ]);
  validate('test: duplicate ids keep the first', [
    { ...testRect, strokeColor: '#000' },
    { ...testRect, strokeColor: '#fff' },
  ]);
  validate('test: keeps valid elements around a malformed one', [
    { ...testRect, id: 'good-1' },
    {
      ...testRect,
      id: 'bad-text',
      type: 'text',
      content: 'hello',
      fontSize: Number.NaN,
      fontFamily: 'Arial',
    },
    { ...testRect, id: 'good-2', x: 50 },
  ]);
  validate('test: rejects locked as string', [
    { ...testRect, id: 'shape', locked: 'yes' },
  ]);
  validate('test: rejects freehand with empty points', [
    { id: 'shape', type: 'freehand', x: 0, y: 0, ...STYLE, points: [] },
  ]);
  const testShape = {
    id: 'shape-1',
    type: 'shape',
    x: 0,
    y: 0,
    width: 120,
    height: 60,
    ...STYLE,
  };
  validate('test: labeled shape with known kind', [
    { ...testShape, kind: 'database', label: 'Users' },
  ]);
  validate('test: shape with unknown kind', [{ ...testShape, kind: 'script' }]);
  validate('test: shape without kind', [testShape]);
  const testLine = {
    id: 'line-1',
    type: 'line',
    x: 0,
    y: 0,
    x2: 10,
    y2: 0,
    ...STYLE,
    startElementId: 'a',
  };
  validate('test: anchor inside the unit box', [
    { ...testLine, startAnchor: { x: 0, y: 1 } },
  ]);
  validate('test: elbow routing accepted', [{ ...testLine, routing: 'elbow' }]);
  validate('test: unknown routing rejected', [
    { ...testLine, routing: 'spline' },
  ]);
  validate('test: known head styles accepted', [
    { ...testLine, startHeadStyle: 'circle', endHeadStyle: 'triangle' },
  ]);
  validate('test: unknown head style rejected', [
    { ...testLine, endHeadStyle: 'star' },
  ]);
  validate('test: anchor outside the unit box', [
    { ...testLine, startAnchor: { x: 1.5, y: 0 } },
  ]);
  validate('test: anchor as array', [{ ...testLine, endAnchor: [0, 1] }]);
  const testNote = {
    id: 'note',
    type: 'text',
    x: 0,
    y: 0,
    width: 200,
    height: 180,
    content: 'Note',
    fontSize: 16,
    fontFamily: 'Arial',
    strokeColor: '#5c4a00',
    fillColor: '#FFD966',
    strokeWidth: 1,
    opacity: 1,
    roughness: 0,
  };
  validate('test: note without padding', [testNote]);
  validate('test: note with padding 12', [{ ...testNote, padding: 12 }]);
  for (const padding of [-1, Number.NaN, Number.POSITIVE_INFINITY, '12']) {
    validate(`test: note with invalid padding ${fmt(padding)}`, [
      { ...testNote, padding },
    ]);
  }
  viewport('test: bounded viewport', { offsetX: 1, offsetY: 2, zoom: 1 });
  viewport('test: zero zoom', { offsetX: 0, offsetY: 0, zoom: 0 });
  viewport('test: infinite offset', {
    offsetX: Number.POSITIVE_INFINITY,
    offsetY: 0,
    zoom: 1,
  });

  // Minimal valid element of every type, alone and through validateElements.
  for (const type of TYPES) {
    isValid(`minimal ${type}`, minimal(type));
    validate(`minimal ${type} in array`, [minimal(type)]);
  }
  validate(
    'one of every type',
    TYPES.map((type) => minimal(type)),
  );

  // Non-record values.
  for (const [label, value] of [
    ['null', null],
    ['number', 42],
    ['string', 'rect'],
    ['boolean', true],
    ['empty array', []],
    ['empty object', {}],
  ] as const) {
    isValid(`non-element ${label}`, value);
  }

  // Required base fields, removed one at a time.
  for (const type of ['rectangle', 'line', 'freehand']) {
    for (const key of Object.keys(MINIMAL[type]!)) {
      isValid(`${type} missing ${key}`, without(minimal(type), key));
    }
  }
  isValid('rectangle empty id', withPath(minimal('rectangle'), ['id'], ''));
  isValid('rectangle numeric id', withPath(minimal('rectangle'), ['id'], 1));
  isValid(
    'unknown type triangle',
    withPath(minimal('rectangle'), ['type'], 'triangle'),
  );
  isValid(
    'type with wrong case',
    withPath(minimal('rectangle'), ['type'], 'Rectangle'),
  );

  // Numeric limits: at, one ulp inside and one ulp outside each bound, plus
  // non-finite and non-number values.
  for (const limit of NUMERIC_LIMITS) {
    for (const type of limit.types) {
      const base = { ...minimal(type), ...structuredClone(limit.base ?? {}) };
      const label = `${type} ${limit.path.join('.')}`;
      const probes: Array<[string, unknown]> = [
        ['at min', limit.min],
        ['just inside min', nextUp(limit.min)],
        ['just outside min', nextDown(limit.min)],
        ['at max', limit.max],
        ['just inside max', nextDown(limit.max)],
        ['just outside max', nextUp(limit.max)],
        ['NaN', Number.NaN],
        ['Infinity', Number.POSITIVE_INFINITY],
        ['-Infinity', Number.NEGATIVE_INFINITY],
        ['numeric string', '1'],
        ['null', null],
      ];
      for (const [probe, value] of probes) {
        isValid(`${label} ${probe}`, withPath(base, limit.path, value));
      }
    }
  }

  // String length limits, in UTF-16 code units like JS `length`.
  for (const limit of STRING_LIMITS) {
    for (const type of limit.types) {
      const base = { ...minimal(type), ...structuredClone(limit.base ?? {}) };
      const label = `${type} ${limit.path.join('.')}`;
      const probes: Array<[string, string]> = [
        ['empty', ''],
        ['at max length', 'a'.repeat(limit.max)],
        ['one over max length', 'a'.repeat(limit.max + 1)],
      ];
      if (limit.freeText) {
        probes.push(
          ['emoji at max units', EMOJI.repeat(limit.max / 2)],
          ['emoji one unit over', `${EMOJI.repeat(limit.max / 2)}a`],
          ['flags at max units', FLAG.repeat(limit.max / 4)],
          ['flags one unit over', `${FLAG.repeat(limit.max / 4)}a`],
          ['combining marks at max units', ACCENT.repeat(limit.max / 2)],
          ['combining marks one unit over', `${ACCENT.repeat(limit.max / 2)}e`],
        );
      }
      for (const [probe, value] of probes) {
        isValid(`${label} ${probe}`, withPath(base, limit.path, value));
      }
    }
  }
  // Builtin refs: the pattern allows a long pack, the 128 cap stops it.
  const refPack = (packLen: number) =>
    `${'a'.repeat(packLen)}/${'b'.repeat(64)}`;
  isValid(
    'stencil ref at 128 units',
    withPath(minimal('stencil'), ['source', 'ref'], refPack(63)),
  );
  isValid(
    'stencil ref at 129 units',
    withPath(minimal('stencil'), ['source', 'ref'], refPack(64)),
  );
  isValid(
    'stencil ref id at 65 chars',
    withPath(
      minimal('stencil'),
      ['source', 'ref'],
      `generic/${'b'.repeat(65)}`,
    ),
  );
  // Embedded SVG cap: 64 KiB including the data URL prefix.
  const svgPrefix = 'data:image/svg+xml;base64,';
  const embedded = (len: number): Json =>
    withPath(minimal('stencil'), ['source'], {
      kind: 'embedded',
      src: svgPrefix + 'A'.repeat(len - svgPrefix.length),
      pack: 'azure',
      name: 'AKS',
    });
  isValid('stencil embedded src at 65536 chars', embedded(65_536));
  isValid('stencil embedded src at 65537 chars', embedded(65_537));

  // Colors, on required and optional color fields.
  const colors = [
    '#000',
    '#0000',
    '#00000',
    '#000000',
    '#00000000',
    '#000000000',
    '#ab',
    '#ggg',
    '#FFF',
    'transparent',
    'none',
    'red',
    'Red',
    'currentColor',
    'rgb(0,0,0)',
    'rgba(0, 0, 0, 0.5)',
    'hsl(120, 50%, 50%)',
    'HSLA(1,2%,3%,0.4)',
    'rgb( )',
    'rgb()',
    'rgb(0,0,0);x',
    `red' onmouseover='alert(1)`,
    'url(#x)',
    'var(--x)',
    'color(display-p3 1 0 0)',
    '',
    'a'.repeat(128),
    'a'.repeat(129),
  ];
  for (const field of [
    'strokeColor',
    'fillColor',
    'shadowColor',
    'labelColor',
  ]) {
    for (const color of colors) {
      isValid(
        `rectangle ${field} ${fmt(color)}`,
        withPath(minimal('rectangle'), [field], color),
      );
    }
  }

  // Enums.
  const enums: Array<[string, ReadonlyArray<string>, ReadonlyArray<string>]> = [
    [
      'strokeStyle',
      ['rectangle'],
      ['solid', 'dashed', 'dotted', 'Solid', 'dashdot'],
    ],
    ['lineCap', ['rectangle'], ['round', 'butt', 'square', 'flat']],
    ['lineJoin', ['rectangle'], ['round', 'miter', 'bevel', 'sharp']],
    ['textAlign', ['text'], ['left', 'center', 'right', 'justify']],
    ['arrowHead', ['line'], ['none', 'start', 'end', 'both', 'middle']],
    ['routing', CONNECTOR_TYPES, ['straight', 'elbow', 'spline']],
    ['endHeadStyle', CONNECTOR_TYPES, [...ARROW_HEAD_STYLES, 'star']],
    ['startHeadStyle', ['line'], [...ARROW_HEAD_STYLES, 'star']],
    ['kind', ['shape'], [...SHAPE_KINDS, 'script', 'Database']],
  ];
  for (const [field, types, values] of enums) {
    for (const type of types) {
      for (const value of values) {
        isValid(
          `${type} ${field} ${fmt(value)}`,
          withPath(minimal(type), [field], value),
        );
      }
    }
  }
  // Fields the type does not declare are not checked at all.
  isValid(
    'arrow startHeadStyle invalid is ignored',
    withPath(minimal('arrow'), ['startHeadStyle'], 'star'),
  );
  isValid(
    'arrow arrowHead invalid is ignored',
    withPath(minimal('arrow'), ['arrowHead'], 'middle'),
  );

  // Booleans.
  for (const [field, type] of [
    ['visible', 'rectangle'],
    ['locked', 'rectangle'],
    ['isCode', 'text'],
    ['bold', 'text'],
    ['italic', 'text'],
    ['underline', 'text'],
    ['strikethrough', 'text'],
    ['closed', 'polygon'],
  ] as const) {
    for (const value of [true, false, 'true', 1, 0]) {
      isValid(
        `${type} ${field} ${fmt(value)}`,
        withPath(minimal(type), [field], value),
      );
    }
  }

  // null for every optional field: rejected where the type validates the
  // field, passed through untouched where it does not.
  for (const type of TYPES) {
    for (const field of [...BASE_OPTIONAL, ...OPTIONAL_BY_TYPE[type]!]) {
      isValid(
        `${type} optional ${field} null`,
        withPath(minimal(type), [field], null),
      );
    }
  }
  for (const [type, field] of [
    ['curve', 'label'],
    ['text', 'label'],
    ['polygon', 'pressures'],
    ['image', 'cornerRadius'],
    ['arrow', 'cx'],
  ] as const) {
    isValid(
      `${type} undeclared ${field} null`,
      withPath(minimal(type), [field], null),
    );
  }

  // Stencil sources.
  const stencilSources: Array<[string, unknown]> = [
    ['builtin generic/server', { kind: 'builtin', ref: 'generic/server' }],
    ['builtin k8s/pod', { kind: 'builtin', ref: 'k8s/pod' }],
    ['builtin unknown icon id', { kind: 'builtin', ref: 'generic/nope' }],
    ['builtin uppercase pack', { kind: 'builtin', ref: 'Generic/server' }],
    ['builtin empty id', { kind: 'builtin', ref: 'generic/' }],
    ['builtin space in id', { kind: 'builtin', ref: 'generic/a b' }],
    ['builtin three segments', { kind: 'builtin', ref: 'a/b/c' }],
    ['builtin no slash', { kind: 'builtin', ref: 'server' }],
    ['builtin missing ref', { kind: 'builtin' }],
    [
      'embedded valid',
      { kind: 'embedded', src: SVG_SRC, pack: 'azure', name: 'AKS' },
    ],
    [
      'embedded with padding',
      { kind: 'embedded', src: `${SVG_SRC}=`, pack: 'azure', name: 'AKS' },
    ],
    [
      'embedded three padding chars',
      { kind: 'embedded', src: `${SVG_SRC}===`, pack: 'azure', name: 'AKS' },
    ],
    [
      'embedded quote in data',
      { kind: 'embedded', src: `${SVG_SRC}"`, pack: 'azure', name: 'AKS' },
    ],
    [
      'embedded png',
      { kind: 'embedded', src: PNG_SRC, pack: 'azure', name: 'AKS' },
    ],
    [
      'embedded empty data',
      {
        kind: 'embedded',
        src: 'data:image/svg+xml;base64,',
        pack: 'azure',
        name: 'AKS',
      },
    ],
    ['embedded missing pack', { kind: 'embedded', src: SVG_SRC, name: 'AKS' }],
    [
      'embedded missing name',
      { kind: 'embedded', src: SVG_SRC, pack: 'azure' },
    ],
    ['unknown kind', { kind: 'remote', ref: 'generic/server' }],
    ['null source', null],
    ['string source', 'generic/server'],
  ];
  for (const [label, source] of stencilSources) {
    isValid(
      `stencil source ${label}`,
      withPath(minimal('stencil'), ['source'], source),
    );
  }
  const embeddedStencil = withPath(minimal('stencil'), ['source'], {
    kind: 'embedded',
    src: SVG_SRC,
    pack: 'azure',
    name: 'AKS',
  });
  isValid(
    'stencil embedded rotation 0',
    withPath(embeddedStencil, ['rotation'], 0),
  );
  isValid(
    'stencil embedded rotation 0.1',
    withPath(embeddedStencil, ['rotation'], 0.1),
  );
  isValid(
    'stencil builtin rotation 0.1',
    withPath(minimal('stencil'), ['rotation'], 0.1),
  );

  // Image sources.
  for (const src of [
    PNG_SRC,
    'data:image/jpeg;base64,AAAA',
    'data:image/jpg;base64,AAAA',
    'data:image/gif;base64,AAAA',
    'data:image/webp;base64,AAAA',
    SVG_SRC,
    'DATA:IMAGE/PNG;BASE64,AAAA',
    'data:image/bmp;base64,AAAA',
    'data:image/png,AAAA',
    'https://example.com/a.png',
    'javascript:alert(1)',
    '',
  ]) {
    isValid(`image src ${fmt(src)}`, withPath(minimal('image'), ['src'], src));
  }

  // Point lists.
  const pointCases: Array<[string, unknown]> = [
    ['one point', [[0, 0]]],
    [
      'two points',
      [
        [0, 0],
        [1, 1],
      ],
    ],
    [
      'point with three coords',
      [
        [0, 0, 0],
        [1, 1],
      ],
    ],
    ['point with one coord', [[0], [1, 1]]],
    ['point as object', [{ x: 0, y: 0 }, [1, 1]]],
    [
      'string coord',
      [
        ['0', 0],
        [1, 1],
      ],
    ],
    ['not an array', 'M0 0'],
  ];
  for (const type of ['polygon', 'freehand']) {
    for (const [label, points] of pointCases) {
      isValid(
        `${type} points ${label}`,
        withPath(minimal(type), ['points'], points),
      );
    }
  }
  const freehand = minimal('freehand');
  for (const [label, pressures] of [
    ['matching length', [0, 1]],
    ['shorter', [0.5]],
    ['longer', [0.5, 0.5, 0.5]],
    ['empty', []],
    ['string entry', ['0.5', 0.5]],
  ] as const) {
    isValid(
      `freehand pressures ${label}`,
      withPath(freehand, ['pressures'], pressures),
    );
  }

  // Text without content and connector anchors of the wrong shape.
  isValid('text missing content', without(minimal('text'), 'content'));
  isValid('text numeric content', withPath(minimal('text'), ['content'], 5));
  isValid(
    'line anchor missing y',
    withPath(minimal('line'), ['startAnchor'], { x: 0.5 }),
  );
  isValid(
    'line anchor with extra key',
    withPath(minimal('line'), ['startAnchor'], { x: 0.5, y: 0.5, z: 1 }),
  );

  // validateElements: array-level behavior.
  for (const [label, value] of [
    ['null', null],
    ['object', { 0: minimal('rectangle') }],
    ['string', 'rect'],
    ['number', 0],
  ] as const) {
    validate(`not an array: ${label}`, value);
  }
  validate('empty array', []);
  validate('all invalid non-empty', [
    null,
    1,
    without(minimal('rectangle'), 'id'),
  ]);
  validate('mixed valid and invalid keeps order', [
    withPath(minimal('rectangle'), ['id'], 'a'),
    null,
    withPath(minimal('ellipse'), ['id'], 'b'),
    without(minimal('text'), 'content'),
    withPath(minimal('line'), ['id'], 'c'),
  ]);
  validate('duplicate id first wins', [
    withPath(minimal('rectangle'), ['x'], 1),
    withPath(minimal('rectangle'), ['x'], 2),
    withPath(minimal('rectangle'), ['x'], 3),
  ]);
  validate('duplicate id across types first wins', [
    withPath(minimal('rectangle'), ['id'], 'same'),
    withPath(minimal('ellipse'), ['id'], 'same'),
  ]);
  validate('duplicate id where the first is invalid', [
    withPath(minimal('rectangle'), ['width'], 'wide'),
    withPath(minimal('rectangle'), ['x'], 2),
  ]);
  validate('unknown keys are kept as-is', [
    {
      ...minimal('rectangle'),
      foo: 'bar',
      nested: { a: 1, b: [true, null] },
      nullish: null,
    },
  ]);
  validate('undeclared fields of other types are kept', [
    { ...minimal('curve'), label: null, points: 'junk', arrowHead: 'middle' },
  ]);
  // Oversized arrays: filler zeros keep the file small while still pinning
  // the count gate (5000 entries pass, 5001 are rejected before filtering).
  validate('exactly 5000 entries', [
    ...new Array<number>(4_999).fill(0),
    minimal('rectangle'),
  ]);
  validate('5001 entries', [
    ...new Array<number>(5_000).fill(0),
    minimal('rectangle'),
  ]);

  // validateViewport.
  viewport('viewport unit', { offsetX: 0, offsetY: 0, zoom: 1 });
  viewport('viewport unknown keys dropped', {
    offsetX: 10,
    offsetY: -20,
    zoom: 2,
    rotation: 1,
    extra: 'x',
  });
  for (const [field, min, max] of [
    ['offsetX', -COORD, COORD],
    ['offsetY', -COORD, COORD],
    ['zoom', 0.05, 30],
  ] as const) {
    const base = { offsetX: 0, offsetY: 0, zoom: 1 };
    for (const [probe, value] of [
      ['at min', min],
      ['just inside min', nextUp(min)],
      ['just outside min', nextDown(min)],
      ['at max', max],
      ['just inside max', nextDown(max)],
      ['just outside max', nextUp(max)],
      ['NaN', Number.NaN],
      ['Infinity', Number.POSITIVE_INFINITY],
      ['numeric string', '1'],
      ['null', null],
      ['missing', undefined],
    ] as const) {
      viewport(`viewport ${field} ${probe}`, withPath(base, [field], value));
    }
  }
  for (const [label, value] of [
    ['null', null],
    ['number', 1],
    ['array', [0, 0, 1]],
    ['empty object', {}],
  ] as const) {
    viewport(`viewport ${label}`, value);
  }

  return fam;
}

// ── connectors family ─────────────────────────────────────────────────────────

const UP: RouteDirection = { dx: 0, dy: -1 };
const RIGHT: RouteDirection = { dx: 1, dy: 0 };
const DOWN: RouteDirection = { dx: 0, dy: 1 };
const LEFT: RouteDirection = { dx: -1, dy: 0 };
const DIRS: ReadonlyArray<[string, RouteDirection | null]> = [
  ['up', UP],
  ['right', RIGHT],
  ['down', DOWN],
  ['left', LEFT],
  ['free', null],
];

const NODE_STYLE = {
  strokeColor: '#000',
  fillColor: 'transparent',
  strokeWidth: 2,
  opacity: 1,
  roughness: 0,
} as const;

/** Label from tests/stencil_label_routing.test.ts: wraps wider than the icon. */
const WIDE_LABEL =
  'Modello linguistico\nlocale: gemma3:12b (Ollama)\nproduzione: GPT 4.1, AI Factory Azure';

const NODE_KINDS = [
  'rectangle',
  'rectangle-rounded',
  'rectangle-rotated',
  'ellipse',
  'rhombus',
  'shape-terminator',
  'shape-data',
  'shape-database-rotated',
  'stencil',
  'stencil-wide-label',
  'stencil-wide-label-rotated',
  'stencil-embedded-label',
  'text',
  'image',
] as const;
type NodeKind = (typeof NODE_KINDS)[number];

/** Box-like element of the given kind with its top-left at (x, y). */
function node(
  kind: NodeKind,
  id: string,
  x: number,
  y: number,
  w: number,
  h: number,
): Element {
  const box = { id, x, y, width: w, height: h, ...NODE_STYLE };
  switch (kind) {
    case 'rectangle':
      return { ...box, type: 'rectangle' };
    case 'rectangle-rounded':
      return { ...box, type: 'rectangle', cornerRadius: 12 };
    case 'rectangle-rotated':
      return { ...box, type: 'rectangle', rotation: Math.PI / 6 };
    case 'ellipse':
      return { ...box, type: 'ellipse' };
    case 'rhombus':
      return { ...box, type: 'rhombus' };
    case 'shape-terminator':
      return { ...box, type: 'shape', kind: 'terminator' };
    case 'shape-data':
      return { ...box, type: 'shape', kind: 'data' };
    case 'shape-database-rotated':
      return { ...box, type: 'shape', kind: 'database', rotation: Math.PI / 2 };
    case 'stencil':
      return {
        ...box,
        type: 'stencil',
        source: { kind: 'builtin', ref: 'generic/server' },
      };
    case 'stencil-wide-label':
      return {
        ...box,
        type: 'stencil',
        source: { kind: 'builtin', ref: 'generic/server' },
        label: WIDE_LABEL,
      };
    case 'stencil-wide-label-rotated':
      return {
        ...box,
        type: 'stencil',
        source: { kind: 'builtin', ref: 'generic/server' },
        label: WIDE_LABEL,
        rotation: Math.PI / 4,
      };
    case 'stencil-embedded-label':
      return {
        ...box,
        type: 'stencil',
        source: { kind: 'embedded', src: SVG_SRC, pack: 'azure', name: 'AKS' },
        label: 'Azure Kubernetes Service cluster (production)',
      };
    case 'text':
      return {
        ...box,
        type: 'text',
        content: 'Note',
        fontSize: 16,
        fontFamily: 'Arial',
      };
    case 'image':
      return {
        ...box,
        type: 'image',
        src: PNG_SRC,
        naturalWidth: w,
        naturalHeight: h,
      };
  }
}

function connector(overrides: Partial<LineElement> = {}): LineElement {
  return {
    id: 'c',
    type: 'line',
    x: 0,
    y: 0,
    x2: 100,
    y2: 0,
    ...NODE_STYLE,
    ...overrides,
  };
}

function center(el: Element): RoutePoint {
  const box = el as { x: number; y: number; width: number; height: number };
  return [box.x + box.width / 2, box.y + box.height / 2];
}

/** Relative placements of box B around box A (offsets of B's center). */
const PLACEMENTS: ReadonlyArray<[string, number, number]> = [
  ['right', 250, 0],
  ['left', -250, 0],
  ['below', 0, 200],
  ['above', 0, -200],
  ['below-right', 250, 200],
  ['below-left', -250, 200],
  ['above-right', 250, -200],
  ['above-left', -250, -200],
  ['right slightly lower', 180, 20],
  ['below slightly right', 30, 150],
  ['equal gaps', 200, 160],
  ['overlapping', 60, 30],
  ['concentric', 0, 0],
];

const SIZES: ReadonlyArray<[string, number, number]> = [
  ['100x60', 100, 60],
  ['40x40', 40, 40],
  ['240x50 wide', 240, 50],
  ['50x200 tall', 50, 200],
];

const ANCHORS: ReadonlyArray<[string, ConnectorAnchor | undefined]> = [
  ['floating', undefined],
  ['N', { x: 0.5, y: 0 }],
  ['E', { x: 1, y: 0.5 }],
  ['S', { x: 0.5, y: 1 }],
  ['W', { x: 0, y: 0.5 }],
  ['corner SE', { x: 1, y: 1 }],
  ['top quarter', { x: 0.25, y: 0 }],
  ['interior', { x: 0.3, y: 0.6 }],
];

function buildConnectors(): Family {
  const fam = new Family('connectors');

  const elbow = (
    name: string,
    start: RoutePoint,
    startDir: RouteDirection | null,
    end: RoutePoint,
    endDir: RouteDirection | null,
    startStub?: number,
    endStub?: number,
  ) =>
    fam.add(
      name,
      'computeElbowRoute',
      { start, startDir, end, endDir, startStub, endStub },
      computeElbowRoute(start, startDir, end, endDir, startStub, endStub),
    );

  /** Both functions on one scene; `el` is part of `elements` like in the app. */
  const scene = (name: string, el: LineElement, nodes: Element[]) => {
    const elements = [...nodes, el];
    fam.add(
      `endpoints: ${name}`,
      'resolveArrowEndpoints',
      { el, elements },
      resolveArrowEndpoints(el, elements),
    );
    fam.add(
      `route: ${name}`,
      'resolveConnectorRoute',
      { el, elements },
      resolveConnectorRoute(el, elements),
    );
  };

  // computeElbowRoute: lifted from tests/connector_geometry.test.ts.
  elbow('test: facing horizontal stubs Z', [0, 0], RIGHT, [100, 50], LEFT);
  elbow('test: perpendicular single corner', [0, 0], RIGHT, [100, 100], UP);
  elbow('test: mirrored corner', [0, 0], RIGHT, [-100, 100], UP);
  elbow('test: detour stubs facing away', [0, 0], LEFT, [100, 0], RIGHT);
  elbow('test: free ends dominant x', [0, 0], null, [100, 40], null);
  elbow('test: free ends dominant y', [0, 0], null, [40, 100], null);
  elbow('test: turns once toward free end', [0, 0], DOWN, [100, 100], null);

  // Every direction pair (free included) over a grid of end points.
  const ends: ReadonlyArray<RoutePoint> = [
    [200, 120],
    [-150, 80],
    [60, -200],
    [-90, -40],
    [100, 0],
    [0, 100],
    [-100, 0],
    [0, -100],
    [10, 5],
    [0, 0],
    [0.4, 0.3],
    [32, 32],
  ];
  for (const [sName, sDir] of DIRS) {
    for (const [eName, eDir] of DIRS) {
      for (const end of ends) {
        elbow(
          `elbow ${sName} to ${eName} end ${end.join(',')}`,
          [0, 0],
          sDir,
          end,
          eDir,
        );
      }
    }
  }
  // Custom stubs (icon labels lengthen them; 0 collapses the stub).
  for (const [startStub, endStub] of [
    [40, 16],
    [16, 40],
    [0, 0],
    [72.5, 33.25],
  ] as const) {
    for (const end of [
      [200, 120],
      [-150, 80],
      [60, -200],
    ] as const) {
      elbow(
        `elbow right to left stubs ${startStub}/${endStub} end ${end.join(',')}`,
        [0, 0],
        RIGHT,
        end,
        LEFT,
        startStub,
        endStub,
      );
      elbow(
        `elbow down to up stubs ${startStub}/${endStub} end ${end.join(',')}`,
        [0, 0],
        DOWN,
        end,
        UP,
        startStub,
        endStub,
      );
    }
  }
  elbow(
    'elbow non-origin start fractional',
    [12.5, -7.25],
    RIGHT,
    [312.75, 140.5],
    UP,
  );

  // simplifyRoute.
  const simplify = (name: string, points: RoutePoint[]) =>
    fam.add(name, 'simplifyRoute', { points }, simplifyRoute(points));
  simplify('test: duplicates and collinear', [
    [0, 0],
    [0, 0],
    [50, 0],
    [100, 0],
    [100, 100],
  ]);
  simplify('simplify empty', []);
  simplify('simplify single point', [[3, 4]]);
  simplify('simplify all duplicates', [
    [1, 1],
    [1, 1],
    [1, 1],
  ]);
  simplify('simplify dedupe distance exactly 0.5', [
    [0, 0],
    [0.5, 0],
    [10, 10],
  ]);
  simplify('simplify dedupe distance just over 0.5', [
    [0, 0],
    [nextUp(0.5), 0],
    [10, 10],
  ]);
  simplify('simplify near-collinear below 0.01', [
    [0, 0],
    [100, 0.00009],
    [200, 0],
  ]);
  simplify('simplify near-collinear above 0.01', [
    [0, 0],
    [100, 0.0002],
    [200, 0],
  ]);
  simplify('simplify backtracking collinear', [
    [0, 0],
    [100, 0],
    [50, 0],
  ]);
  simplify('simplify staircase kept', [
    [0, 0],
    [10, 0],
    [10, 10],
    [20, 10],
    [20, 20],
  ]);
  simplify('simplify long collinear run', [
    [0, 0],
    [1, 0],
    [2, 0],
    [3, 0],
    [4, 0],
    [4, 5],
  ]);
  simplify('simplify diagonal collinear', [
    [0, 0],
    [1, 1],
    [2, 2],
    [3, 3],
  ]);

  // Arrowheads.
  fam.add(
    'test: head vector quadratic end',
    'getArrowHeadVector',
    {
      endpoints: { x: 0, y: 0, x2: 100, y2: 0 },
      control: { cx: 80, cy: 40 },
      placement: 'end',
    },
    getArrowHeadVector(
      { x: 0, y: 0, x2: 100, y2: 0 },
      { cx: 80, cy: 40 },
      'end',
    ),
  );
  const headVector = (
    name: string,
    endpoints: { x: number; y: number; x2: number; y2: number },
    control: { cx?: number; cy?: number },
    placement: 'start' | 'end',
  ) =>
    fam.add(
      name,
      'getArrowHeadVector',
      { endpoints, control, placement },
      getArrowHeadVector(endpoints, control, placement),
    );
  const seg = { x: 0, y: 0, x2: 100, y2: 0 };
  headVector(
    'test: head vector quadratic start',
    seg,
    { cx: 20, cy: 40 },
    'start',
  );
  headVector(
    'test: head vector control on tip',
    seg,
    { cx: 100, cy: 0 },
    'end',
  );
  headVector('head vector straight end', seg, {}, 'end');
  headVector('head vector straight start', seg, {}, 'start');
  headVector('head vector only cx ignored', seg, { cx: 50 }, 'end');
  headVector('head vector only cy ignored', seg, { cy: 50 }, 'start');
  headVector(
    'head vector control within 0.001 of tip',
    seg,
    { cx: 100.0005, cy: 0 },
    'end',
  );
  headVector(
    'head vector control on start tip',
    seg,
    { cx: 0, cy: 0 },
    'start',
  );
  headVector(
    'head vector zero-length segment',
    { x: 5, y: 5, x2: 5, y2: 5 },
    {},
    'end',
  );

  for (const width of [0, 1, 2, 3, 3.5, 4, 10, 100]) {
    fam.add(
      `head length stroke ${width}`,
      'getArrowHeadLength',
      { strokeWidth: width },
      getArrowHeadLength(width),
    );
  }

  // Each style along 8 compass directions and two head sizes.
  const headDirs: ReadonlyArray<[string, number, number]> = [
    ['east', 100, 0],
    ['north-east', 70, -70],
    ['north', 0, -100],
    ['north-west', -70, -70],
    ['west', -100, 0],
    ['south-west', -70, 70],
    ['south', 0, 100],
    ['south-east', 30, 80],
  ];
  for (const style of ARROW_HEAD_STYLES) {
    for (const [dirName, tx, ty] of headDirs) {
      for (const strokeWidth of [2, 5]) {
        const input = {
          style,
          fromX: 10,
          fromY: 20,
          tipX: 10 + tx,
          tipY: 20 + ty,
          strokeWidth,
        };
        fam.add(
          `head ${style} ${dirName} stroke ${strokeWidth}`,
          'getArrowHeadShape',
          input,
          getArrowHeadShape(
            style,
            input.fromX,
            input.fromY,
            input.tipX,
            input.tipY,
            strokeWidth,
          ),
        );
      }
    }
    const degenerate = {
      style,
      fromX: 5,
      fromY: 5,
      tipX: 5,
      tipY: 5,
      strokeWidth: 2,
    };
    fam.add(
      `head ${style} zero-length`,
      'getArrowHeadShape',
      degenerate,
      getArrowHeadShape(style, 5, 5, 5, 5, 2),
    );
  }

  // Route head vectors and connector heads.
  const routes: ReadonlyArray<[string, RoutePoint[]]> = [
    ['empty', []],
    ['single point', [[3, 4]]],
    [
      'two points',
      [
        [0, 0],
        [100, 50],
      ],
    ],
    [
      'elbow',
      [
        [0, 0],
        [50, 0],
        [50, 50],
        [100, 50],
      ],
    ],
  ];
  for (const [label, route] of routes) {
    for (const placement of ['start', 'end'] as const) {
      fam.add(
        `route head ${label} ${placement}`,
        'getRouteHeadVector',
        { route, placement },
        getRouteHeadVector(route, placement),
      );
    }
  }
  const headRoute: RoutePoint[] = [
    [0, 0],
    [50, 0],
    [50, 50],
    [100, 50],
  ];
  const headed: Array<[string, LineElement | ArrowElement]> = [
    [
      'arrow default',
      { ...connector(), type: 'arrow', id: 'a' } as ArrowElement,
    ],
    [
      'arrow diamond',
      {
        ...connector(),
        type: 'arrow',
        id: 'a',
        endHeadStyle: 'diamond',
      } as ArrowElement,
    ],
    ['line no arrowHead', connector()],
    ['line arrowHead none', connector({ arrowHead: 'none' })],
    ['line arrowHead start', connector({ arrowHead: 'start' })],
    ['line arrowHead end', connector({ arrowHead: 'end' })],
    ['line arrowHead both', connector({ arrowHead: 'both' })],
    [
      'line both styled',
      connector({
        arrowHead: 'both',
        startHeadStyle: 'circle',
        endHeadStyle: 'triangleFilled',
      }),
    ],
    [
      'line start styled only end head',
      connector({ arrowHead: 'end', startHeadStyle: 'circle' }),
    ],
  ];
  for (const [label, el] of headed) {
    fam.add(`has end head: ${label}`, 'hasEndHead', { el }, hasEndHead(el));
    fam.add(
      `has start head: ${label}`,
      'hasStartHead',
      { el },
      hasStartHead(el),
    );
    // vectorFor is `(placement) => getRouteHeadVector(route, placement)`.
    fam.add(
      `connector heads: ${label}`,
      'getConnectorHeads',
      { el, route: headRoute },
      getConnectorHeads(el, (placement) =>
        getRouteHeadVector(headRoute, placement),
      ),
    );
  }

  // Quadratic helpers.
  const curves: ReadonlyArray<
    [string, [number, number, number, number, number, number]]
  > = [
    ['test symmetric arch', [0, 0, 50, 100, 100, 0]],
    ['control on chord', [0, 0, 50, 0, 100, 0]],
    ['s-ish skew', [0, 0, 150, -80, 100, 40]],
    ['control beyond both axes', [10, 10, -40, 120, 90, 60]],
    ['degenerate all equal', [5, 5, 5, 5, 5, 5]],
    ['near-degenerate denominator', [0, 0, 50.0000001, 0, 100, 0]],
  ];
  for (const [label, [x, y, cx, cy, x2, y2]] of curves) {
    for (const t of [0, 0.25, 0.5, 0.75, 1]) {
      fam.add(
        `quad point ${label} t ${t}`,
        'getQuadraticPoint',
        { x, y, cx, cy, x2, y2, t },
        getQuadraticPoint(x, y, cx, cy, x2, y2, t),
      );
    }
    fam.add(
      `quad bounds ${label}`,
      'getQuadraticBounds',
      { x, y, cx, cy, x2, y2 },
      getQuadraticBounds(x, y, cx, cy, x2, y2),
    );
    for (const [px, py] of [
      [50, 50],
      [0, 0],
      [200, -30],
      [-10, 80],
    ] as const) {
      fam.add(
        `quad dist ${label} from ${px},${py}`,
        'distToQuadraticCurve',
        { px, py, x, y, cx, cy, x2, y2 },
        distToQuadraticCurve(px, py, x, y, cx, cy, x2, y2),
      );
    }
    fam.add(
      `quad dist ${label} 4 steps`,
      'distToQuadraticCurve',
      { px: 40, py: 30, x, y, cx, cy, x2, y2, steps: 4 },
      distToQuadraticCurve(40, 30, x, y, cx, cy, x2, y2, 4),
    );
  }

  // Route measuring helpers.
  const measured: ReadonlyArray<[string, RoutePoint[]]> = [
    [
      'test L',
      [
        [0, 0],
        [100, 0],
        [100, 100],
      ],
    ],
    ['empty', []],
    ['single point', [[7, 8]]],
    [
      'zero-length segment inside',
      [
        [0, 0],
        [0, 0],
        [30, 40],
      ],
    ],
    [
      'diagonal',
      [
        [0, 0],
        [30, 40],
        [60, 0],
      ],
    ],
  ];
  for (const [label, points] of measured) {
    fam.add(
      `route length ${label}`,
      'getRouteLength',
      { points },
      getRouteLength(points),
    );
    for (const t of [-0.5, 0, 0.25, 0.5, 0.75, 1, 1.5]) {
      fam.add(
        `route point ${label} t ${t}`,
        'getRoutePointAt',
        { points, t },
        getRoutePointAt(points, t),
      );
    }
    for (const [px, py] of [
      [110, 50],
      [50, -10],
      [0, 0],
    ] as const) {
      fam.add(
        `route dist ${label} from ${px},${py}`,
        'distToRoute',
        { px, py, points },
        distToRoute(px, py, points),
      );
    }
  }

  // Connector box of every node kind (stencil labels extend it).
  for (const kind of NODE_KINDS) {
    for (const [sizeName, w, h] of [
      ['64x64', 64, 64],
      ['200x100', 200, 100],
    ] as const) {
      const el = node(kind, 'n', 10, 20, w, h);
      fam.add(
        `connector box ${kind} ${sizeName}`,
        'getConnectorBox',
        { el },
        getConnectorBox(el),
      );
    }
  }
  const flipped = node('stencil-wide-label', 'n', 74, 84, -64, -64);
  fam.add(
    'connector box stencil-wide-label negative size',
    'getConnectorBox',
    { el: flipped },
    getConnectorBox(flipped),
  );

  // Lifted from tests/draw_selection.test.ts.
  const rectAt = (id: string, x: number, y: number, w = 100, h = 60) =>
    node('rectangle', id, x, y, w, h);
  {
    const arrow = (o: Partial<ArrowElement>): ArrowElement => ({
      id: 'a1',
      type: 'arrow',
      x: 0,
      y: 0,
      x2: 200,
      y2: 200,
      ...NODE_STYLE,
      ...o,
    });
    const add = (
      name: string,
      el: ArrowElement | LineElement,
      elements: Element[],
    ) =>
      fam.add(
        name,
        'resolveArrowEndpoints',
        { el, elements },
        resolveArrowEndpoints(el, elements),
      );
    add('test: no connections', arrow({ x: 10, y: 20, x2: 110, y2: 120 }), []);
    add(
      'test: start bound faces other end',
      arrow({ x: 999, y: 999, startElementId: 'r1' }),
      [rectAt('r1', 0, 0, 100, 60)],
    );
    add(
      'test: end bound faces other end',
      arrow({ x2: 999, y2: 999, endElementId: 'r2' }),
      [rectAt('r2', 100, 200, 80, 40)],
    );
    add(
      'test: both bound face each other',
      arrow({
        x: 999,
        y: 999,
        x2: 999,
        y2: 999,
        startElementId: 'r1',
        endElementId: 'r2',
      }),
      [rectAt('r1', 0, 0, 100, 60), rectAt('r2', 300, 400, 60, 40)],
    );
    add(
      'test: stored border anchors preserved',
      arrow({
        x: 0,
        y: 12,
        x2: 330,
        y2: 400,
        startElementId: 'r1',
        endElementId: 'r2',
      }),
      [rectAt('r1', 0, 0, 100, 60), rectAt('r2', 300, 400, 60, 40)],
    );
    add(
      'test: missing element falls back to stored',
      arrow({ x: 5, y: 6, startElementId: 'missing' }),
      [],
    );
    const prep = {
      ...node('shape-terminator', 's1', 0, 0, 200, 100),
      kind: 'preparation',
    } as Element;
    const prepArrow = arrow({
      x: 500,
      y: 50,
      x2: 500,
      y2: 50,
      startElementId: 's1',
    });
    add('test: shape outline endpoint', prepArrow, [prep, prepArrow]);
    const moved = rectAt('r1', 300, 300);
    const other = rectAt('r2', 0, 0);
    const pinned = connector({
      id: 'l1',
      x: 50,
      y: 0,
      x2: 500,
      y2: 500,
      startElementId: 'r1',
      startAnchor: { x: 0.5, y: 0 },
      endElementId: 'r2',
    });
    add('test: pinned end follows moved element', pinned, [
      moved,
      other,
      pinned,
    ]);
    const data = node('shape-data', 's1', 0, 0, 400, 100);
    const resized = connector({
      id: 'l1',
      startElementId: 's1',
      startAnchor: { x: 0.9, y: 0.5 },
    });
    add('test: pinned end on outline after resize', resized, [data, resized]);
  }
  {
    const elbowLine = (o: Partial<LineElement> = {}) =>
      connector({
        id: 'l1',
        x: 50,
        y: 30,
        x2: 60,
        y2: 230,
        routing: 'elbow',
        startElementId: 'top',
        endElementId: 'bottom',
        ...o,
      });
    const add = (name: string, el: LineElement, elements: Element[]) =>
      fam.add(
        name,
        'resolveConnectorRoute',
        { el, elements },
        resolveConnectorRoute(el, elements),
      );
    const l1 = elbowLine();
    add('test: nearly aligned runs straight', l1, [
      rectAt('top', 0, 0, 160, 70),
      rectAt('bottom', 10, 200, 160, 70),
      l1,
    ]);
    add('test: meets in the overlap', l1, [
      rectAt('top', 0, 0, 100, 70),
      rectAt('bottom', 80, 200, 100, 70),
      l1,
    ]);
    add('test: stepped when sides do not overlap', l1, [
      rectAt('top', 0, 0, 100, 70),
      rectAt('bottom', 140, 300, 100, 70),
      l1,
    ]);
    const l2 = elbowLine({ startAnchor: { x: 0.5, y: 1 } });
    add('test: pinned ends stay', l2, [
      rectAt('top', 0, 0, 160, 70),
      rectAt('bottom', 10, 200, 160, 70),
      l2,
    ]);
    const straight = connector({ id: 'l1', x: 0, y: 0, x2: 50, y2: 50 });
    add('test: straight returns two ends', straight, [straight]);
    const r1 = rectAt('r1', 0, 0);
    const r2 = rectAt('r2', 300, 200);
    const l3 = connector({
      id: 'l1',
      x: 50,
      y: 30,
      x2: 350,
      y2: 230,
      routing: 'elbow',
      startElementId: 'r1',
      endElementId: 'r2',
    });
    add('test: floating ends on facing mid-side ports', l3, [r1, r2, l3]);
    const l4 = connector({
      id: 'l1',
      routing: 'elbow',
      startElementId: 'orders',
      endElementId: 'db',
    });
    add('test: wide shape routes sideways', l4, [
      rectAt('orders', 492, 2, 160, 70),
      rectAt('payments', 492, 132, 160, 70),
      rectAt('db', 752, 124, 160, 80),
      l4,
    ]);
    const l5 = connector({
      id: 'l1',
      routing: 'elbow',
      startElementId: 'top',
      endElementId: 'below',
    });
    add('test: vertical stack top and bottom', l5, [
      rectAt('top', 0, 0, 160, 60),
      rectAt('below', 20, 200, 160, 60),
      l5,
    ]);
    const l6 = connector({
      id: 'l1',
      x: 100,
      y: 30,
      x2: 350,
      y2: 230,
      routing: 'elbow',
      startElementId: 'r1',
      startAnchor: { x: 1, y: 0.5 },
      endElementId: 'r2',
    });
    add('test: pinned elbow end leaves by anchor side', l6, [r1, r2, l6]);
  }
  // Lifted from tests/stencil_label_routing.test.ts.
  for (const [label, target, routing] of [
    ['elbow going down below the label', { x: -48, y: 400 }, 'elbow'],
    ['elbow leaving sideways past the label', { x: 500, y: 120 }, 'elbow'],
    ['diagonal straight off the label', { x: 260, y: 260 }, 'straight'],
  ] as const) {
    const icon = createStencil(
      'llm',
      { kind: 'builtin', ref: 'generic/server' },
      32,
      32,
      NODE_STYLE,
      WIDE_LABEL,
    );
    const rect = node('rectangle', 'rect', target.x, target.y, 160, 70);
    const line = connector({
      id: 'line',
      x: 32,
      y: 32,
      x2: target.x + 80,
      y2: target.y + 35,
      arrowHead: 'end',
      routing,
      startElementId: 'llm',
      endElementId: 'rect',
    });
    scene(`test: icon label ${label}`, line, [icon, rect]);
  }

  // Rectangle A against rectangle B on a grid of placements and sizes.
  const a = rectAt('A', 0, 0, 100, 60);
  for (const [placeName, dx, dy] of PLACEMENTS) {
    for (const [sizeName, w, h] of SIZES) {
      const b = rectAt('B', 50 + dx - w / 2, 30 + dy - h / 2, w, h);
      const [sx, sy] = center(a);
      const [ex, ey] = center(b);
      const line = connector({
        x: sx,
        y: sy,
        x2: ex,
        y2: ey,
        routing: 'elbow',
        startElementId: 'A',
        endElementId: 'B',
      });
      scene(`rect to rect ${sizeName} ${placeName}`, line, [a, b]);
    }
  }

  // Every node kind as start and as end, against a rectangle.
  for (const kind of NODE_KINDS) {
    const isStencil = kind.startsWith('stencil');
    const [w, h] = isStencil ? [64, 64] : [120, 70];
    const n = node(kind, 'N', 0, 0, w, h);
    for (const [placeName, dx, dy] of [
      ['right', 300, 0],
      ['below', 0, 260],
      ['below-right', 300, 260],
      ['above-left', -300, -220],
      ['right slightly lower', 260, 30],
    ] as const) {
      const r = rectAt('R', w / 2 + dx - 60, h / 2 + dy - 35, 120, 70);
      const [nx, ny] = center(n);
      const [rx, ry] = center(r);
      for (const routing of ['elbow', 'straight'] as const) {
        const out = connector({
          x: nx,
          y: ny,
          x2: rx,
          y2: ry,
          routing,
          startElementId: 'N',
          endElementId: 'R',
        });
        scene(`${kind} to rect ${placeName} ${routing}`, out, [n, r]);
      }
      const back = connector({
        x: rx,
        y: ry,
        x2: nx,
        y2: ny,
        routing: 'elbow',
        startElementId: 'R',
        endElementId: 'N',
      });
      scene(`rect to ${kind} ${placeName} elbow`, back, [n, r]);
    }
  }

  // Every start and end anchor combination, two rectangles on a diagonal.
  {
    const b = rectAt('B', 250, 200, 100, 60);
    for (const [sName, sAnchor] of ANCHORS) {
      for (const [eName, eAnchor] of ANCHORS) {
        const line = connector({
          x: 50,
          y: 30,
          x2: 300,
          y2: 230,
          routing: 'elbow',
          startElementId: 'A',
          endElementId: 'B',
          ...(sAnchor && { startAnchor: sAnchor }),
          ...(eAnchor && { endAnchor: eAnchor }),
        });
        scene(`anchors start ${sName} end ${eName}`, line, [a, b]);
      }
    }
    // Anchors on rotated and labeled start nodes.
    for (const kind of [
      'rectangle-rotated',
      'stencil-wide-label',
      'stencil-wide-label-rotated',
      'shape-data',
      'ellipse',
      'rhombus',
    ] as const) {
      const n = node(
        kind,
        'A',
        0,
        0,
        kind.startsWith('stencil') ? 64 : 100,
        kind.startsWith('stencil') ? 64 : 60,
      );
      for (const [sName, sAnchor] of ANCHORS) {
        const line = connector({
          x: 50,
          y: 30,
          x2: 300,
          y2: 230,
          routing: 'elbow',
          startElementId: 'A',
          endElementId: 'B',
          ...(sAnchor && { startAnchor: sAnchor }),
        });
        scene(`anchors ${kind} start ${sName}`, line, [n, b]);
      }
    }
  }

  // One end free, at points all around the attached box.
  for (const [placeName, dx, dy] of PLACEMENTS.slice(0, 8)) {
    const free: RoutePoint = [50 + dx, 30 + dy];
    const startBound = connector({
      x: 50,
      y: 30,
      x2: free[0],
      y2: free[1],
      routing: 'elbow',
      startElementId: 'A',
    });
    scene(`free end ${placeName}`, startBound, [a]);
    const endBound = connector({
      x: free[0],
      y: free[1],
      x2: 50,
      y2: 30,
      routing: 'elbow',
      endElementId: 'A',
    });
    scene(`free start ${placeName}`, endBound, [a]);
  }
  const unbound = connector({
    x: 10,
    y: 20,
    x2: 210,
    y2: 120,
    routing: 'elbow',
  });
  scene('both ends free elbow', unbound, []);
  const missing = connector({
    x: 10,
    y: 20,
    x2: 210,
    y2: 120,
    routing: 'elbow',
    startElementId: 'gone',
    endElementId: 'A',
  });
  scene('missing start element elbow', missing, [a]);

  // Stored points near the border: within 1px they stay (nearest border
  // point), beyond 1px the end floats to face the other end.
  {
    const b = rectAt('B', 300, 200, 100, 60);
    for (const [label, offset] of [
      ['on border', 0],
      ['0.5 outside', 0.5],
      ['exactly 1 outside', 1],
      ['just over 1 outside', nextUp(1)],
      ['1 inside', -1],
      ['just over 1 inside', -nextUp(1)],
    ] as const) {
      const line = connector({
        x: 100 + offset,
        y: 12,
        x2: 330,
        y2: 200 - offset,
        startElementId: 'A',
        endElementId: 'B',
      });
      scene(`stored snap ${label}`, line, [a, b]);
    }
  }

  return fam;
}

// ── Entry point ───────────────────────────────────────────────────────────────

it('writes the parity fixtures', () => {
  for (const family of [buildValidation(), buildConnectors()]) {
    const file = writeFamily(family);
    expect(family.cases.length).toBeGreaterThan(0);
    expect(file.endsWith('.json')).toBe(true);
  }
});
