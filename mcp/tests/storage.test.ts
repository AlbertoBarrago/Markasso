import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Element } from '../../src/elements/element';
import { encodeScene } from '../../src/io/share';
import {
  loadMarkassoFile,
  loadShareLink,
  saveMarkassoFile,
} from '../src/storage';

const rect: Element = {
  id: 'r1',
  type: 'rectangle',
  x: 0,
  y: 0,
  width: 100,
  height: 50,
  strokeColor: '#000',
  fillColor: 'transparent',
  strokeWidth: 1,
  opacity: 1,
  roughness: 0,
  label: 'Hello',
};

describe('storage', () => {
  it('round-trips a .markasso file in the app format', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'markasso-mcp-'));
    const path = join(dir, 'test.markasso');
    await saveMarkassoFile(path, [rect]);
    expect(JSON.parse(await readFile(path, 'utf8'))).toMatchObject({
      version: 1,
    });
    expect(await loadMarkassoFile(path)).toEqual([rect]);
  });

  it('decodes inline share links produced by the app', async () => {
    const link = `https://markasso.it/#s=${await encodeScene([rect])}`;
    expect(await loadShareLink(link)).toEqual([rect]);
  });

  it('rejects links that are not share links', async () => {
    await expect(loadShareLink('https://markasso.it/')).rejects.toThrow(
      'Not a Markasso share link',
    );
  });
});
