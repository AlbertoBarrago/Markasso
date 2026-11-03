/**
 * `share` family: src/io/share.ts, the share link codec. The Swift port must
 * read every payload the web writes, so the cases record decodeScene on
 * hashes built the four ways links exist in the wild:
 *   - `#s=<base64url(gzip(JSON))>`, encodeScene's output (the inline fallback);
 *   - `#s=<base64url(JSON)>`, the uncompressed fallback when CompressionStream fails;
 *   - `#share=<encodeURIComponent(base64(gzip(JSON)))>`, legacy, compressed;
 *   - `#share=<encodeURIComponent(base64(UTF-8 JSON))>`, legacy, raw;
 * over scenes of growing size and with non-ASCII text, plus malformed and
 * partially valid inputs. A `#s=` hash with an 8-character alphanumeric id is
 * resolved by fetching `/api/share/<id>`: fetch is stubbed to answer one id,
 * so the case records which id was requested and the elements returned.
 * Gzip output is not byte-identical across implementations, so encodeScene's
 * cases record the encoded string only as an input the Swift side must decode.
 * A truncated gzip payload is left out: decodeScene returns null for it, but
 * its gzipDecode leaves the writer's rejected promise unhandled, which vitest
 * reports as an error.
 */
import { vi } from 'vitest';
import type { Element } from '../../src/elements/element';
import { PRESETS } from '../../src/io/presets';
import { decodeScene, encodeScene, isShareHash } from '../../src/io/share';
import { Family } from './common';
import { SAMPLE_NAMES, sample } from './samples';

function toBase64Url(bytes: Uint8Array): string {
  const binary = Array.from(bytes, (b) => String.fromCharCode(b)).join('');
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

async function gzip(bytes: Uint8Array): Promise<Uint8Array> {
  const cs = new CompressionStream('gzip');
  const writer = cs.writable.getWriter();
  writer.write(bytes);
  writer.close();
  return new Uint8Array(await new Response(cs.readable).arrayBuffer());
}

function utf8(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

function binaryBase64(bytes: Uint8Array): string {
  return btoa(Array.from(bytes, (b) => String.fromCharCode(b)).join(''));
}

/** Scenes of growing size, the last ones with non-ASCII text and emoji. */
function scenes(): Array<[string, Element[]]> {
  const all = SAMPLE_NAMES.map((name) => sample(name));
  const flowchart = PRESETS[0].buildElements(0, 0, false);
  const many: Element[] = [];
  for (let i = 0; i < 300; i++) {
    many.push(
      sample(SAMPLE_NAMES[i % SAMPLE_NAMES.length], {
        id: `e${i}`,
        x: i * 7,
        y: i * 3,
      }),
    );
  }
  const unicode = [
    sample(SAMPLE_NAMES[0], { id: 'u1' }),
    {
      ...sample(SAMPLE_NAMES[0], { id: 'u2' }),
      label: 'Città, café, 日本語, 🚀 and ﬁ',
    } as Element,
  ];
  return [
    ['empty', []],
    ['one element', [all[0]]],
    ['every sample', all],
    ['flowchart preset', flowchart],
    ['300 elements', many],
    ['unicode labels', unicode],
  ];
}

export async function buildShare(): Promise<Family> {
  const fam = new Family('share', {
    inputs:
      'decodeScene {hash}: output the decoded element array (validateElements applied) or null. ' +
      'For an 8-character alphanumeric #s= id, fetch is stubbed: output {fetched: "/api/share/<id>", elements}. ' +
      'isShareHash {hash}: output the boolean. encodeScene {elements}: output the encoded string; gzip bytes ' +
      'differ between implementations, so the Swift side checks that it decodes the string back to the elements.',
  });

  for (const [label, elements] of scenes()) {
    const json = JSON.stringify(elements);
    const encoded = await encodeScene(elements);
    fam.add(`encodeScene ${label}`, 'encodeScene', { elements }, encoded);
    const hashes: Array<[string, string]> = [
      ['inline gzip', `#s=${encoded}`],
      ['inline raw', `#s=${toBase64Url(utf8(json))}`],
      [
        'legacy gzip',
        `#share=${encodeURIComponent(binaryBase64(await gzip(utf8(json))))}`,
      ],
      ['legacy raw', `#share=${encodeURIComponent(binaryBase64(utf8(json)))}`],
    ];
    for (const [form, hash] of hashes) {
      fam.add(
        `decodeScene ${form} ${label}`,
        'decodeScene',
        { hash },
        await decodeScene(hash),
      );
    }
  }

  // Partially valid scenes: validateElements keeps the valid elements.
  const mixed = [
    sample(SAMPLE_NAMES[0], { id: 'ok' }),
    { id: 'bad', type: 'rectangle' },
    42,
  ];
  fam.add(
    'decodeScene inline raw partially valid',
    'decodeScene',
    { hash: `#s=${toBase64Url(utf8(JSON.stringify(mixed)))}` },
    await decodeScene(`#s=${toBase64Url(utf8(JSON.stringify(mixed)))}`),
  );

  // Malformed inputs.
  const malformed: Array<[string, string]> = [
    ['no prefix', 'abc'],
    ['empty', ''],
    ['other fragment', '#live=room'],
    ['inline not base64', '#s=!!!***'],
    ['inline not JSON', `#s=${toBase64Url(utf8('not json'))}`],
    ['inline JSON object', `#s=${toBase64Url(utf8('{"a":1}'))}`],
    ['legacy not base64', '#share=%%%'],
    ['legacy not JSON', `#share=${encodeURIComponent(btoa('hello'))}`],
    ['short id wrong length', '#s=abc1234'],
  ];
  for (const [label, hash] of malformed) {
    fam.add(
      `decodeScene malformed ${label}`,
      'decodeScene',
      { hash },
      await decodeScene(hash),
    );
  }

  // Short ids are fetched from the worker.
  const stored = [sample(SAMPLE_NAMES[0], { id: 'srv' })];
  const fetchSpy = vi
    .spyOn(globalThis, 'fetch')
    .mockImplementation(async (input) => {
      const url = String(input);
      if (url === '/api/share/Ab3dEf9h')
        return new Response(JSON.stringify(stored), { status: 200 });
      return new Response('not found', { status: 404 });
    });
  try {
    for (const [label, id] of [
      ['short id found', 'Ab3dEf9h'],
      ['short id missing', 'Zz9yXx8w'],
    ] as const) {
      fetchSpy.mockClear();
      const elements = await decodeScene(`#s=${id}`);
      const fetched = fetchSpy.mock.calls.map((call) => String(call[0]));
      fam.add(
        `decodeScene ${label}`,
        'decodeScene',
        { hash: `#s=${id}` },
        { fetched: fetched[0] ?? null, elements },
      );
    }
  } finally {
    fetchSpy.mockRestore();
  }

  for (const hash of ['#s=x', '#share=x', '#s', '#shar=x', 's=x', '#S=x']) {
    fam.add(
      `isShareHash ${JSON.stringify(hash)}`,
      'isShareHash',
      { hash },
      isShareHash(hash),
    );
  }
  return fam;
}
