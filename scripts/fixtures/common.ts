/**
 * Shared plumbing of the fixture generator (`scripts/dump-fixtures.fixture.ts`):
 * the case collector, the JSON writer and small numeric helpers. Format and
 * comparison rules: markasso-apple `docs/04-fixtures.md`.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
export const OUT_DIR = resolve(
  ROOT,
  process.env.MARKASSO_FIXTURES_OUT ??
    '../markasso-apple/Packages/MarkassoKit/Tests/Fixtures',
);

/** A family file larger than this is split into one file per `fn`. */
const MAX_FILE_BYTES = 4_000_000;

// ── Fixture writing ───────────────────────────────────────────────────────────

export type Json = Record<string, unknown>;

interface FixtureCase {
  readonly name: string;
  readonly fn: string;
  readonly input: unknown;
  readonly output: unknown;
}

export class Family {
  readonly cases: FixtureCase[] = [];
  private readonly names = new Set<string>();

  /**
   * @param header Extra keys for the `generator` header (encodings the Swift
   *   side needs to read the cases), written after the standard ones.
   */
  constructor(
    readonly name: string,
    readonly header: Json = {},
  ) {}

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

function git(...args: string[]): string {
  return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).trim();
}

/**
 * The web commit the fixtures describe. In the colocated jj repo git's HEAD is
 * the parent of the working-copy commit. When the commits between main and
 * HEAD only touch the generator itself (`scripts/`, `package.json`), the code
 * under test is main's, so the fork point is reported; otherwise HEAD is.
 */
function sourceCommit(): string {
  let base: string;
  try {
    base = git('merge-base', 'HEAD', 'main');
  } catch {
    return git('rev-parse', '--short=8', 'HEAD');
  }
  const changed = git('diff', '--name-only', base, 'HEAD')
    .split('\n')
    .filter((path) => path !== '');
  const generatorOnly = changed.every(
    (path) => path.startsWith('scripts/') || path === 'package.json',
  );
  return git('rev-parse', '--short=8', generatorOnly ? base : 'HEAD');
}

let cachedInfo: { version: string; commit: string } | undefined;

export function generatorInfo(): { version: string; commit: string } {
  if (!cachedInfo) {
    const pkg = JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf8'));
    cachedInfo = { version: String(pkg.version), commit: sourceCommit() };
  }
  return cachedInfo;
}

function serialize(family: Family, cases: ReadonlyArray<FixtureCase>): string {
  const found = { nonFinite: false };
  const safe = cases.map((c) => ({
    name: c.name,
    fn: c.fn,
    input: toJsonSafe(c.input, found),
    output: toJsonSafe(c.output, found),
  }));
  const generator = {
    ...generatorInfo(),
    family: family.name,
    ...(found.nonFinite && { nonFinite: 'string' }),
    ...(toJsonSafe(family.header, found) as Json),
  };
  return `${JSON.stringify({ generator, cases: safe }, null, 2)}\n`;
}

/**
 * Writes `<family>/<family>.json`, or one `<family>/<fn>.json` per function
 * when the single file would exceed {@link MAX_FILE_BYTES}. Returns the paths.
 */
export function writeFamily(family: Family): string[] {
  const dir = resolve(OUT_DIR, family.name);
  mkdirSync(dir, { recursive: true });
  const whole = serialize(family, family.cases);
  if (Buffer.byteLength(whole) <= MAX_FILE_BYTES) {
    const file = resolve(dir, `${family.name}.json`);
    writeFileSync(file, whole);
    return [file];
  }
  const byFn = new Map<string, FixtureCase[]>();
  for (const c of family.cases) {
    const list = byFn.get(c.fn) ?? [];
    list.push(c);
    byFn.set(c.fn, list);
  }
  return [...byFn].map(([fn, cases]) => {
    const file = resolve(dir, `${fn}.json`);
    writeFileSync(file, serialize(family, cases));
    return file;
  });
}

// ── Shared helpers ────────────────────────────────────────────────────────────

/** Smallest double greater than x (exact one-ulp boundary probes). */
export function nextUp(x: number): number {
  if (x === 0) return Number.MIN_VALUE;
  const f = new Float64Array([x]);
  const bits = new BigInt64Array(f.buffer);
  bits[0] = bits[0]! + (x > 0 ? 1n : -1n);
  return f[0]!;
}

export function nextDown(x: number): number {
  return -nextUp(-x);
}

/** Deep copy of `obj` with the value at `path` replaced (or removed). */
export function withPath(
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

export function without(obj: Json, key: string): Json {
  return withPath(obj, [key], undefined);
}

export function fmt(value: unknown): string {
  if (typeof value === 'string') {
    return value.length > 48
      ? `string(${value.length} units)`
      : JSON.stringify(value);
  }
  if (typeof value === 'number') return String(value);
  return JSON.stringify(value) ?? String(value);
}

/**
 * Fixed-seed PRNG (mulberry32): the same sequence on every run and machine,
 * so "random" corpora stay byte-identical between regenerations.
 */
export function prng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
