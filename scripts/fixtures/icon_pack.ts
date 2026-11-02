/**
 * `icon_pack` family: icon pack import, written as two files.
 *
 * - icon_pack/icon_pack.json: src/io/icon_pack.ts, the pure part of the
 *   import (path filter, name and category parsing, vendor detection, and
 *   `buildIconPack`: largest-variant selection, size and pack caps, sorting,
 *   data URL encoding). Sample paths and tiny synthetic SVGs only: no vendor
 *   icon is committed.
 * - icon_pack/zip.json: src/io/zip_reader.ts on small synthetic archives
 *   (base64), including the malformed and over-limit ones, plus the whole
 *   import pipeline of src/ui/icon_pack_import.ts minus the sanitizer and
 *   the IndexedDB store.
 *
 * `sanitizeSvg` (src/ui/svg_sanitize.ts) is not covered: it needs DOMParser
 * and XMLSerializer, which the generator's node environment does not have,
 * and adding a DOM implementation would be a new dependency. `buildIconPack`
 * takes the sanitizer as a callback, so the cases use declared stubs.
 * Cases named `test: ...` reproduce tests/icon_pack.test.ts and
 * tests/zip_reader.test.ts.
 */
import { MAX_EMBEDDED_SVG_CHARS } from '../../src/elements/stencils/registry';
import {
  buildIconPack,
  cleanIconName,
  describeIconPath,
  detectPackName,
  type IconPackFile,
  type IconPackResult,
  isIconSvgPath,
  MAX_ICONS_PER_PACK,
} from '../../src/io/icon_pack';
import {
  DEFAULT_ZIP_LIMITS,
  listZipEntries,
  readZipEntries,
  ZipError,
  type ZipLimits,
} from '../../src/io/zip_reader';
import { Family, type Json } from './common';

// ── Sanitizer stubs ───────────────────────────────────────────────────────────

type SanitizeStub = 'keep' | 'svgPrefix' | 'trim';

const SANITIZERS: Record<SanitizeStub, (svg: string) => string | null> = {
  keep: (s) => s,
  svgPrefix: (s) => (s.startsWith('<svg') ? s : null),
  // Changes the markup, so the output shows the sanitized text is what gets encoded.
  trim: (s) => (s.trim() === '' ? null : s.trim()),
};

const SANITIZE_ENCODING =
  'sanitize names a stub standing in for sanitizeSvg: keep returns the markup unchanged; svgPrefix returns it ' +
  'when it starts with "<svg", else null; trim returns markup.trim(), or null when that is empty.';

// ── icon_pack.json ────────────────────────────────────────────────────────────

const svg = (label: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg"><title>${label}</title></svg>`;

/** Markup whose UTF-8 length is exactly `bytes` (ASCII padding inside a comment). */
function svgOfBytes(bytes: number): string {
  const head = '<svg><!--';
  const tail = '--></svg>';
  return head + 'x'.repeat(bytes - head.length - tail.length) + tail;
}

/**
 * The files of a `generated` input (see the header): `p/icon-<i>.svg` with i
 * zero-padded to 5 digits, markup `<svg id="<i>"/>`, or "" (rejected by the
 * svgPrefix stub) when `rejectEvery` divides i + 1.
 */
function generatedFiles(count: number, rejectEvery?: number): IconPackFile[] {
  return Array.from({ length: count }, (_, i) => ({
    path: `p/icon-${String(i).padStart(5, '0')}.svg`,
    svg:
      rejectEvery !== undefined && (i + 1) % rejectEvery === 0
        ? ''
        : `<svg id="${i}"/>`,
  }));
}

function summary(result: IconPackResult): Json {
  return {
    count: result.icons.length,
    skipped: result.skipped,
    first: result.icons[0] ?? null,
    last: result.icons[result.icons.length - 1] ?? null,
  };
}

const ICON_PATHS: ReadonlyArray<string> = [
  // tests/icon_pack.test.ts
  'Architecture-Service-Icons_07312026/Arch_Databases/64/Arch_Amazon-DynamoDB_64.svg',
  'Resource-Icons_07312026/Res_General-Icons/Res_48_Dark/Res_Server_48_Dark.svg',
  'Resource-Icons_07312026/Res_General-Icons/Res_48_Light/Res_Server_48_Light.svg',
  'Category-Icons_07312026/Arch-Category_32/Arch-Category_Blockchain_32.svg',
  'Azure_Public_Service_Icons/Icons/compute/10021-icon-service-Virtual-Machine.svg',
  'Unique Icons/Security Operations/SVG/SecOps-512-color-rgb.svg',
  'Category Icons/AI _ Machine Learning/SVG/AIMachineLearning-512-color.svg',
  // More layouts
  'Architecture-Service-Icons_07312026/Arch_Compute/16/Arch_AWS-Lambda_16.svg',
  'Architecture-Service-Icons_07312026/Arch_Compute/Arch_AWS-Lambda_64@2x.svg',
  'Resource-Icons_07312026/Res_Compute/Res_48_Light/Res_Amazon-EC2_Instance_48_Light.svg',
  'Azure_Public_Service_Icons/Icons/ai + machine learning/00028-icon-service-Batch-AI.svg',
  'Azure_Public_Service_Icons/Icons/other/02784-icon-service-Windows-10.svg',
  'Unique Icons/GKE/SVG/GKE-512-color.svg',
  'Unique Icons/GKE/PNG/GKE-512-color.svg',
  'Unique Icons/GKE/GKE.svg',
  'icons/a.svg',
  'ICONS/Compute/a.svg',
  'a.svg',
  'SVG/a.svg',
  'svgs/Storage/Bucket.svg',
  'pack/32px/thing-32px.svg',
  'pack/64PX/Thing.SVG',
  'pack/Res_Dark/Thing_Dark.svg',
  'pack/light/Thing-light.svg',
  'pack/Arch-Category_32_Dark/Thing_32_Dark.svg',
  'pack/Res-48/x_48-color.svg',
  'pack/Category_07312026/Item_07312026.svg',
  'pack/Category_0731202/Item_0731202.svg',
  'pack/123/Item-123.svg',
  'pack/a/b/c/Deep__Name--x.svg',
  'pack/ Spaced  Folder /  Spaced   Name  .svg',
  'pack/cafe/éclair.svg',
  'pack/emoji/😀-smile.svg',
  'pack/case/ßeta.svg',
  'pack/case/ǆungla.svg',
  'pack/Arch_/Arch_.svg',
  'pack/_64.svg',
  '.svg',
  '',
  'trailing/',
];

const CLEAN_NAMES: ReadonlyArray<string> = [
  // tests/icon_pack.test.ts
  '00123-icon-service-Windows-10',
  'Arch_Amazon-Route-53_64',
  // Suffixes and prefixes
  'Arch_Amazon-DynamoDB_64.svg',
  'Res_Server_48_Dark',
  'Res_Server_48_Light',
  'Res_Server_48_dark.SVG',
  'Server_dark_48',
  'Thing-512-color-rgb',
  'Thing-512-color',
  'Thing-512-rgb',
  'Thing_256px',
  'Thing_128@2x',
  'Thing_100',
  'Thing_8',
  'Thing-1024',
  'Thing_07312026',
  'Thing_07312026_64',
  'Thing_64_07312026',
  'Thing_0731202',
  'Arch-Category_Blockchain_32',
  'Arch-Category-Blockchain',
  'Arch_Res_Thing',
  'Res_Arch_Thing',
  '99-icon-service-Thing',
  'icon-service-Thing',
  '00028-ICON-SERVICE-Batch-AI',
  'AI _ Machine Learning',
  'AI _ ML _ Ops',
  'AI_ML',
  'snake_case__name',
  'kebab--case---name',
  '  padded  ',
  '',
  '.svg',
  '_dark',
  '-light',
  'dark',
  'éclair',
  'ßeta',
  'ǆungla',
  'ﬁle',
  '😀-smile',
  '123',
  'x_64_dark',
  'x_dark_light',
];

const PACK_NAMES: ReadonlyArray<[string, ReadonlyArray<string>, string]> = [
  // tests/icon_pack.test.ts
  ['test: aws', ['Architecture-Service-Icons_07312026/x.svg'], 'pkg.zip'],
  ['test: azure', ['Azure_Public_Service_Icons/Icons/a.svg'], 'x.zip'],
  ['test: google cloud', ['Unique Icons/GKE/SVG/GKE.svg'], 'x.zip'],
  ['test: file name', ['a.svg'], 'my-company_icons.zip'],
  // More
  ['aws resource icons', ['Resource-Icons_07312026/a.svg'], 'x.zip'],
  ['aws arch prefix', ['x/Arch_Foo_64.svg'], 'x.zip'],
  ['azure icon service', ['x/00001-icon-service-Foo.svg'], 'x.zip'],
  ['google category icons', ['readme.txt', 'Category Icons/x.svg'], 'x.zip'],
  ['google needs a path start', ['x/Unique Icons/a.svg'], 'pack.zip'],
  [
    'aws wins over azure',
    ['Azure_Public_Service_Icons/a.svg', 'Arch_x.svg'],
    'x.zip',
  ],
  ['upper case zip', [], 'Vendor-Pack.ZIP'],
  ['zip with size suffix', [], 'icons_64.zip'],
  ['zip with date', [], 'Icons_07312026.zip'],
  ['empty file name', [], ''],
  ['only extension', [], '.zip'],
  ['dark file name', [], 'pack_dark.zip'],
  ['no extension', [], 'my pack'],
];

function buildIconPackCases(fam: Family): void {
  for (const path of ICON_PATHS) {
    fam.add(
      `isIconSvgPath ${JSON.stringify(path)}`,
      'isIconSvgPath',
      { path },
      isIconSvgPath(path),
    );
  }
  for (const path of [
    'a/b.svg',
    '__MACOSX/a/._b.svg',
    'a/.hidden.svg',
    'a/b.png',
    'a/B.SVG',
    'a/b.svg.png',
    'a/b.svgz',
    '__MACOSX/b.svg',
    'x/__MACOSX/b.svg',
    'x/__macosx/b.svg',
    'x/._dir/b.svg',
    'x/.dir/b.svg',
    '._b.svg',
    '.svg',
    'svg',
    'a/b.svg/',
    '/a.svg',
  ]) {
    fam.add(
      `isIconSvgPath filter ${JSON.stringify(path)}`,
      'isIconSvgPath',
      { path },
      isIconSvgPath(path),
    );
  }
  for (const raw of CLEAN_NAMES) {
    fam.add(
      `cleanIconName ${JSON.stringify(raw)}`,
      'cleanIconName',
      { raw },
      cleanIconName(raw),
    );
  }
  for (const path of ICON_PATHS) {
    fam.add(
      `describeIconPath ${JSON.stringify(path)}`,
      'describeIconPath',
      { path },
      describeIconPath(path),
    );
  }
  for (const [name, paths, fileName] of PACK_NAMES) {
    fam.add(
      `detectPackName ${name}`,
      'detectPackName',
      { paths, fileName },
      detectPackName(paths, fileName),
    );
  }

  const pack = (
    name: string,
    files: IconPackFile[],
    sanitize: SanitizeStub = 'keep',
  ) => {
    fam.add(
      `buildIconPack ${name}`,
      'buildIconPack',
      { files, sanitize },
      buildIconPack(files, SANITIZERS[sanitize]),
    );
  };

  // tests/icon_pack.test.ts
  pack(
    'test: keeps the largest variant',
    [16, 32, 64, 48].map((size) => ({
      path: `Architecture-Service-Icons/Arch_Compute/${size}/Arch_AWS-Lambda_${size}.svg`,
      svg: svg(String(size)),
    })),
  );
  pack('test: sorts by category then name', [
    { path: 'p/storage/b.svg', svg: svg('b') },
    { path: 'p/compute/z.svg', svg: svg('z') },
    { path: 'p/compute/a.svg', svg: svg('a') },
  ]);
  pack(
    'test: sanitizer rejection and size cap',
    [
      { path: 'p/ok.svg', svg: svg('ok') },
      { path: 'p/bad.svg', svg: 'not svg' },
      { path: 'p/huge.svg', svg: svg('x'.repeat(MAX_EMBEDDED_SVG_CHARS)) },
    ],
    'svgPrefix',
  );
  pack('test: non-ASCII markup', [{ path: 'p/café.svg', svg: svg('café ✓') }]);

  // Variant selection
  pack('variant sizes from directory names', [
    { path: 'v/Compute/32/Lambda.svg', svg: svg('32') },
    { path: 'v/Compute/128px/Lambda.svg', svg: svg('128px') },
    { path: 'v/Compute/64/Lambda.svg', svg: svg('64') },
  ]);
  pack('variant size from the file name wins over the directory', [
    { path: 'v/Compute/512/Lambda_16.svg', svg: svg('dir 512 name 16') },
    { path: 'v/Compute/32/Lambda_32.svg', svg: svg('32') },
  ]);
  pack('variant tie keeps the first file', [
    { path: 'v/Compute/64/Lambda.svg', svg: svg('first') },
    { path: 'v/Compute/64px/Lambda_64.svg', svg: svg('second') },
  ]);
  pack('variant without size loses to any size', [
    { path: 'v/Compute/Lambda.svg', svg: svg('none') },
    { path: 'v/Compute/16/Lambda.svg', svg: svg('16') },
  ]);
  pack('variant suffix with dark theme', [
    {
      path: 'v/Res_General/Res_48_Dark/Res_Server_48_Dark.svg',
      svg: svg('48 dark'),
    },
    {
      path: 'v/Res_General/Res_16_Dark/Res_Server_16_Dark.svg',
      svg: svg('16 dark'),
    },
    {
      path: 'v/Res_General/Res_48_Light/Res_Server_48_Light.svg',
      svg: svg('48 light'),
    },
  ]);
  pack('variant key ignores case', [
    { path: 'v/Compute/16/lambda.svg', svg: svg('lower') },
    { path: 'v/COMPUTE/32/LAMBDA.svg', svg: svg('upper') },
  ]);
  pack('same name in different categories stays separate', [
    { path: 'v/Compute/Server.svg', svg: svg('compute') },
    { path: 'v/Storage/Server.svg', svg: svg('storage') },
    { path: 'v/Server.svg', svg: svg('root') },
  ]);
  pack('format folder names the icon after the product', [
    { path: 'Unique Icons/GKE/SVG/GKE-512-color.svg', svg: svg('gke') },
    {
      path: 'Unique Icons/Cloud Run/SVG/CloudRun-512-color-rgb.svg',
      svg: svg('run'),
    },
    {
      path: 'Category Icons/AI _ Machine Learning/SVG/AIMachineLearning-512-color.svg',
      svg: svg('ai'),
    },
  ]);
  pack('non-icon paths are ignored and not counted', [
    { path: '__MACOSX/p/._a.svg', svg: svg('meta') },
    { path: 'p/.hidden.svg', svg: svg('hidden') },
    { path: 'p/readme.txt', svg: 'text' },
    { path: 'p/a.png', svg: 'png' },
    { path: 'p/kept.svg', svg: svg('kept') },
  ]);
  pack('empty input', []);

  // Sanitizer stubs and the embedded size cap
  pack(
    'rejected best variant is skipped, not replaced by a smaller one',
    [
      { path: 'v/Compute/16/Lambda.svg', svg: svg('small') },
      { path: 'v/Compute/64/Lambda.svg', svg: 'broken' },
    ],
    'svgPrefix',
  );
  pack(
    'trim stub encodes the sanitized markup',
    [
      { path: 'p/a.svg', svg: `  ${svg('a')}\n` },
      { path: 'p/blank.svg', svg: ' \n\t ' },
    ],
    'trim',
  );
  // src.length = 26 + 4 * ceil(bytes / 3): 49131 bytes give 65534 chars (kept), 49132 give 65538 (skipped).
  pack('size cap: largest data URL under the cap is kept', [
    { path: 'p/fits.svg', svg: svgOfBytes(49131) },
  ]);
  pack('size cap: smallest data URL over the cap is skipped', [
    { path: 'p/over.svg', svg: svgOfBytes(49132) },
  ]);
  pack('size cap counts UTF-8 bytes, not UTF-16 units', [
    { path: 'p/wide.svg', svg: `<svg>${'é'.repeat(24563)}</svg>` },
  ]);
  pack('non-ASCII and astral markup', [
    { path: 'p/a.svg', svg: svg('日本語 😀 \u0000  ') },
  ]);

  // Sorting: String.prototype.localeCompare with the generator's default locale.
  pack(
    'sort: case, accents and punctuation',
    [
      'p/b/Zeta.svg',
      'p/b/alpha.svg',
      'p/b/Alpha.svg',
      'p/b/Éclair.svg',
      'p/b/eclair.svg',
      'p/b/Echo.svg',
      'p/b/ßeta.svg',
      'p/b/Beta.svg',
      'p/b/Item 10.svg',
      'p/b/Item 2.svg',
      'p/b/Item-1.svg',
      'p/b/_under.svg',
      'p/b/(paren).svg',
      'p/b/日本.svg',
      'p/b/Ωmega.svg',
      'p/b/😀.svg',
    ].map((path) => ({ path, svg: svg(path) })),
  );
  pack('sort: categories before names, empty category first', [
    { path: 'z.svg', svg: svg('root z') },
    { path: 'Storage/a.svg', svg: svg('storage a') },
    { path: 'compute/b.svg', svg: svg('compute b') },
    { path: 'Compute/a.svg', svg: svg('Compute a') },
    { path: 'a.svg', svg: svg('root a') },
    { path: 'Ärger/a.svg', svg: svg('umlaut') },
  ]);

  // The pack cap (MAX_ICONS_PER_PACK), on generated inputs with summary outputs.
  const generated = (name: string, count: number, rejectEvery?: number) => {
    const files = generatedFiles(count, rejectEvery);
    const sanitize: SanitizeStub =
      rejectEvery === undefined ? 'keep' : 'svgPrefix';
    fam.add(
      `buildIconPack generated ${name}`,
      'buildIconPack',
      {
        generated: { count, ...(rejectEvery !== undefined && { rejectEvery }) },
        sanitize,
      },
      summary(buildIconPack(files, SANITIZERS[sanitize])),
    );
  };
  generated('at the pack cap', MAX_ICONS_PER_PACK);
  generated('one over the pack cap', MAX_ICONS_PER_PACK + 1);
  generated('three over the pack cap', MAX_ICONS_PER_PACK + 3);
  generated(
    'rejections do not count toward the cap',
    MAX_ICONS_PER_PACK + 3,
    1000,
  );
}

// ── zip.json ──────────────────────────────────────────────────────────────────

const enc = new TextEncoder();

async function deflateRaw(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data.slice()])
    .stream()
    .pipeThrough(new CompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

interface EntrySpec {
  readonly name: string | Uint8Array;
  readonly text?: string;
  readonly bytes?: Uint8Array;
  readonly deflate?: boolean;
  /** Raw method value written in both headers (default 8 when deflate, else 0). */
  readonly method?: number;
  /** Stored payload replacing the (possibly deflated) data. */
  readonly payload?: Uint8Array;
  readonly flags?: number;
  /** Declared uncompressed size (default: the real one). */
  readonly size?: number;
  /** Declared compressed size (default: the payload length). */
  readonly compressedSize?: number;
  readonly localExtra?: number;
  readonly centralExtra?: number;
  readonly comment?: number;
  readonly localSignature?: number;
  readonly localOffsetDelta?: number;
}

interface ArchiveSpec {
  readonly count?: number;
  readonly centralOffset?: number;
  readonly comment?: string;
  /** Bytes before the first local header (offsets are not adjusted). */
  readonly prefix?: number;
  readonly truncate?: number;
  readonly centralSignature?: number;
}

/** Builds a ZIP in memory, like tests/zip_reader.test.ts, with knobs to break it. */
async function makeZip(
  entries: ReadonlyArray<EntrySpec>,
  archive: ArchiveSpec = {},
): Promise<Uint8Array> {
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = archive.prefix ?? 0;
  if (archive.prefix) locals.push(new Uint8Array(archive.prefix).fill(0x20));
  for (const e of entries) {
    const name = typeof e.name === 'string' ? enc.encode(e.name) : e.name;
    const raw = e.bytes ?? enc.encode(e.text ?? '');
    const method = e.method ?? (e.deflate ? 8 : 0);
    const data = e.payload ?? (e.deflate ? await deflateRaw(raw) : raw);
    const localExtra = e.localExtra ?? 0;
    const centralExtra = e.centralExtra ?? 0;
    const comment = e.comment ?? 0;

    const local = new Uint8Array(30 + name.length + localExtra + data.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, e.localSignature ?? 0x04034b50, true);
    lv.setUint16(6, e.flags ?? 0, true);
    lv.setUint16(8, method, true);
    lv.setUint32(18, e.compressedSize ?? data.length, true);
    lv.setUint32(22, e.size ?? raw.length, true);
    lv.setUint16(26, name.length, true);
    lv.setUint16(28, localExtra, true);
    local.set(name, 30);
    local.fill(0x41, 30 + name.length, 30 + name.length + localExtra);
    local.set(data, 30 + name.length + localExtra);

    const central = new Uint8Array(46 + name.length + centralExtra + comment);
    const cv = new DataView(central.buffer);
    cv.setUint32(0, archive.centralSignature ?? 0x02014b50, true);
    cv.setUint16(8, e.flags ?? 0, true);
    cv.setUint16(10, method, true);
    cv.setUint32(20, e.compressedSize ?? data.length, true);
    cv.setUint32(24, e.size ?? raw.length, true);
    cv.setUint16(28, name.length, true);
    cv.setUint16(30, centralExtra, true);
    cv.setUint16(32, comment, true);
    cv.setUint32(42, offset + (e.localOffsetDelta ?? 0), true);
    central.set(name, 46);
    central.fill(0x42, 46 + name.length);
    locals.push(local);
    centrals.push(central);
    offset += local.length;
  }
  const comment = enc.encode(archive.comment ?? '');
  const centralSize = centrals.reduce((n, c) => n + c.length, 0);
  const eocd = new Uint8Array(22 + comment.length);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, archive.count ?? entries.length, true);
  ev.setUint16(10, archive.count ?? entries.length, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, archive.centralOffset ?? offset, true);
  ev.setUint16(20, comment.length, true);
  eocd.set(comment, 22);
  const parts = [...locals, ...centrals, eocd];
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let p = 0;
  for (const part of parts) {
    out.set(part, p);
    p += part.length;
  }
  return archive.truncate === undefined ? out : out.slice(0, archive.truncate);
}

const base64 = (bytes: Uint8Array) => Buffer.from(bytes).toString('base64');

function errorJson(error: unknown): Json {
  // Messages of non-ZipError failures (inflate errors) are platform text.
  return error instanceof ZipError
    ? { zipError: true, message: error.message }
    : { zipError: false };
}

type SelectSpec = 'all' | 'none' | 'svg' | 'iconImport' | { below: number };

function selector(spec: SelectSpec): (name: string, size: number) => boolean {
  if (spec === 'all') return () => true;
  if (spec === 'none') return () => false;
  if (spec === 'svg') return (name) => name.endsWith('.svg');
  if (spec === 'iconImport') {
    return (name, size) =>
      isIconSvgPath(name) && size <= DEFAULT_ZIP_LIMITS.maxEntryBytes;
  }
  return (_name, size) => size < spec.below;
}

const ZIP_ENCODING =
  'zip is the archive as base64. limits is a ZipLimits object; when absent the default (DEFAULT_ZIP_LIMITS) ' +
  'is used. Errors are {zipError: true, message} for a ZipError (exact message) or {zipError: false} for any ' +
  'other failure (inflate errors, whose text is platform specific). listZipEntries {zip, limits?}: output ' +
  '{names} or {error}. readZipEntries {zip, select, limits?}: select is "all" (true), "none" (false), "svg" ' +
  '(name.endsWith(".svg")), "iconImport" (isIconSvgPath(name) && size <= DEFAULT_ZIP_LIMITS.maxEntryBytes, the ' +
  'selector of src/ui/icon_pack_import.ts without its counter) or {below: n} (size < n); output {calls, ' +
  'entries} or {calls, error}, calls the [name, size] arguments of every select call in order, entries ' +
  '[{name, data}] with data base64. iconPackFromZip {zip, fileName, sanitize}: importIconPack of ' +
  'src/ui/icon_pack_import.ts up to the store: names = listZipEntries(zip); entries = readZipEntries with the ' +
  'iconImport selector, counting the isIconSvgPath entries whose declared size is over maxEntryBytes as ' +
  'tooLarge; buildIconPack over {path: name, svg: new TextDecoder().decode(data)} with the sanitize stub; ' +
  'output {name: detectPackName(names, fileName), icons, skipped: skipped + tooLarge} or {error} (the "No SVG ' +
  'icons found" check, pack id, uniqueName, importedAt and the store are not part of it). ' +
  'DEFAULT_ZIP_LIMITS {}: output the constant.';

async function buildZipCases(fam: Family): Promise<void> {
  fam.add('DEFAULT_ZIP_LIMITS', 'DEFAULT_ZIP_LIMITS', {}, DEFAULT_ZIP_LIMITS);

  const list = async (
    name: string,
    zip: Uint8Array,
    limits?: ZipLimits,
  ): Promise<void> => {
    let output: Json;
    try {
      output = { names: listZipEntries(zip, limits) };
    } catch (error) {
      output = { error: errorJson(error) };
    }
    fam.add(
      `listZipEntries ${name}`,
      'listZipEntries',
      { zip: base64(zip), ...(limits && { limits }) },
      output,
    );
  };

  const read = async (
    name: string,
    zip: Uint8Array,
    select: SelectSpec,
    limits?: ZipLimits,
  ): Promise<void> => {
    const calls: Array<[string, number]> = [];
    const pick = selector(select);
    let output: Json;
    try {
      const entries = await readZipEntries(
        zip,
        (n, size) => {
          calls.push([n, size]);
          return pick(n, size);
        },
        limits,
      );
      output = {
        calls,
        entries: entries.map((e) => ({ name: e.name, data: base64(e.data) })),
      };
    } catch (error) {
      output = { calls, error: errorJson(error) };
    }
    fam.add(
      `readZipEntries ${name}`,
      'readZipEntries',
      { zip: base64(zip), select, ...(limits && { limits }) },
      output,
    );
  };

  const limits = (
    maxEntries: number,
    maxEntryBytes: number,
    maxTotalBytes: number,
  ): ZipLimits => ({ maxEntries, maxEntryBytes, maxTotalBytes });

  // tests/zip_reader.test.ts
  const basic = await makeZip([
    { name: 'icons/', text: '' },
    { name: 'icons/a.svg', text: '<svg>a</svg>' },
    { name: 'icons/b.svg', text: '<svg>'.repeat(200), deflate: true },
    { name: 'readme.txt', text: 'hello' },
  ]);
  await list('test: lists entries', basic);
  await read('test: reads stored and deflated files', basic, 'svg');
  await read('every entry, directories skipped before select', basic, 'all');
  await read('nothing selected', basic, 'none');
  const sized = await makeZip([
    { name: 'small.svg', text: 'x' },
    { name: 'large.svg', text: 'y'.repeat(5_000), deflate: true },
  ]);
  await read('test: passes the declared size to the selector', sized, {
    below: 1_000,
  });
  await list('test: not a ZIP', enc.encode('not a zip'));
  const big = await makeZip([
    { name: 'big.svg', text: 'x'.repeat(10_000), deflate: true },
  ]);
  await read(
    'test: entry limit on inflated output',
    big,
    'all',
    limits(10, 1_000, 1_000_000),
  );
  await read('test: total limit', big, 'all', limits(10, 1_000_000, 5_000));
  const two = await makeZip([
    { name: 'a.svg', text: 'a' },
    { name: 'b.svg', text: 'b' },
  ]);
  await list('test: entry count limit', two, limits(1, 1_000, 1_000));
  await read('entry count limit', two, 'all', limits(1, 1_000, 1_000));

  // Limits at their boundaries
  await list('entry count at the limit', two, limits(2, 1_000, 1_000));
  const tenK = await makeZip([
    { name: 'x.svg', text: 'x'.repeat(10_000), deflate: true },
  ]);
  await read(
    'inflated size equal to maxEntryBytes',
    tenK,
    'all',
    limits(10, 10_000, 1_000_000),
  );
  await read(
    'declared size over maxEntryBytes',
    tenK,
    'all',
    limits(10, 9_999, 1_000_000),
  );
  await read(
    'total equal to maxTotalBytes',
    tenK,
    'all',
    limits(10, 1_000_000, 10_000),
  );
  await read(
    'total one over maxTotalBytes',
    tenK,
    'all',
    limits(10, 1_000_000, 9_999),
  );
  const lying = await makeZip([
    { name: 'bomb.svg', text: 'z'.repeat(50_000), deflate: true, size: 10 },
  ]);
  await read(
    'declared size lies: inflated output enforces the limit',
    lying,
    'all',
    limits(10, 1_000, 1_000_000),
  );
  await read(
    'declared size lies: within the limit',
    lying,
    'all',
    limits(10, 50_000, 1_000_000),
  );
  const storedLying = await makeZip([
    { name: 'stored.svg', text: 's'.repeat(2_000), size: 10 },
  ]);
  await read(
    'stored entry: only the declared size is checked',
    storedLying,
    'all',
    limits(10, 100, 1_000_000),
  );
  const totals = await makeZip([
    { name: 'a.svg', text: 'a'.repeat(600) },
    { name: 'b.svg', text: 'b'.repeat(700), deflate: true },
    { name: 'c.svg', text: 'c'.repeat(600) },
  ]);
  await read(
    'total limit counts only selected entries',
    totals,
    { below: 650 },
    limits(10, 1_000, 1_200),
  );
  await read(
    'total limit trips on the second entry',
    totals,
    'all',
    limits(10, 1_000, 1_000),
  );

  // Archive layout
  await list('empty archive', await makeZip([]));
  await read('empty archive', await makeZip([]), 'all');
  const commented = await makeZip([{ name: 'a.svg', text: '<svg/>' }], {
    comment: 'archive comment PK\u0005\u0006 inside',
  });
  await list('archive comment containing an EOCD signature', commented);
  await read(
    'archive comment',
    await makeZip([{ name: 'a.svg', text: '<svg/>' }], { comment: 'hello' }),
    'all',
  );
  const extras = await makeZip([
    {
      name: 'a.svg',
      text: '<svg>a</svg>',
      localExtra: 7,
      centralExtra: 12,
      comment: 5,
    },
    {
      name: 'b.svg',
      text: '<svg>b</svg>',
      deflate: true,
      localExtra: 0,
      centralExtra: 3,
    },
  ]);
  await list('extra fields and entry comments', extras);
  await read('local extra length differs from the central one', extras, 'all');
  const names = await makeZip([
    { name: 'dir/café ✓.svg', text: 'utf8' },
    {
      name: new Uint8Array([0x62, 0xff, 0x2e, 0x73, 0x76, 0x67]),
      text: 'invalid',
    },
    { name: 'nested/dir/', text: '' },
    { name: 'nested/dir/x.svg', text: 'x' },
  ]);
  await list('non-ASCII and invalid UTF-8 names', names);
  await read('non-ASCII and invalid UTF-8 names', names, 'all');
  const binary = await makeZip([
    { name: 'bin.dat', bytes: Uint8Array.from({ length: 256 }, (_, i) => i) },
    {
      name: 'bin2.dat',
      bytes: Uint8Array.from({ length: 256 }, (_, i) => 255 - i),
      deflate: true,
    },
    { name: 'empty.svg', text: '' },
  ]);
  await read('binary data and an empty stored entry', binary, 'all');

  // Malformed archives
  await list('shorter than an EOCD record', enc.encode('PK\u0005\u0006'));
  await list('empty input', new Uint8Array(0));
  await list(
    'ZIP64 entry count marker',
    await makeZip([{ name: 'a.svg', text: 'a' }], { count: 0xffff }),
  );
  await list(
    'ZIP64 offset marker',
    await makeZip([{ name: 'a.svg', text: 'a' }], {
      centralOffset: 0xffffffff,
    }),
  );
  await list(
    'count larger than the directory',
    await makeZip([{ name: 'a.svg', text: 'a' }], { count: 2 }),
  );
  await list(
    'wrong central signature',
    await makeZip([{ name: 'a.svg', text: 'a' }], {
      centralSignature: 0x02014b51,
    }),
  );
  await list(
    'central offset past the end',
    await makeZip([{ name: 'a.svg', text: 'a' }], { centralOffset: 10_000 }),
  );
  await read(
    'wrong local signature',
    await makeZip([{ name: 'a.svg', text: 'a', localSignature: 0x04034b51 }]),
    'all',
  );
  await read(
    'local offset past the end',
    await makeZip([{ name: 'a.svg', text: 'a', localOffsetDelta: 10_000 }]),
    'all',
  );
  await read(
    'local header not selected is never read',
    await makeZip([{ name: 'a.svg', text: 'a', localSignature: 0 }]),
    'none',
  );
  await read(
    'compressed size past the end',
    await makeZip([{ name: 'a.svg', text: 'abc', compressedSize: 100_000 }]),
    'all',
  );
  const prefixed = await makeZip([{ name: 'a.svg', text: 'a' }], {
    prefix: 16,
  });
  await read('bytes before the archive shift the offsets', prefixed, 'all');
  const truncated = await makeZip([{ name: 'a.svg', text: 'a' }]);
  await list(
    'truncated before the EOCD',
    truncated.slice(0, truncated.length - 1),
  );
  await read(
    'encrypted entry',
    await makeZip([{ name: 'a.svg', text: 'a', flags: 1 }]),
    'all',
  );
  await read(
    'encrypted entry stops the read before later entries',
    await makeZip([
      { name: 'a.svg', text: 'a', flags: 1 },
      { name: 'b.svg', text: 'b' },
    ]),
    'svg',
  );
  await read(
    'encrypted entry skipped by select',
    await makeZip([
      { name: 'a.txt', text: 'a', flags: 1 },
      { name: 'b.svg', text: 'b' },
    ]),
    'svg',
  );
  await read(
    'other flag bits are ignored',
    await makeZip([{ name: 'a.svg', text: 'a', flags: 0x0808 }]),
    'all',
  );
  await read(
    'unsupported method',
    await makeZip([{ name: 'a.svg', text: 'a', method: 12 }]),
    'all',
  );
  await read(
    'unsupported method not selected',
    await makeZip([{ name: 'a.svg', text: 'a', method: 12 }]),
    'none',
  );
  await read(
    'corrupt deflate stream',
    await makeZip([
      {
        name: 'a.svg',
        text: 'abc',
        method: 8,
        payload: Uint8Array.from([0xff, 0xff, 0xff, 0xff]),
      },
    ]),
    'all',
  );
  await read(
    'empty deflate stream',
    await makeZip([{ name: 'a.svg', method: 8, payload: new Uint8Array(0) }]),
    'all',
  );
  const deflated = await deflateRaw(enc.encode('<svg>'.repeat(50)));
  await read(
    'truncated deflate stream',
    await makeZip([
      {
        name: 'a.svg',
        method: 8,
        payload: deflated.slice(0, deflated.length - 3),
        size: 250,
      },
    ]),
    'all',
  );
  await read(
    'bytes after the end of the deflate stream',
    await makeZip([
      {
        name: 'a.svg',
        method: 8,
        payload: Uint8Array.from([...deflated, 1, 2, 3]),
        size: 250,
      },
    ]),
    'all',
  );

  // The import pipeline (src/ui/icon_pack_import.ts without the sanitizer and the store).
  const pipeline = async (
    name: string,
    zip: Uint8Array,
    fileName: string,
    sanitize: SanitizeStub = 'keep',
  ): Promise<void> => {
    let output: Json;
    try {
      const names = listZipEntries(zip);
      let tooLarge = 0;
      const entries = await readZipEntries(zip, (n, size) => {
        if (!isIconSvgPath(n)) return false;
        if (size > DEFAULT_ZIP_LIMITS.maxEntryBytes) {
          tooLarge++;
          return false;
        }
        return true;
      });
      const decoder = new TextDecoder();
      const { icons, skipped } = buildIconPack(
        entries.map((e) => ({ path: e.name, svg: decoder.decode(e.data) })),
        SANITIZERS[sanitize],
      );
      output = {
        name: detectPackName(names, fileName),
        icons,
        skipped: skipped + tooLarge,
      };
    } catch (error) {
      output = { error: errorJson(error) };
    }
    fam.add(
      `iconPackFromZip ${name}`,
      'iconPackFromZip',
      { zip: base64(zip), fileName, sanitize },
      output,
    );
  };

  await pipeline(
    'aws layout',
    await makeZip([
      { name: 'Architecture-Service-Icons_07312026/', text: '' },
      {
        name: 'Architecture-Service-Icons_07312026/Arch_Compute/16/Arch_AWS-Lambda_16.svg',
        text: svg('16'),
      },
      {
        name: 'Architecture-Service-Icons_07312026/Arch_Compute/64/Arch_AWS-Lambda_64.svg',
        text: svg('64'),
        deflate: true,
      },
      {
        name: 'Architecture-Service-Icons_07312026/Arch_Databases/64/Arch_Amazon-DynamoDB_64.svg',
        text: svg('ddb'),
        deflate: true,
      },
      {
        name: '__MACOSX/Architecture-Service-Icons_07312026/._x.svg',
        text: 'meta',
      },
      {
        name: 'Architecture-Service-Icons_07312026/Arch_Compute/64/Arch_AWS-Lambda_64.png',
        text: 'png',
      },
    ]),
    'Asset-Package_07312026.zip',
  );
  await pipeline(
    'generic pack with a rejected file',
    await makeZip([
      { name: 'company/Network/router.svg', text: svg('router') },
      { name: 'company/Network/broken.svg', text: 'not svg' },
      { name: 'company/readme.md', text: '# readme' },
    ]),
    'my-company_icons.zip',
    'svgPrefix',
  );
  await pipeline(
    'oversized entry counted as skipped',
    await makeZip([
      {
        name: 'p/huge.svg',
        text: 'x',
        size: DEFAULT_ZIP_LIMITS.maxEntryBytes + 1,
      },
      {
        name: 'p/edge.svg',
        text: svg('edge'),
        size: DEFAULT_ZIP_LIMITS.maxEntryBytes,
      },
      { name: 'p/ok.svg', text: svg('ok') },
    ]),
    'pack.zip',
  );
  await pipeline(
    'invalid UTF-8 markup is decoded with replacement characters',
    await makeZip([
      {
        name: 'p/bad.svg',
        bytes: Uint8Array.from([
          ...enc.encode('<svg>'),
          0xc3,
          0x28,
          0xff,
          ...enc.encode('</svg>'),
        ]),
      },
      {
        name: 'p/bom.svg',
        bytes: Uint8Array.from([0xef, 0xbb, 0xbf, ...enc.encode('<svg/>')]),
      },
    ]),
    'pack.zip',
  );
  await pipeline(
    'no icons',
    await makeZip([{ name: 'readme.txt', text: 'hi' }]),
    'empty.zip',
  );
  await pipeline('not a ZIP', enc.encode('PK not really'), 'broken.zip');
}

/** icon_pack/icon_pack.json and icon_pack/zip.json. */
export async function buildIconPackFamily(): Promise<Family[]> {
  const pack = new Family('icon_pack', {
    inputs:
      'isIconSvgPath {path}, cleanIconName {raw}, describeIconPath {path}, detectPackName {paths, fileName}: ' +
      'output the return value. buildIconPack {files, sanitize}: files [{path, svg}], output {icons, skipped}. ' +
      'buildIconPack {generated: {count, rejectEvery?}, sanitize}: the files are generated, path ' +
      '"p/icon-<i>.svg" with i zero-padded to 5 digits and svg \'<svg id="<i>"/>\' for i = 0..count-1, except ' +
      'svg "" when rejectEvery is given and (i + 1) % rejectEvery === 0; output {count, skipped, first, last} ' +
      '(icon count, skipped, first and last icon or null). ' +
      SANITIZE_ENCODING,
    constants: {
      MAX_ICONS_PER_PACK,
      MAX_EMBEDDED_SVG_CHARS,
    },
    sortLocale: new Intl.Collator().resolvedOptions().locale,
    skipped:
      'Not covered: sanitizeSvg (src/ui/svg_sanitize.ts) needs DOMParser and XMLSerializer, which the node ' +
      'environment of the generator lacks; buildIconPack takes the sanitizer as a callback and the cases use ' +
      'the stubs above.',
  });
  buildIconPackCases(pack);

  const zip = new Family(
    'icon_pack',
    { inputs: `${ZIP_ENCODING} ${SANITIZE_ENCODING}` },
    'zip',
  );
  await buildZipCases(zip);
  return [pack, zip];
}
