/**
 * Writes the round-trip corpus for markasso-apple.
 *
 *   node scripts/corpus.mjs [--out <dir>]
 *
 * Default dir: `../markasso-apple/Packages/MarkassoKit/Tests/Corpus`.
 */
import { option, runVitestFile } from './fixtures/run_vitest_file.mjs';

const out = option('out', 'Usage: node scripts/corpus.mjs [--out <dir>]');
if (out) process.env.MARKASSO_CORPUS_OUT = out;
if (!(await runVitestFile('scripts/corpus.fixture.ts'))) {
  console.error('Corpus generation failed.');
  process.exit(process.exitCode || 1);
}
