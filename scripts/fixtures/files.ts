/**
 * `files` family: how the two .markasso readers treat real file contents.
 *
 * - Web (`fn: validateMarkassoFile`): `validateMarkassoFile` is not exported
 *   from src/io/markasso.ts, so each file goes through its exported caller
 *   `importMarkasso` with stubbed browser globals (FileReader, window, alert,
 *   a fake History that captures the LOAD_SCENE). The file's own viewport is
 *   recomputed from the exported pieces it uses (`validateViewport`) and the
 *   generator checks that the reproduction matches what importMarkasso loaded.
 * - MCP (`fn: loadMarkassoFile`): the real function on a temp file.
 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadMarkassoFile, StorageError } from '../../mcp/src/storage';
import type { Command } from '../../src/commands/commands';
import { fitToElements, type Viewport } from '../../src/core/viewport';
import type { History } from '../../src/engine/history';
import { validateViewport } from '../../src/io/element_validation';
import { importMarkasso } from '../../src/io/markasso';
import { Family, type Json } from './common';

/** Window size the web reader fits to when a file has no valid viewport. */
export const WINDOW = { innerWidth: 1280, innerHeight: 800 } as const;

const STYLE = {
  strokeColor: '#000000',
  fillColor: 'transparent',
  strokeWidth: 2,
  opacity: 1,
  roughness: 0,
};

const ELEMENTS: Json[] = [
  { id: 'a', type: 'rectangle', x: 0, y: 0, width: 120, height: 60, ...STYLE },
  {
    id: 'b',
    type: 'ellipse',
    x: 300,
    y: 40,
    width: 100,
    height: 80,
    ...STYLE,
    label: 'DB',
  },
  {
    id: 'c',
    type: 'arrow',
    x: 120,
    y: 30,
    x2: 300,
    y2: 80,
    ...STYLE,
    startElementId: 'a',
    endElementId: 'b',
  },
  {
    id: 'd',
    type: 'text',
    x: -40,
    y: 200,
    width: 80,
    height: 24,
    content: 'Note',
    fontSize: 20,
    fontFamily: 'Arial, sans-serif',
    ...STYLE,
  },
];

const VIEWPORT = { offsetX: 12.5, offsetY: -40, zoom: 1.5 };

export type WebOutcome =
  | { accepted: false; reason: 'empty' | 'unparseable' | 'invalid' }
  | {
      accepted: true;
      elements: unknown[];
      viewport: Viewport | null;
      loadViewport: Viewport;
      warnsNewerVersion: boolean;
    };

/** Runs importMarkasso on `text` with the browser globals it needs stubbed. */
function webRead(text: string): {
  alert: string | null;
  loaded: Extract<Command, { type: 'LOAD_SCENE' }> | null;
  warnings: string[];
} {
  const g = globalThis as Record<string, unknown>;
  const saved = {
    FileReader: g.FileReader,
    window: g.window,
    alert: g.alert,
    warn: console.warn,
  };
  const hadWindow = 'window' in g;
  let alert: string | null = null;
  let loaded: Extract<Command, { type: 'LOAD_SCENE' }> | null = null;
  const warnings: string[] = [];
  class StubReader {
    onload: ((ev: { target: { result: string } }) => void) | null = null;
    readAsText(file: { fixtureText: string }): void {
      this.onload?.({ target: { result: file.fixtureText } });
    }
  }
  g.FileReader = StubReader;
  g.window = WINDOW;
  g.alert = (message: string) => {
    alert = message;
  };
  console.warn = (message: unknown) => warnings.push(String(message));
  const history = {
    dispatch(command: Command) {
      if (command.type !== 'LOAD_SCENE') {
        throw new Error(`unexpected ${command.type}`);
      }
      loaded = command;
    },
  } as unknown as History;
  try {
    importMarkasso({ fixtureText: text } as unknown as File, history);
  } finally {
    g.FileReader = saved.FileReader;
    g.alert = saved.alert;
    if (hadWindow) g.window = saved.window;
    else delete g.window;
    console.warn = saved.warn;
  }
  return { alert, loaded, warnings };
}

export function webOutcome(text: string): WebOutcome {
  const { alert, loaded, warnings } = webRead(text);
  if (!loaded) {
    if (alert === null) return { accepted: false, reason: 'empty' };
    if (alert.startsWith('Failed to read')) {
      return { accepted: false, reason: 'unparseable' };
    }
    if (alert.includes('does not appear to be a valid')) {
      return { accepted: false, reason: 'invalid' };
    }
    throw new Error(`unexpected alert: ${alert}`);
  }
  const { elements, viewport: loadViewport } = loaded as Extract<
    Command,
    { type: 'LOAD_SCENE' }
  >;
  // Reproduce validateMarkassoFile's viewport, then check it is what
  // importMarkasso loaded (the file's own one, else a fit to the window).
  const data = JSON.parse(text) as Record<string, unknown>;
  const viewport = validateViewport(data.viewport);
  const expected =
    viewport ?? fitToElements(elements, WINDOW.innerWidth, WINDOW.innerHeight);
  if (JSON.stringify(expected) !== JSON.stringify(loadViewport)) {
    throw new Error('files: viewport reproduction drifted from importMarkasso');
  }
  return {
    accepted: true,
    elements,
    viewport,
    loadViewport,
    warnsNewerVersion: warnings.some((w) => w.includes('newer than supported')),
  };
}

export async function mcpOutcome(dir: string, text: string): Promise<Json> {
  const path = join(dir, 'case.markasso');
  writeFileSync(path, text, 'utf8');
  try {
    const elements = await loadMarkassoFile(path);
    return { accepted: true, elements, viewport: null };
  } catch (error) {
    if (!(error instanceof StorageError)) throw error;
    const reason = error.message.startsWith('Cannot read')
      ? 'unparseable'
      : 'invalid';
    return { accepted: false, reason };
  }
}

function pretty(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

/** File contents to read, as [label, text]. Also the base of the round-trip corpus (corpus.ts). */
export function corpus(): Array<[string, string]> {
  const file = (extra: Json) => pretty({ version: 1, ...extra });
  const els = ELEMENTS;
  const rect = els[0]!;
  return [
    // What each writer produces.
    [
      'web export with viewport',
      pretty({ version: 1, viewport: VIEWPORT, elements: els }),
    ],
    [
      'mcp output without viewport',
      `${pretty({ version: 1, elements: els })}\n`,
    ],
    ['bare elements array', pretty(els)],
    ['bare empty array', '[]'],
    ['elements without version', pretty({ elements: els })],
    [
      'elements and viewport without version',
      pretty({ viewport: VIEWPORT, elements: els }),
    ],
    // Versions.
    ['version 2 (newer)', file({ version: 2, elements: els })],
    [
      'version 99 with viewport',
      file({ version: 99, viewport: VIEWPORT, elements: els }),
    ],
    ['version 0', file({ version: 0, elements: els })],
    ['version -1', file({ version: -1, elements: els })],
    ['version 1.5', file({ version: 1.5, elements: els })],
    ['version "1" (string)', file({ version: '1', elements: els })],
    ['version null', file({ version: null, elements: els })],
    ['version true', file({ version: true, elements: els })],
    [
      'version written 1.0',
      `{"version": 1.0, "elements": ${JSON.stringify(els)}}`,
    ],
    [
      'version written 1e0',
      `{"version": 1e0, "elements": ${JSON.stringify(els)}}`,
    ],
    [
      'version written 10e-1',
      `{"version": 10e-1, "elements": ${JSON.stringify(els)}}`,
    ],
    // Viewports.
    [
      'viewport zoom 0',
      file({ viewport: { ...VIEWPORT, zoom: 0 }, elements: els }),
    ],
    [
      'viewport zoom at min 0.05',
      file({ viewport: { ...VIEWPORT, zoom: 0.05 }, elements: els }),
    ],
    [
      'viewport zoom below min 0.049',
      file({ viewport: { ...VIEWPORT, zoom: 0.049 }, elements: els }),
    ],
    [
      'viewport zoom at max 30',
      file({ viewport: { ...VIEWPORT, zoom: 30 }, elements: els }),
    ],
    [
      'viewport zoom above max 31',
      file({ viewport: { ...VIEWPORT, zoom: 31 }, elements: els }),
    ],
    [
      'viewport negative zoom',
      file({ viewport: { ...VIEWPORT, zoom: -1 }, elements: els }),
    ],
    [
      'viewport offset as string',
      file({ viewport: { ...VIEWPORT, offsetX: '12' }, elements: els }),
    ],
    [
      'viewport without zoom',
      file({ viewport: { offsetX: 1, offsetY: 2 }, elements: els }),
    ],
    [
      'viewport offset beyond 1e7',
      file({ viewport: { ...VIEWPORT, offsetY: 10_000_001 }, elements: els }),
    ],
    ['viewport null', file({ viewport: null, elements: els })],
    ['viewport as array', file({ viewport: [0, 0, 1], elements: els })],
    [
      'viewport with extra keys',
      file({ viewport: { ...VIEWPORT, rotation: 1 }, elements: els }),
    ],
    [
      'invalid viewport and no elements',
      file({ viewport: { zoom: 0 }, elements: [] }),
    ],
    // Unknown keys.
    [
      'unknown top-level cloud key',
      file({ cloud: { boardId: 'b-123' }, viewport: VIEWPORT, elements: els }),
    ],
    [
      'unknown top-level title and appState',
      file({ title: 'Board', appState: { gridVisible: false }, elements: els }),
    ],
    [
      'elements with unknown fields',
      file({ elements: [{ ...rect, futureField: { nested: [1, 2] }, z: 3 }] }),
    ],
    // Element lists.
    ['empty elements array', file({ elements: [] })],
    [
      'one invalid element among valid ones',
      file({ elements: [rect, { id: 'bad', type: 'rectangle' }, els[1]] }),
    ],
    [
      'only invalid elements',
      file({ elements: [{ id: 'bad', type: 'rectangle' }] }),
    ],
    [
      'duplicate ids keep the first',
      file({ elements: [rect, { ...rect, x: 500 }] }),
    ],
    [
      'unknown element type',
      file({ elements: [{ ...rect, type: 'hexagon' }] }),
    ],
    ['elements as object', file({ elements: { a: rect } })],
    ['elements as string', file({ elements: 'a' })],
    ['elements null', file({ elements: null })],
    ['elements missing', file({ viewport: VIEWPORT })],
    [
      'elements key in nested object',
      pretty({ data: { version: 1, elements: els } }),
    ],
    // Not JSON or not an object.
    ['empty file', ''],
    ['whitespace only', ' \n\t'],
    ['truncated JSON', pretty({ version: 1, elements: els }).slice(0, 80)],
    ['trailing comma', '{"version": 1, "elements": [],}'],
    ['comment in JSON', '// board\n{"version": 1, "elements": []}'],
    ['byte order mark', `﻿${pretty({ version: 1, elements: els })}`],
    ['JSON null', 'null'],
    ['JSON number', '42'],
    ['JSON string', '"elements"'],
    ['JSON true', 'true'],
    [
      'leading and trailing whitespace',
      `\n  ${pretty({ version: 1, elements: els })}  \n`,
    ],
    ['single quotes', "{'version': 1, 'elements': []}"],
  ];
}

export async function buildFiles(): Promise<Family> {
  const fam = new Family('files', {
    webReader:
      'validateMarkassoFile is not exported: the web cases run its caller importMarkasso with stubbed browser globals. ' +
      'reason "empty" = the reader got an empty string and does nothing; "unparseable" = JSON.parse threw; ' +
      '"invalid" = validateMarkassoFile returned null. viewport = the file viewport after validateViewport, or null; ' +
      'loadViewport = the viewport importMarkasso loads (viewport, else fitToElements(elements, window)).',
    loadViewportWindow: {
      width: WINDOW.innerWidth,
      height: WINDOW.innerHeight,
    },
    mcpReader:
      'loadMarkassoFile on a temp file holding the text (utf8). reason "unparseable" = read or JSON.parse failed; ' +
      '"invalid" = validateElements returned null. viewport is always null (the MCP reader ignores it).',
  });
  const dir = mkdtempSync(join(tmpdir(), 'markasso-fixtures-'));
  try {
    for (const [label, text] of corpus()) {
      fam.add(
        `web: ${label}`,
        'validateMarkassoFile',
        { text },
        webOutcome(text),
      );
      fam.add(
        `mcp: ${label}`,
        'loadMarkassoFile',
        { text },
        await mcpOutcome(dir, text),
      );
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  return fam;
}
