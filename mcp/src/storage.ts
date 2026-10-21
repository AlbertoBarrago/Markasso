import { readFile, writeFile } from 'node:fs/promises';
import type { Element } from '../../src/elements/element';
import { validateElements } from '../../src/io/element_validation';

/** Markasso instance used for share links and live rooms. */
export function markassoBaseUrl(): string {
  return (process.env.MARKASSO_URL ?? 'https://markasso.it').replace(
    /\/+$/,
    '',
  );
}

export class StorageError extends Error {
  override name = 'StorageError';
}

const SHORT_ID = /^[a-zA-Z0-9]{8}$/;

/** Uploads elements through the app's share API and returns the link. */
export async function createShareLink(
  elements: ReadonlyArray<Element>,
): Promise<string> {
  const res = await fetch(`${markassoBaseUrl()}/api/share`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(elements),
  });
  if (res.status === 429) {
    throw new StorageError('Share rate limit reached; try again in a minute.');
  }
  if (!res.ok) {
    throw new StorageError(`Share failed (HTTP ${res.status}).`);
  }
  const { url } = (await res.json()) as { url?: unknown };
  if (typeof url !== 'string')
    throw new StorageError('Share failed: no URL returned.');
  return url;
}

async function gunzip(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  const stream = new Blob([bytes])
    .stream()
    .pipeThrough(new DecompressionStream('gzip'));
  return new Response(stream).text();
}

function fromBase64Url(text: string): Uint8Array<ArrayBuffer> {
  const b64 = text.replace(/-/g, '+').replace(/_/g, '/');
  return new Uint8Array(Buffer.from(b64, 'base64'));
}

/**
 * Elements behind a Markasso share link: short server ids (#s=abcd1234) are
 * fetched from the API, inline links (#s=<base64url gzip>) decoded locally.
 */
export async function loadShareLink(link: string): Promise<Element[]> {
  const hash = new URL(link).hash;
  if (!hash.startsWith('#s=')) {
    throw new StorageError('Not a Markasso share link (expected "#s=...").');
  }
  const payload = hash.slice(3);
  let data: unknown;
  if (SHORT_ID.test(payload)) {
    const res = await fetch(`${new URL(link).origin}/api/share/${payload}`);
    if (!res.ok)
      throw new StorageError(`Share link not found (HTTP ${res.status}).`);
    data = await res.json();
  } else {
    const bytes = fromBase64Url(payload);
    const isGzip = bytes[0] === 0x1f && bytes[1] === 0x8b;
    data = JSON.parse(
      isGzip ? await gunzip(bytes) : new TextDecoder().decode(bytes),
    );
  }
  const elements = validateElements(data);
  if (!elements) throw new StorageError('The shared scene is invalid.');
  return elements;
}

/** Reads a .markasso file (the app's JSON format). */
export async function loadMarkassoFile(path: string): Promise<Element[]> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(path, 'utf8'));
  } catch (error) {
    throw new StorageError(
      `Cannot read ${path}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  const raw =
    typeof parsed === 'object' && parsed !== null && 'elements' in parsed
      ? (parsed as { elements: unknown }).elements
      : parsed;
  const elements = validateElements(raw);
  if (!elements)
    throw new StorageError(`${path} is not a valid .markasso file.`);
  return elements;
}

/** Writes a .markasso file the app can open (File > Open). */
export async function saveMarkassoFile(
  path: string,
  elements: ReadonlyArray<Element>,
): Promise<void> {
  const file = { version: 1, elements };
  await writeFile(path, `${JSON.stringify(file, null, 2)}\n`, 'utf8');
}
