/**
 * Minimal ZIP reader for importing icon packs, built on the platform's
 * `DecompressionStream('deflate-raw')` so it adds no dependency. Supports
 * stored and deflated entries of regular (non-ZIP64) archives, which is
 * what vendors ship. CRCs are not verified: corrupt data surfaces as an
 * inflate error or as an SVG that fails to parse later.
 */

export interface ZipEntry {
  readonly name: string;
  readonly data: Uint8Array;
}

export interface ZipLimits {
  /** Refuse archives listing more entries than this. */
  readonly maxEntries: number;
  /** Refuse a single entry inflating past this many bytes. */
  readonly maxEntryBytes: number;
  /** Refuse once selected entries together inflate past this. */
  readonly maxTotalBytes: number;
}

export const DEFAULT_ZIP_LIMITS: ZipLimits = {
  maxEntries: 50_000,
  maxEntryBytes: 1024 * 1024,
  maxTotalBytes: 100 * 1024 * 1024,
};

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const LOCAL_SIGNATURE = 0x04034b50;
const METHOD_STORED = 0;
const METHOD_DEFLATE = 8;

export class ZipError extends Error {
  override name = 'ZipError';
}

interface CentralRecord {
  readonly name: string;
  readonly method: number;
  readonly compressedSize: number;
  readonly size: number;
  readonly localOffset: number;
  readonly encrypted: boolean;
}

function findEndOfCentralDirectory(view: DataView): number {
  // The EOCD record is 22 bytes plus an optional comment of up to 64 KB.
  const minOffset = Math.max(0, view.byteLength - 22 - 0xffff);
  for (let i = view.byteLength - 22; i >= minOffset; i--) {
    if (view.getUint32(i, true) === EOCD_SIGNATURE) return i;
  }
  throw new ZipError('Not a ZIP archive');
}

function readCentralDirectory(
  bytes: Uint8Array,
  limits: ZipLimits,
): CentralRecord[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const eocd = findEndOfCentralDirectory(view);
  const count = view.getUint16(eocd + 10, true);
  const offset = view.getUint32(eocd + 16, true);
  if (count === 0xffff || offset === 0xffffffff) {
    throw new ZipError('ZIP64 archives are not supported');
  }
  if (count > limits.maxEntries) {
    throw new ZipError(`Too many entries (${count})`);
  }

  const decoder = new TextDecoder();
  const records: CentralRecord[] = [];
  let p = offset;
  for (let i = 0; i < count; i++) {
    if (
      p + 46 > bytes.byteLength ||
      view.getUint32(p, true) !== CENTRAL_SIGNATURE
    ) {
      throw new ZipError('Corrupt central directory');
    }
    const flags = view.getUint16(p + 8, true);
    const nameLength = view.getUint16(p + 28, true);
    const extraLength = view.getUint16(p + 30, true);
    const commentLength = view.getUint16(p + 32, true);
    records.push({
      name: decoder.decode(bytes.subarray(p + 46, p + 46 + nameLength)),
      method: view.getUint16(p + 10, true),
      compressedSize: view.getUint32(p + 20, true),
      size: view.getUint32(p + 24, true),
      localOffset: view.getUint32(p + 42, true),
      encrypted: (flags & 0x1) !== 0,
    });
    p += 46 + nameLength + extraLength + commentLength;
  }
  return records;
}

async function inflateRaw(
  data: Uint8Array,
  maxBytes: number,
): Promise<Uint8Array> {
  // A one-chunk stream straight from the bytes (no Blob needed); slice()
  // gives the ArrayBuffer-backed view DecompressionStream is typed for.
  const stream = new ReadableStream<BufferSource>({
    start(controller) {
      controller.enqueue(data.slice());
      controller.close();
    },
  }).pipeThrough(new DecompressionStream('deflate-raw'));
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    // Enforced on actual output, not the (attacker-controlled) header size.
    if (total > maxBytes) {
      await reader.cancel();
      throw new ZipError('Entry too large once decompressed');
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

/** Entry names of an archive, without decompressing anything. */
export function listZipEntries(
  bytes: Uint8Array,
  limits: ZipLimits = DEFAULT_ZIP_LIMITS,
): string[] {
  return readCentralDirectory(bytes, limits).map((r) => r.name);
}

/**
 * Decompresses the entries passing `select`, which gets each name and
 * declared (uncompressed) size; directories are always skipped. A selected
 * entry over the limits throws: callers that prefer to skip large files
 * filter them out in `select` using the declared size.
 */
export async function readZipEntries(
  bytes: Uint8Array,
  select: (name: string, size: number) => boolean,
  limits: ZipLimits = DEFAULT_ZIP_LIMITS,
): Promise<ZipEntry[]> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const entries: ZipEntry[] = [];
  let total = 0;
  for (const record of readCentralDirectory(bytes, limits)) {
    if (record.name.endsWith('/') || !select(record.name, record.size)) {
      continue;
    }
    if (record.encrypted) throw new ZipError(`Encrypted entry: ${record.name}`);
    if (record.size > limits.maxEntryBytes) {
      throw new ZipError(`Entry too large: ${record.name}`);
    }
    const p = record.localOffset;
    if (
      p + 30 > bytes.byteLength ||
      view.getUint32(p, true) !== LOCAL_SIGNATURE
    ) {
      throw new ZipError(`Corrupt local header: ${record.name}`);
    }
    // Local name/extra lengths can differ from the central ones.
    const start =
      p + 30 + view.getUint16(p + 26, true) + view.getUint16(p + 28, true);
    const end = start + record.compressedSize;
    if (end > bytes.byteLength) {
      throw new ZipError(`Truncated entry: ${record.name}`);
    }
    const raw = bytes.subarray(start, end);
    let data: Uint8Array;
    if (record.method === METHOD_STORED) {
      data = raw.slice();
    } else if (record.method === METHOD_DEFLATE) {
      data = await inflateRaw(raw, limits.maxEntryBytes);
    } else {
      throw new ZipError(
        `Unsupported compression method ${record.method}: ${record.name}`,
      );
    }
    total += data.byteLength;
    if (total > limits.maxTotalBytes) {
      throw new ZipError('Archive too large once decompressed');
    }
    entries.push({ name: record.name, data });
  }
  return entries;
}
