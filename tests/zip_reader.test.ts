import { describe, expect, it } from 'vitest';
import { listZipEntries, readZipEntries, ZipError } from '../src/io/zip_reader';

async function deflateRaw(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data.slice()])
    .stream()
    .pipeThrough(new CompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** Builds a ZIP in memory; `deflate` picks the method per entry. */
async function makeZip(
  files: Array<{ name: string; text: string; deflate?: boolean }>,
): Promise<Uint8Array> {
  const enc = new TextEncoder();
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;
  for (const f of files) {
    const name = enc.encode(f.name);
    const raw = enc.encode(f.text);
    const data = f.deflate ? await deflateRaw(raw) : raw;
    const local = new Uint8Array(30 + name.length + data.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(8, f.deflate ? 8 : 0, true);
    lv.setUint32(18, data.length, true);
    lv.setUint32(22, raw.length, true);
    lv.setUint16(26, name.length, true);
    local.set(name, 30);
    local.set(data, 30 + name.length);
    const central = new Uint8Array(46 + name.length);
    const cv = new DataView(central.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(10, f.deflate ? 8 : 0, true);
    cv.setUint32(20, data.length, true);
    cv.setUint32(24, raw.length, true);
    cv.setUint16(28, name.length, true);
    cv.setUint32(42, offset, true);
    central.set(name, 46);
    locals.push(local);
    centrals.push(central);
    offset += local.length;
  }
  const centralSize = centrals.reduce((n, c) => n + c.length, 0);
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, files.length, true);
  ev.setUint16(10, files.length, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, offset, true);
  const parts = [...locals, ...centrals, eocd];
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let p = 0;
  for (const part of parts) {
    out.set(part, p);
    p += part.length;
  }
  return out;
}

const decode = (d: Uint8Array) => new TextDecoder().decode(d);

describe('zip reader', () => {
  it('lists entries and reads stored and deflated files', async () => {
    const zip = await makeZip([
      { name: 'icons/', text: '' },
      { name: 'icons/a.svg', text: '<svg>a</svg>' },
      { name: 'icons/b.svg', text: '<svg>'.repeat(200), deflate: true },
      { name: 'readme.txt', text: 'hello' },
    ]);
    expect(listZipEntries(zip)).toEqual([
      'icons/',
      'icons/a.svg',
      'icons/b.svg',
      'readme.txt',
    ]);
    const entries = await readZipEntries(zip, (n) => n.endsWith('.svg'));
    expect(entries.map((e) => e.name)).toEqual(['icons/a.svg', 'icons/b.svg']);
    expect(decode(entries[0]!.data)).toBe('<svg>a</svg>');
    expect(decode(entries[1]!.data)).toBe('<svg>'.repeat(200));
  });

  it('rejects data that is not a ZIP', () => {
    expect(() => listZipEntries(new TextEncoder().encode('not a zip'))).toThrow(
      ZipError,
    );
  });

  it('enforces entry and total size limits on inflated output', async () => {
    const zip = await makeZip([
      { name: 'big.svg', text: 'x'.repeat(10_000), deflate: true },
    ]);
    await expect(
      readZipEntries(zip, () => true, {
        maxEntries: 10,
        maxEntryBytes: 1_000,
        maxTotalBytes: 1_000_000,
      }),
    ).rejects.toThrow(ZipError);
    await expect(
      readZipEntries(zip, () => true, {
        maxEntries: 10,
        maxEntryBytes: 1_000_000,
        maxTotalBytes: 5_000,
      }),
    ).rejects.toThrow('Archive too large');
  });

  it('enforces the entry count limit', async () => {
    const zip = await makeZip([
      { name: 'a.svg', text: 'a' },
      { name: 'b.svg', text: 'b' },
    ]);
    expect(() =>
      listZipEntries(zip, {
        maxEntries: 1,
        maxEntryBytes: 1_000,
        maxTotalBytes: 1_000,
      }),
    ).toThrow('Too many entries');
  });
});
