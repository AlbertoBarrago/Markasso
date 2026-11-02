/**
 * Writes the round-trip corpus for markasso-apple (scripts/fixtures/corpus.ts).
 * Run through `pnpm corpus`, never by `pnpm test` (the name does not match the
 * default include). A vitest file for the same reason as the fixture generator:
 * vitest resolves the extensionless `.ts` imports of `src/` and `mcp/src/`.
 */
import { expect, it } from 'vitest';
import { CORPUS_DIR, writeCorpus } from './fixtures/corpus';

it('writes the round-trip corpus', async () => {
  const { entries } = await writeCorpus();
  const count = (pred: (e: (typeof entries)[number]) => boolean) =>
    entries.filter(pred).length;
  process.stdout.write(
    `corpus: ${entries.length} files in ${CORPUS_DIR} ` +
      `(web accepts ${count((e) => e.webAccepts)}, MCP accepts ${count((e) => e.mcpAccepts)}, ` +
      `neither ${count((e) => !e.webAccepts && !e.mcpAccepts)})\n`,
  );
  expect(entries.length).toBeGreaterThan(0);
});
