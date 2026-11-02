/**
 * Checks markasso-apple's saved-back corpus against the web readers
 * (scripts/fixtures/roundtrip.ts). Run through `pnpm roundtrip-check`.
 * Dirs: `MARKASSO_ROUNDTRIP_ORIGINAL` (the corpus) and
 * `MARKASSO_ROUNDTRIP_RESAVED` (the app's output and report.json).
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { checkRoundTrip } from './fixtures/roundtrip';

it('the web loads every file saved back by the app with the same scene', async () => {
  const original = process.env.MARKASSO_ROUNDTRIP_ORIGINAL;
  const resaved = process.env.MARKASSO_ROUNDTRIP_RESAVED;
  if (!original || !resaved)
    throw new Error(
      'set MARKASSO_ROUNDTRIP_ORIGINAL and MARKASSO_ROUNDTRIP_RESAVED',
    );
  const probe = mkdtempSync(join(tmpdir(), 'markasso-roundtrip-'));
  try {
    const summary = await checkRoundTrip(original, resaved, probe);
    process.stdout.write(
      `round trip: ${summary.saved} saved back, ${summary.readOnly} read-only, ` +
        `${summary.rejected} rejected by every reader, ${summary.failures.length} failures\n`,
    );
    for (const failure of summary.failures)
      process.stdout.write(`  FAIL ${failure}\n`);
    expect(summary.failures).toEqual([]);
  } finally {
    rmSync(probe, { recursive: true, force: true });
  }
});
