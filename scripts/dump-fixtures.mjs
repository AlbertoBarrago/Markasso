/**
 * Writes the parity fixtures for the Swift port.
 *
 *   node scripts/dump-fixtures.mjs [--out <dir>]
 *
 * The generator is `scripts/dump-fixtures.fixture.ts`, a vitest file (see its
 * header for why). The vitest CLI has no `--include` flag and the file does
 * not match the default `*.test.ts` pattern, so it is started through the
 * Node API with an explicit include: `pnpm test` keeps ignoring it.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startVitest } from 'vitest/node';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const args = process.argv.slice(2);
const outIndex = args.indexOf('--out');
if (outIndex !== -1 && !args[outIndex + 1]) {
  console.error('Usage: node scripts/dump-fixtures.mjs [--out <dir>]');
  process.exit(1);
}
const outDir = resolve(
  outIndex === -1
    ? resolve(root, '../markasso-apple/Packages/MarkassoKit/Tests/Fixtures')
    : args[outIndex + 1],
);
process.env.MARKASSO_FIXTURES_OUT = outDir;

const startedAt = Date.now();
const vitest = await startVitest('test', [], {
  root,
  include: ['scripts/dump-fixtures.fixture.ts'],
  watch: false,
});
await vitest?.close();
if (!vitest || process.exitCode) {
  console.error('Fixture generation failed.');
  process.exit(process.exitCode || 1);
}

/** JSON files under `dir` written by this run (older files are skipped). */
function writtenFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return writtenFiles(path);
    return entry.name.endsWith('.json') && statSync(path).mtimeMs >= startedAt
      ? [path]
      : [];
  });
}

for (const file of writtenFiles(outDir).sort()) {
  const { cases } = JSON.parse(readFileSync(file, 'utf8'));
  const perFn = new Map();
  for (const c of cases) perFn.set(c.fn, (perFn.get(c.fn) ?? 0) + 1);
  const shown = relative(process.cwd(), file);
  console.log(
    `${shown.startsWith('..') ? file : shown}: ${cases.length} cases`,
  );
  for (const [fn, count] of perFn) console.log(`  ${fn}: ${count}`);
}
