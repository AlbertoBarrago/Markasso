/**
 * Round-trip corpus for the native macOS port (markasso-apple).
 *
 * Writes real `.markasso` files, produced by the web's own writers wherever one
 * exists, plus a `manifest.json` that records which reader accepts each file.
 * markasso-apple loads every file, saves it back, and
 * `scripts/roundtrip-check.fixture.ts` checks that the web loads the saved file
 * with the same scene (markasso-apple `docs/04-fixtures.md`).
 *
 * Sources:
 * - `web-export`: `exportMarkasso` (src/io/markasso.ts) with the browser
 *   download stubbed, so the bytes are exactly what the web saves.
 * - `mcp-save`: `saveMarkassoFile` (mcp/src/storage.ts) on a temp file.
 * - `reader-case`: the `files` fixture corpus (scripts/fixtures/files.ts):
 *   bare arrays, missing or newer versions, odd viewports, unknown keys,
 *   invalid elements, and files neither reader accepts.
 * - `handmade`: inputs no writer produces but a reader must take, such as
 *   `-0` coordinates (`JSON.stringify` writes `0`).
 */
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { saveMarkassoFile } from '../../mcp/src/storage';
import type { Viewport } from '../../src/core/viewport';
import {
  ARROW_HEAD_STYLES,
  CONNECTOR_ROUTINGS,
  type Element,
  SHAPE_KINDS,
} from '../../src/elements/element';
import { exportMarkasso } from '../../src/io/markasso';
import { generatorInfo, prng, ROOT } from './common';
import { mcpOutcome, corpus as readerCases, webOutcome } from './files';
import { SAMPLE, SAMPLE_NAMES, sample } from './samples';

export const CORPUS_DIR = resolve(
  ROOT,
  process.env.MARKASSO_CORPUS_OUT ??
    '../markasso-apple/Packages/MarkassoKit/Tests/Corpus',
);

export type CorpusSource =
  | 'web-export'
  | 'mcp-save'
  | 'reader-case'
  | 'handmade';

export interface CorpusEntry {
  readonly file: string;
  readonly label: string;
  readonly source: CorpusSource;
  readonly webAccepts: boolean;
  readonly mcpAccepts: boolean;
  /** The file declares a version above 1: the app opens it read-only and never saves it back. */
  readonly newerVersion: boolean;
}

/**
 * Whether a file declares a version above the supported one (any number > 1,
 * integer or not), from the file text alone, so neither the app nor its
 * report decides which files are compared (markasso-apple docs/01-file-format.md 1.3).
 */
export function declaresNewerVersion(text: string): boolean {
  let root: unknown;
  try {
    root = JSON.parse(text);
  } catch {
    return false;
  }
  if (!root || typeof root !== 'object' || Array.isArray(root)) return false;
  const version = (root as { version?: unknown }).version;
  return typeof version === 'number' && version > 1;
}

export interface CorpusManifest {
  readonly generator: { version: string; commit: string };
  readonly entries: CorpusEntry[];
}

/** The bytes `exportMarkasso` hands to the browser download. */
function webExport(
  elements: ReadonlyArray<Element>,
  viewport: Viewport,
): string {
  const g = globalThis as Record<string, unknown>;
  const saved = {
    Blob: g.Blob,
    document: g.document,
    setTimeout: g.setTimeout,
    createObjectURL: URL.createObjectURL,
    revokeObjectURL: URL.revokeObjectURL,
  };
  const hadDocument = 'document' in g;
  let captured: string | null = null;
  g.Blob = class {
    constructor(parts: string[]) {
      captured = parts.join('');
    }
  };
  g.document = { createElement: () => ({ click() {} }) };
  // The revoke timer would outlive the stubs: drop it.
  g.setTimeout = () => 0;
  URL.createObjectURL = () => 'blob:corpus';
  URL.revokeObjectURL = () => {};
  try {
    exportMarkasso({ elements, viewport });
  } finally {
    g.Blob = saved.Blob;
    g.setTimeout = saved.setTimeout;
    URL.createObjectURL = saved.createObjectURL;
    URL.revokeObjectURL = saved.revokeObjectURL;
    if (hadDocument) g.document = saved.document;
    else delete g.document;
  }
  if (captured === null)
    throw new Error('corpus: exportMarkasso wrote nothing');
  return captured;
}

async function mcpSave(
  dir: string,
  elements: ReadonlyArray<Element>,
): Promise<string> {
  const path = join(dir, 'save.markasso');
  await saveMarkassoFile(path, elements);
  return readFileSync(path, 'utf8');
}

const VIEWPORT: Viewport = { offsetX: -120.25, offsetY: 64, zoom: 0.75 };

/** One of every sample, with unique ids. */
function allTypes(): Element[] {
  return SAMPLE_NAMES.map((name) => sample(name, { id: `s-${name}` }));
}

/** Labels and text that stress string handling: normalization, emoji, scripts. */
function unicodeScene(): Element[] {
  return [
    sample('rect', { id: 'u-nfc', label: 'Café crème' }),
    sample('rect', { id: 'u-nfd', x: 200, label: 'Café crème' }),
    sample('ellipse', {
      id: 'u-emoji',
      label: '\u{1F468}‍\u{1F469}‍\u{1F467} \u{1F680}',
    }),
    sample('text', {
      id: 'u-text',
      content: 'Line one\nRiga due àèì\n日本語 العربية\n\ttab "quoted" \\ back',
    }),
    sample('rect', { id: 'u-é', x: 400, groupId: 'g-é' }),
    sample('rect', { id: 'u-é', x: 600, groupId: 'g-é' }),
  ];
}

/** Fields the validator does not know, which both readers keep. */
function extrasScene(): Element[] {
  return [
    sample('rect', {
      id: 'x-rect',
      futureField: [1, 'two', { three: null }],
      zIndexHint: 3,
    }),
    sample('arrow', {
      id: 'x-arrow',
      futureRouting: { mode: 'smart', weight: 0.5 },
    }),
    sample('icon', {
      id: 'x-icon',
      meta: { source: 'pack', tags: ['a', 'b'] },
    }),
  ];
}

/** Every optional field and every enum value the element types persist. */
function fieldsScene(): Element[] {
  const anchorA = { x: 1, y: 0.5 };
  const anchorB = { x: 0, y: 0.25 };
  const out: Element[] = [
    sample('rect', {
      id: 'f-rect',
      rotation: 0.7,
      strokeStyle: 'dashed',
      lineCap: 'butt',
      lineJoin: 'bevel',
      shadowBlur: 8,
      shadowColor: 'rgba(0, 0, 0, 0.4)',
      shadowOffsetX: 2,
      shadowOffsetY: -3,
      visible: false,
      layerName: 'Layer 2',
      locked: true,
      groupId: 'g-1',
      labelColor: '#ff0000',
      labelFontSize: 22,
    }),
    sample('ellipse', {
      id: 'f-ellipse',
      strokeStyle: 'dotted',
      lineCap: 'square',
      lineJoin: 'miter',
      groupId: 'g-1',
    }),
    sample('rhombus', {
      id: 'f-rhombus',
      strokeStyle: 'solid',
      lineCap: 'round',
      lineJoin: 'round',
      visible: true,
      locked: false,
    }),
  ];
  SHAPE_KINDS.forEach((kind, i) => {
    out.push(
      sample('shape', {
        id: `f-shape-${kind}`,
        kind,
        x: i * 150,
        y: 400,
        label: kind,
        labelColor: '#0055ff',
      }),
    );
  });
  ARROW_HEAD_STYLES.forEach((style, i) => {
    out.push(
      sample('line', {
        id: `f-line-${style}`,
        y: 600 + i * 40,
        startElementId: 'f-rect',
        endElementId: 'f-ellipse',
        startAnchor: anchorA,
        endAnchor: anchorB,
        routing: CONNECTOR_ROUTINGS[i % CONNECTOR_ROUTINGS.length],
        startHeadStyle: style,
        endHeadStyle: ARROW_HEAD_STYLES[(i + 1) % ARROW_HEAD_STYLES.length],
        arrowHead: (['none', 'start', 'end', 'both'] as const)[i % 4],
        label: `line ${style}`,
        labelColor: '#00aa00',
      }),
      sample('arrow', {
        id: `f-arrow-${style}`,
        y: 900 + i * 40,
        startElementId: 'f-rhombus',
        endElementId: 'f-rect',
        startAnchor: anchorB,
        endAnchor: anchorA,
        routing: CONNECTOR_ROUTINGS[(i + 1) % CONNECTOR_ROUTINGS.length],
        endHeadStyle: style,
      }),
    );
  });
  out.push(
    sample('line', { id: 'f-curved-line', cx: 40, cy: -30, arrowHead: 'end' }),
  );
  (['left', 'center', 'right'] as const).forEach((textAlign, i) => {
    out.push(
      sample('text', {
        id: `f-text-${textAlign}`,
        y: 1300 + i * 60,
        textAlign,
        padding: 6,
        isCode: i === 0,
        bold: i !== 1,
        italic: i === 1,
        underline: i === 2,
        strikethrough: i === 0,
      }),
    );
  });
  out.push(sample('polygon', { id: 'f-open-polygon', closed: false }));
  out.push(sample('freehand', { id: 'f-freehand' }));
  return out;
}

/** A large board: mixed types, positions from a fixed seed. */
function bigScene(count: number): Element[] {
  const rand = prng(20261031);
  const names = [
    'rect',
    'ellipse',
    'rhombus',
    'text',
    'line',
    'arrow',
    'freehand',
  ] as const;
  const out: Element[] = [];
  for (let i = 0; i < count; i++) {
    const name = names[i % names.length]!;
    const x = Math.round(rand() * 20000) / 4;
    const y = Math.round(rand() * 20000) / 4;
    const base = SAMPLE[name] as Record<string, unknown>;
    const overrides: Record<string, unknown> = { id: `big-${i}`, x, y };
    if ('x2' in base) {
      overrides.x2 = x + 40;
      overrides.y2 = y + 25;
    }
    // Unbound connectors: the samples point at ids that do not exist here.
    const el = sample(name, overrides) as unknown as Record<string, unknown>;
    delete el.startElementId;
    delete el.endElementId;
    delete el.startAnchor;
    delete el.endAnchor;
    out.push(el as unknown as Element);
  }
  return out;
}

function slug(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/** Builds the corpus in memory as [label, source, text]. */
async function build(): Promise<Array<[string, CorpusSource, string]>> {
  const out: Array<[string, CorpusSource, string]> = [];
  const dir = mkdtempSync(join(tmpdir(), 'markasso-corpus-'));
  try {
    const scenes: Array<[string, Element[]]> = [
      ['all element types', allTypes()],
      ['unicode labels and text', unicodeScene()],
      ['unknown element fields', extrasScene()],
      ['every optional field', fieldsScene()],
      ['empty board', []],
      ['5000 elements', bigScene(5000)],
    ];
    for (const [label, elements] of scenes) {
      out.push([
        `web export: ${label}`,
        'web-export',
        webExport(elements, VIEWPORT),
      ]);
    }
    out.push([
      'web export: default viewport',
      'web-export',
      webExport(allTypes(), { offsetX: 0, offsetY: 0, zoom: 1 }),
    ]);
    for (const [label, elements] of scenes) {
      out.push([
        `mcp save: ${label}`,
        'mcp-save',
        await mcpSave(dir, elements),
      ]);
    }
    for (const [label, text] of readerCases()) {
      out.push([`reader case: ${label}`, 'reader-case', text]);
    }
    // `JSON.stringify(-0)` is "0", so the -0 has to be written by hand.
    const zero = JSON.stringify({
      version: 1,
      elements: [sample('rect', { id: 'z', x: 0, y: 0, rotation: 0 })],
    });
    out.push([
      'handmade: negative zero coordinates',
      'handmade',
      zero
        .replace('"x":0', '"x":-0')
        .replace('"y":0', '"y":-0')
        .replace('"rotation":0', '"rotation":-0'),
    ]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  return out;
}

/** Writes the corpus and its manifest to `CORPUS_DIR`, replacing older `.markasso` files there. */
export async function writeCorpus(): Promise<CorpusManifest> {
  const items = await build();
  mkdirSync(CORPUS_DIR, { recursive: true });
  for (const name of readdirSync(CORPUS_DIR)) {
    if (name.endsWith('.markasso')) unlinkSync(join(CORPUS_DIR, name));
  }
  const probe = mkdtempSync(join(tmpdir(), 'markasso-corpus-probe-'));
  const entries: CorpusEntry[] = [];
  try {
    const seen = new Set<string>();
    for (const [index, [label, source, text]] of items.entries()) {
      const file = `${String(index + 1).padStart(3, '0')}-${slug(label)}.markasso`;
      if (seen.has(file))
        throw new Error(`corpus: duplicate file name ${file}`);
      seen.add(file);
      writeFileSync(join(CORPUS_DIR, file), text, 'utf8');
      const mcp = (await mcpOutcome(probe, text)) as { accepted: boolean };
      entries.push({
        file,
        label,
        source,
        webAccepts: webOutcome(text).accepted,
        mcpAccepts: mcp.accepted,
        newerVersion: declaresNewerVersion(text),
      });
    }
  } finally {
    rmSync(probe, { recursive: true, force: true });
  }
  const manifest: CorpusManifest = { generator: generatorInfo(), entries };
  writeFileSync(
    join(CORPUS_DIR, 'manifest.json'),
    `${JSON.stringify(manifest, null, 2)}\n`,
    'utf8',
  );
  return manifest;
}
