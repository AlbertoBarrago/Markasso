/**
 * Checks that the web loads every corpus file markasso-apple saved back with
 * the same scene (driven by markasso-apple `scripts/roundtrip.sh`).
 *
 *   node scripts/roundtrip-check.mjs --original <corpus dir> --resaved <dir>
 */
import { option, runVitestFile } from './fixtures/run_vitest_file.mjs';

const usage =
  'Usage: node scripts/roundtrip-check.mjs --original <corpus dir> --resaved <dir>';
const original = option('original', usage);
const resaved = option('resaved', usage);
if (!original || !resaved) {
  console.error(usage);
  process.exit(1);
}
process.env.MARKASSO_ROUNDTRIP_ORIGINAL = original;
process.env.MARKASSO_ROUNDTRIP_RESAVED = resaved;
if (!(await runVitestFile('scripts/roundtrip-check.fixture.ts'))) {
  console.error('Round-trip check failed.');
  process.exit(process.exitCode || 1);
}
