/**
 * Round-trip check for the native macOS port (markasso-apple).
 *
 * Input: the corpus written by corpus.ts (`original` dir, with manifest.json)
 * and what markasso-apple produced from it (`resaved` dir): `report.json`,
 * one `<file>.loaded.json` per accepted file (the scene as the app loaded it)
 * and the saved-back `<file>` for every accepted file that is not read-only.
 *
 * Nothing the app reports decides what gets compared. For every corpus file:
 * - the real web and MCP readers run again on the original, and the manifest
 *   must still agree with them;
 * - the app accepts the file exactly when one of them does, with the matching
 *   semantics, and opens it read-only exactly when it declares a version
 *   above 1 (computed from the file);
 * - the scene the app loaded matches the reference: same elements (same keys
 *   and values, key order ignored, element order kept), same file viewport,
 *   and the viewport on load computed by the app's own fit (within 1e-9);
 * - every accepted file that is not read-only was saved back, the web reader
 *   accepts the saved file, loads the same scene, and the top-level keys the
 *   app does not interpret (`cloud`, unknown keys) are preserved.
 * The reference is the web's load of the original or, when only the MCP
 * accepts it, the MCP's elements plus the file's own viewport after
 * `validateViewport`: the MCP has no viewport, and the app keeps a valid one
 * even without `version` (markasso-apple docs/01-file-format.md 1.3).
 * Numbers compare with `===`, so `-0` equals `0` like in a scene.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fitToElements } from '../../src/core/viewport';
import { validateViewport } from '../../src/io/element_validation';
import { type CorpusManifest, declaresNewerVersion } from './corpus';
import { mcpOutcome, WINDOW, webOutcome } from './files';

/** One entry of markasso-apple's report.json (`markasso-roundtrip`). */
export interface AppResult {
  readonly file: string;
  readonly accepted: boolean;
  readonly semantics?: 'web' | 'mcp';
  readonly readOnly?: boolean;
  readonly written: boolean;
  readonly error?: string;
}

export interface RoundTripSummary {
  readonly saved: number;
  readonly readOnly: number;
  readonly rejected: number;
  readonly failures: string[];
}

/** Keys of the file root the readers interpret; everything else must survive a save. */
const INTERPRETED_KEYS = new Set(['version', 'viewport', 'elements']);

/** Viewports computed by `fitToElements` on both sides can differ in the last ulp (libm). */
const FIT_TOLERANCE = 1e-9;

/**
 * First path where `a` and `b` differ, or null. Plain JSON values only: objects
 * compare by keys regardless of order, arrays by position, numbers with `===`
 * (or within `tolerance`, relative to the larger magnitude).
 */
export function firstDifference(
  a: unknown,
  b: unknown,
  path = '$',
  tolerance = 0,
): string | null {
  if (typeof a === 'number' && typeof b === 'number') {
    if (a === b) return null;
    const scale = Math.max(1, Math.abs(a), Math.abs(b));
    if (tolerance > 0 && Math.abs(a - b) <= tolerance * scale) return null;
    return `${path}: ${a} != ${b}`;
  }
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b)) {
      return `${path}: ${JSON.stringify(a)} != ${JSON.stringify(b)}`;
    }
    if (a.length !== b.length) {
      return `${path}: length ${a.length} != ${b.length}`;
    }
    for (let i = 0; i < a.length; i++) {
      const d = firstDifference(a[i], b[i], `${path}[${i}]`, tolerance);
      if (d) return d;
    }
    return null;
  }
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    const ao = a as Record<string, unknown>;
    const bo = b as Record<string, unknown>;
    for (const key of new Set([...Object.keys(ao), ...Object.keys(bo)])) {
      if (!Object.hasOwn(bo, key))
        return `${path}.${key}: missing after the round trip`;
      if (!Object.hasOwn(ao, key))
        return `${path}.${key}: added by the round trip`;
      const d = firstDifference(ao[key], bo[key], `${path}.${key}`, tolerance);
      if (d) return d;
    }
    return null;
  }
  return a === b
    ? null
    : `${path}: ${JSON.stringify(a)} != ${JSON.stringify(b)}`;
}

/** Root members other than version, viewport and elements; null for an array root. */
function uninterpretedKeys(text: string): Record<string, unknown> | null {
  const root = JSON.parse(text) as unknown;
  if (!root || typeof root !== 'object' || Array.isArray(root)) return null;
  return Object.fromEntries(
    Object.entries(root as Record<string, unknown>).filter(
      ([key]) => !INTERPRETED_KEYS.has(key),
    ),
  );
}

interface Reference {
  readonly elements: unknown[];
  readonly viewport: unknown;
  readonly loadViewport: unknown;
}

/** The scene the app must load, from the real readers; null when neither accepts the file. */
async function reference(
  text: string,
  probeDir: string,
): Promise<{ web: boolean; mcp: boolean; scene: Reference | null }> {
  const web = webOutcome(text);
  const mcp = (await mcpOutcome(probeDir, text)) as {
    accepted: boolean;
    elements?: unknown[];
  };
  if (web.accepted) {
    return {
      web: true,
      mcp: mcp.accepted,
      scene: {
        elements: web.elements,
        viewport: web.viewport,
        loadViewport: web.loadViewport,
      },
    };
  }
  if (!mcp.accepted || !mcp.elements)
    return { web: false, mcp: false, scene: null };
  const root = JSON.parse(text) as unknown;
  const own =
    root && typeof root === 'object' && !Array.isArray(root)
      ? validateViewport((root as { viewport?: unknown }).viewport)
      : null;
  return {
    web: false,
    mcp: true,
    scene: {
      elements: mcp.elements,
      viewport: own,
      loadViewport:
        own ??
        fitToElements(
          mcp.elements as Parameters<typeof fitToElements>[0],
          WINDOW.innerWidth,
          WINDOW.innerHeight,
        ),
    },
  };
}

export async function checkRoundTrip(
  originalDir: string,
  resavedDir: string,
  probeDir: string,
): Promise<RoundTripSummary> {
  const manifest = JSON.parse(
    readFileSync(join(originalDir, 'manifest.json'), 'utf8'),
  ) as CorpusManifest;
  const report = JSON.parse(
    readFileSync(join(resavedDir, 'report.json'), 'utf8'),
  ) as AppResult[];
  const results = new Map(report.map((r) => [r.file, r]));
  const failures: string[] = [];
  let saved = 0;
  let readOnly = 0;
  let rejected = 0;

  for (const entry of manifest.entries) {
    const fail = (message: string) =>
      failures.push(`${entry.file} (${entry.label}): ${message}`);
    const originalText = readFileSync(join(originalDir, entry.file), 'utf8');
    const ref = await reference(originalText, probeDir);
    const newer = declaresNewerVersion(originalText);
    if (
      ref.web !== entry.webAccepts ||
      ref.mcp !== entry.mcpAccepts ||
      newer !== entry.newerVersion
    ) {
      fail('manifest is out of date with the web readers: run `pnpm corpus`');
      continue;
    }
    const app = results.get(entry.file);
    if (!app) {
      fail('missing from report.json');
      continue;
    }
    if (app.accepted !== (ref.scene !== null)) {
      fail(
        `the app ${app.accepted ? 'accepts' : 'rejects'} it, the web readers ${ref.scene ? 'accept' : 'reject'} it`,
      );
      continue;
    }
    const loadedPath = join(resavedDir, `${entry.file}.loaded.json`);
    const resavedPath = join(resavedDir, entry.file);
    if (!ref.scene) {
      rejected++;
      if (app.written || existsSync(resavedPath) || existsSync(loadedPath))
        fail('rejected but written');
      continue;
    }

    const expectedSemantics = ref.web ? 'web' : 'mcp';
    if (app.semantics !== expectedSemantics)
      fail(`semantics ${app.semantics}, expected ${expectedSemantics}`);
    if (Boolean(app.readOnly) !== newer) {
      fail(
        newer
          ? 'declares a newer version but the app does not open it read-only'
          : 'opened read-only without a newer version',
      );
    }

    // The scene as the app loaded it.
    if (!existsSync(loadedPath)) {
      fail('no .loaded.json');
    } else {
      const loaded = JSON.parse(readFileSync(loadedPath, 'utf8')) as Reference;
      const d =
        firstDifference(
          ref.scene.elements,
          loaded.elements,
          'loaded.elements',
        ) ??
        firstDifference(
          ref.scene.viewport,
          loaded.viewport,
          'loaded.viewport',
        ) ??
        firstDifference(
          ref.scene.loadViewport,
          loaded.loadViewport,
          'loaded.loadViewport',
          FIT_TOLERANCE,
        );
      if (d) fail(d);
    }

    if (newer) {
      readOnly++;
      if (app.written || existsSync(resavedPath))
        fail('read-only but saved back');
      continue;
    }
    if (!app.written || !existsSync(resavedPath)) {
      fail('accepted but not saved back');
      continue;
    }
    saved++;

    // The saved file as the web loads it.
    const resavedText = readFileSync(resavedPath, 'utf8');
    const resaved = webOutcome(resavedText);
    if (!resaved.accepted) {
      fail(`the web reader rejects the saved file (${resaved.reason})`);
      continue;
    }
    if (resaved.warnsNewerVersion)
      fail('the saved file warns about a newer version');
    const d =
      firstDifference(ref.scene.elements, resaved.elements, 'saved.elements') ??
      firstDifference(ref.scene.viewport, resaved.viewport, 'saved.viewport') ??
      firstDifference(
        ref.scene.loadViewport,
        resaved.loadViewport,
        'saved.loadViewport',
      ) ??
      firstDifference(
        uninterpretedKeys(originalText) ?? {},
        uninterpretedKeys(resavedText),
        'saved.<root>',
      );
    if (d) fail(d);
  }
  for (const file of results.keys()) {
    if (!manifest.entries.some((e) => e.file === file))
      failures.push(`${file}: in report.json but not in the corpus`);
  }
  return { saved, readOnly, rejected, failures };
}
