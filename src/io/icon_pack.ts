import { MAX_EMBEDDED_SVG_CHARS } from '../elements/stencils/registry';

/**
 * Turns the SVG files of an official vendor icon ZIP (AWS, Azure, Google
 * Cloud, or any similar archive) into an icon pack: one entry per icon,
 * with a readable name, a category and the best variant when an icon ships
 * in several sizes. Pure: sanitization is injected by the caller, since it
 * needs a DOM parser.
 */

export interface ImportedIcon {
  readonly id: string;
  readonly name: string;
  readonly category: string;
  /** Base64 SVG data URL, ready to embed in a stencil. */
  readonly src: string;
}

export interface ImportedPack {
  readonly id: string;
  readonly name: string;
  readonly importedAt: number;
  readonly icons: ReadonlyArray<ImportedIcon>;
}

export interface IconPackFile {
  readonly path: string;
  readonly svg: string;
}

export interface IconPackResult {
  readonly icons: ImportedIcon[];
  /** Icons dropped: rejected by the sanitizer, over the size cap, or over the pack cap. */
  readonly skipped: number;
}

/** Cap on icons per pack, well above the largest vendor set (~1,000). */
export const MAX_ICONS_PER_PACK = 5_000;

/** Folders that only encode a size (`64`, `32px`). */
const SIZE_DIR = /^\d+(px)?$/i;
/**
 * Folders that only encode a variant: a size and/or a theme, possibly with
 * an AWS prefix (`Res_48_Dark`, `Arch-Category_32`). Never a category.
 */
const VARIANT_DIR =
  /^((Arch-Category|Arch|Res)[_-]?)?(\d+(px)?)?([_-]?(light|dark))?$/i;
/** Folders that only encode a file format (`SVG`). */
const FORMAT_DIR = /^(svg|svgs|png)$/i;
/**
 * Trailing size markers (`_64`, `-512-color-rgb`, `@2x`). Limited to the
 * sizes vendors actually use, so names ending in a number ("Windows 10")
 * keep it.
 */
const SIZE_SUFFIX =
  /[_-](16|24|32|48|64|128|256|512)(px)?(-color)?(-rgb)?(@\dx)?$/i;
/** Release stamps vendors append to folder names (`_07312026`). */
const DATE_SUFFIX = /[_-]\d{8}$/;

/** Whether an archive path is an SVG worth considering. */
export function isIconSvgPath(path: string): boolean {
  const parts = path.split('/');
  const file = parts[parts.length - 1] ?? '';
  return (
    /\.svg$/i.test(file) &&
    !file.startsWith('.') &&
    !parts.some((p) => p === '__MACOSX' || p.startsWith('._'))
  );
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Human-readable name from a vendor file or folder name. */
export function cleanIconName(raw: string): string {
  let s = raw.replace(/\.svg$/i, '');
  // Light is the default theme; dark variants stay separate icons.
  const dark = /[_-]dark$/i.test(s);
  s = s.replace(/[_-](dark|light)$/i, '');
  s = s
    .replace(DATE_SUFFIX, '')
    .replace(SIZE_SUFFIX, '')
    .replace(/^(Arch-Category|Arch|Res)_/, '')
    .replace(/^\d+-icon-service-/i, '')
    // Google Cloud writes "AI / ML" as "AI _ ML" in folder names.
    .replace(/\s_\s/g, ' / ')
    .replace(/[_-]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
  return capitalize(dark ? `${s} (dark)` : s);
}

/** Size encoded in the path (`/64/` or `_64`), used to pick the best variant. */
function variantSize(path: string): number {
  const parts = path.split('/');
  const file = (parts[parts.length - 1] ?? '').replace(/\.svg$/i, '');
  const fromName = SIZE_SUFFIX.exec(file.replace(/[_-](dark|light)$/i, ''));
  const fromDir = parts
    .slice(0, -1)
    .reverse()
    .find((p) => SIZE_DIR.test(p));
  return Number(fromName?.[1] ?? fromDir?.replace(/px$/i, '') ?? 0);
}

/**
 * Name and category of an icon from its path. When the file sits in a
 * format folder (`GKE/SVG/GKE-512-color.svg`), the product folder is the
 * real name; otherwise the file name is, and the nearest meaningful folder
 * is the category.
 */
export function describeIconPath(path: string): {
  name: string;
  category: string;
} {
  const parts = path.split('/');
  const file = parts[parts.length - 1] ?? '';
  const dirs = parts.slice(0, -1).filter((p) => !VARIANT_DIR.test(p));
  let name = cleanIconName(file);
  if (dirs.length > 0 && FORMAT_DIR.test(dirs[dirs.length - 1] ?? '')) {
    dirs.pop();
    const product = dirs.pop();
    if (product) name = cleanIconName(product);
  }
  const categoryDir = dirs.filter((d) => !/^icons$/i.test(d)).pop();
  return {
    name,
    category: categoryDir ? cleanIconName(categoryDir) : '',
  };
}

/** Vendor name from the archive layout, falling back to the file name. */
export function detectPackName(
  paths: ReadonlyArray<string>,
  fileName: string,
): string {
  const all = paths.join('\n');
  if (/Architecture-Service-Icons|Resource-Icons_|Arch_/.test(all))
    return 'AWS';
  if (/Azure_Public_Service_Icons|-icon-service-/.test(all)) return 'Azure';
  if (/(^|\n)(Unique Icons|Category Icons)\//.test(all)) return 'Google Cloud';
  return cleanIconName(fileName.replace(/\.zip$/i, '')) || 'Icons';
}

function toBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

/**
 * Builds the icon list. `sanitize` returns the cleaned SVG markup or null
 * to reject a file. Variants of the same icon (same category and name) are
 * collapsed to the largest size.
 */
export function buildIconPack(
  files: ReadonlyArray<IconPackFile>,
  sanitize: (svg: string) => string | null,
): IconPackResult {
  const best = new Map<
    string,
    { file: IconPackFile; size: number; name: string; category: string }
  >();
  for (const file of files) {
    if (!isIconSvgPath(file.path)) continue;
    const { name, category } = describeIconPath(file.path);
    const key = `${category}\u0000${name}`.toLowerCase();
    const size = variantSize(file.path);
    const current = best.get(key);
    if (!current || size > current.size) {
      best.set(key, { file, size, name, category });
    }
  }

  const icons: ImportedIcon[] = [];
  let skipped = 0;
  for (const { file, name, category } of best.values()) {
    if (icons.length >= MAX_ICONS_PER_PACK) {
      skipped++;
      continue;
    }
    const clean = sanitize(file.svg);
    const src = clean ? `data:image/svg+xml;base64,${toBase64(clean)}` : null;
    if (!src || src.length > MAX_EMBEDDED_SVG_CHARS) {
      skipped++;
      continue;
    }
    icons.push({ id: String(icons.length), name, category, src });
  }
  icons.sort(
    (a, b) =>
      a.category.localeCompare(b.category) || a.name.localeCompare(b.name),
  );
  return { icons, skipped };
}
