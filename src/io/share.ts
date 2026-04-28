import type { Element } from '../elements/element';

const SHORT_PREFIX = '#s=';
const LEGACY_PREFIX = '#share=';
const SHORT_ID_RE = /^[a-zA-Z0-9]{8}$/;

// ── base64url (inline fallback — no server round-trip) ─────────────────────────

function toBase64Url(bytes: Uint8Array<ArrayBuffer>): string {
  const binary = Array.from(bytes, (b) => String.fromCharCode(b)).join('');
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function fromBase64Url(b64url: string): Uint8Array<ArrayBuffer> {
  const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/');
  const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function textToBytes(text: string): Uint8Array<ArrayBuffer> {
  return new Uint8Array(new TextEncoder().encode(text).buffer as ArrayBuffer);
}

async function gzipEncode(
  bytes: Uint8Array<ArrayBuffer>,
): Promise<Uint8Array<ArrayBuffer>> {
  const cs = new CompressionStream('gzip');
  const writer = cs.writable.getWriter();
  writer.write(bytes);
  writer.close();
  const buf = await new Response(cs.readable).arrayBuffer();
  return new Uint8Array(buf);
}

async function gzipDecode(
  bytes: Uint8Array<ArrayBuffer>,
): Promise<Uint8Array<ArrayBuffer>> {
  const ds = new DecompressionStream('gzip');
  const writer = ds.writable.getWriter();
  writer.write(bytes);
  writer.close();
  const buf = await new Response(ds.readable).arrayBuffer();
  return new Uint8Array(buf);
}

function isGzip(bytes: Uint8Array<ArrayBuffer>): boolean {
  return bytes.length > 2 && bytes[0] === 0x1f && bytes[1] === 0x8b;
}

// ── Decode helpers ─────────────────────────────────────────────────────────────

async function parseBytes(
  bytes: Uint8Array<ArrayBuffer>,
): Promise<Element[] | null> {
  try {
    const raw = isGzip(bytes) ? await gzipDecode(bytes) : bytes;
    return JSON.parse(new TextDecoder().decode(raw)) as Element[];
  } catch {
    return null;
  }
}

// ── Public API ─────────────────────────────────────────────────────────────────

/** Encode elements to a base64url string (used internally and as inline fallback). */
export async function encodeScene(
  elements: ReadonlyArray<Element>,
): Promise<string> {
  const bytes = textToBytes(JSON.stringify(elements));
  try {
    return toBase64Url(await gzipEncode(bytes));
  } catch {
    return toBase64Url(bytes);
  }
}

/** Decode from any supported hash format. Fetches from API for short IDs. */
export async function decodeScene(hash: string): Promise<Element[] | null> {
  if (!hash.startsWith(SHORT_PREFIX) && !hash.startsWith(LEGACY_PREFIX))
    return null;

  if (hash.startsWith(SHORT_PREFIX)) {
    const payload = hash.slice(SHORT_PREFIX.length);

    // Short server-side ID (8 alphanumeric chars) — resolve via API
    if (SHORT_ID_RE.test(payload)) {
      try {
        const res = await fetch(`/api/share/${payload}`);
        if (!res.ok) return null;
        return (await res.json()) as Element[];
      } catch {
        return null;
      }
    }

    // Inline base64url (fallback or dev)
    try {
      return parseBytes(fromBase64Url(payload));
    } catch {
      return null;
    }
  }

  // Legacy #share= format
  try {
    const encoded = decodeURIComponent(hash.slice(LEGACY_PREFIX.length));
    const binary = atob(encoded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

    if (isGzip(bytes)) {
      const decompressed = await gzipDecode(bytes);
      return JSON.parse(new TextDecoder().decode(decompressed)) as Element[];
    }
    const json = decodeURIComponent(escape(binary));
    return JSON.parse(json) as Element[];
  } catch {
    return null;
  }
}

export function isShareHash(hash: string): boolean {
  return hash.startsWith(SHORT_PREFIX) || hash.startsWith(LEGACY_PREFIX);
}

/**
 * Build a short share URL via server API.
 * Falls back to inline base64url if the API is unavailable (dev / offline).
 */
export async function buildShareUrl(
  elements: ReadonlyArray<Element>,
): Promise<string> {
  try {
    const res = await fetch('/api/share', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(elements),
    });
    if (res.ok) {
      const { url } = (await res.json()) as { id: string; url: string };
      return url;
    }
  } catch {
    // API unreachable — inline fallback
  }

  const encoded = await encodeScene(elements);
  return `${location.origin}${location.pathname}${SHORT_PREFIX}${encoded}`;
}

export function getShareHash(): string {
  return location.hash;
}

/** @deprecated use isShareHash() */
export const SHARE_HASH_PREFIX = SHORT_PREFIX;
