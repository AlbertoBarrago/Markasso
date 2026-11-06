import { mkdir, mkdtemp, readdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { Diagram } from '../src/diagram';
import { exportPng } from '../src/png';
import { writeFileAtomic } from '../src/storage';

const PNG_MAGIC = '89504e47';

async function pair(): Promise<Diagram> {
  const d = new Diagram();
  await d.addNodes([{ key: 'a' }, { key: 'b' }]);
  d.connect([{ from: 'a', to: 'b' }]);
  d.layout('LR');
  return d;
}

describe('exportPng', () => {
  it('returns the image by default', async () => {
    const content = await exportPng(await pair(), {});
    expect(content).toEqual([
      { type: 'image', data: expect.any(String), mimeType: 'image/png' },
    ]);
  });

  it('only writes the file and answers in text without returnImage', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'markasso-mcp-'));
    const path = join(dir, 'canvas.png');
    const content = await exportPng(await pair(), {
      path,
      returnImage: false,
    });
    expect(content).toEqual([{ type: 'text', text: `Saved PNG to ${path}.` }]);
    const file = await readFile(path);
    expect(file.subarray(0, 4).toString('hex')).toBe(PNG_MAGIC);
    expect(await readdir(dir)).toEqual(['canvas.png']);
  });

  it('adds the diagram warnings after the image', async () => {
    const d = new Diagram();
    await d.addNodes([
      { key: 'a', x: 0, y: 0, width: 100, height: 60 },
      { key: 'b', x: 50, y: 20, width: 100, height: 60 },
    ]);
    const content = await exportPng(d, {});
    expect(content.map((c) => c.type)).toEqual(['image', 'text']);
    expect(content[1]).toMatchObject({
      text: expect.stringContaining('Overlapping nodes: a and b'),
    });
  });

  it('refuses returnImage false without a path', async () => {
    await expect(
      exportPng(await pair(), { returnImage: false }),
    ).rejects.toThrow('give a path');
  });
});

describe('writeFileAtomic', () => {
  it('replaces the file and leaves no temporary file behind', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'markasso-mcp-'));
    const path = join(dir, 'out.png');
    await writeFileAtomic(path, 'old');
    await writeFileAtomic(path, new Uint8Array([1, 2, 3]));
    expect([...(await readFile(path))]).toEqual([1, 2, 3]);
    expect(await readdir(dir)).toEqual(['out.png']);
  });

  it('cleans up and reports the error when the rename fails', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'markasso-mcp-'));
    // A non-empty directory can't be replaced by a file.
    const path = join(dir, 'taken');
    await mkdir(join(path, 'inside'), { recursive: true });
    await expect(writeFileAtomic(path, 'data')).rejects.toThrow();
    expect(await readdir(dir)).toEqual(['taken']);
  });
});
