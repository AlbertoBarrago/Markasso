/**
 * Runs one vitest file that is excluded from `pnpm test` (the fixture and
 * corpus generators, the round-trip check) and sets a non-zero exit code when
 * it fails.
 */
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startVitest } from 'vitest/node';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

/** Runs `file` (relative to the repo root); returns false when it failed. */
export async function runVitestFile(file) {
  const vitest = await startVitest('test', [], {
    root: ROOT,
    include: [file],
    watch: false,
  });
  await vitest?.close();
  return Boolean(vitest) && !process.exitCode;
}

/** The value after `--name` in argv, or undefined; exits on a flag without value. */
export function option(name, usage) {
  const args = process.argv.slice(2);
  const index = args.indexOf(`--${name}`);
  if (index === -1) return undefined;
  if (!args[index + 1]) {
    console.error(usage);
    process.exit(1);
  }
  return resolve(args[index + 1]);
}
