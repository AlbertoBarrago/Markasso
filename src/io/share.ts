import type { Element } from '../elements/element';

const HASH_PREFIX = '#share=';

// ── Encode ─────────────────────────────────────────────────────────────────────

export async function encodeScene(elements: ReadonlyArray<Element>): Promise<string> {
  const json = JSON.stringify(elements);
  const bytes = new TextEncoder().encode(json);

  try {
    const cs = new CompressionStream('gzip');
    const writer = cs.writable.getWriter();
    writer.write(bytes);
    writer.close();
    const compressed = await new Response(cs.readable).arrayBuffer();
    const b64 = btoa(String.fromCharCode(...new Uint8Array(compressed)));
    return encodeURIComponent(b64);
  } catch {
    // CompressionStream not available — fall back to plain base64
    return encodeURIComponent(btoa(unescape(encodeURIComponent(json))));
  }
}

// ── Decode ─────────────────────────────────────────────────────────────────────

export async function decodeScene(hash: string): Promise<Element[] | null> {
  if (!hash.startsWith(HASH_PREFIX)) return null;
  const encoded = decodeURIComponent(hash.slice(HASH_PREFIX.length));

  try {
    const binary = atob(encoded);
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));

    try {
      const ds = new DecompressionStream('gzip');
      const writer = ds.writable.getWriter();
      writer.write(bytes);
      writer.close();
      const decompressed = await new Response(ds.readable).arrayBuffer();
      const json = new TextDecoder().decode(decompressed);
      return JSON.parse(json) as Element[];
    } catch {
      // Not gzip — try plain JSON (legacy or plain base64 fallback)
      const json = decodeURIComponent(escape(binary));
      return JSON.parse(json) as Element[];
    }
  } catch {
    return null;
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────────

export async function buildShareUrl(elements: ReadonlyArray<Element>): Promise<string> {
  const encoded = await encodeScene(elements);
  const base = `${location.origin}${location.pathname}`;
  return `${base}${HASH_PREFIX}${encoded}`;
}

export function getShareHash(): string {
  return location.hash;
}

export const SHARE_HASH_PREFIX = HASH_PREFIX;
