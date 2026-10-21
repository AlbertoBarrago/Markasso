import {
  buildIconPack,
  detectPackName,
  type ImportedPack,
  isIconSvgPath,
} from '../io/icon_pack';
import { saveIconPack } from '../io/icon_pack_store';
import { listZipEntries, readZipEntries } from '../io/zip_reader';
import { sanitizeSvg } from './svg_sanitize';

/** Largest ZIP accepted; official vendor packs are 1-20 MB. */
const MAX_ZIP_BYTES = 150 * 1024 * 1024;

export class IconPackImportError extends Error {
  override name = 'IconPackImportError';
}

/** "AWS", "AWS 2", "AWS 3"... so re-imports never overwrite silently. */
function uniqueName(name: string, taken: ReadonlyArray<string>): string {
  if (!taken.includes(name)) return name;
  let i = 2;
  while (taken.includes(`${name} ${i}`)) i++;
  return `${name} ${i}`;
}

/**
 * Reads an official icon ZIP, keeps one sanitized SVG per icon and stores
 * the pack in this browser. Throws with a readable message on failure.
 */
export async function importIconPack(
  file: File,
  existingNames: ReadonlyArray<string>,
): Promise<{ pack: ImportedPack; skipped: number }> {
  if (file.size > MAX_ZIP_BYTES) {
    throw new IconPackImportError('ZIP file too large');
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  const names = listZipEntries(bytes);
  const entries = await readZipEntries(bytes, isIconSvgPath);
  const decoder = new TextDecoder();
  const { icons, skipped } = buildIconPack(
    entries.map((e) => ({ path: e.name, svg: decoder.decode(e.data) })),
    sanitizeSvg,
  );
  if (icons.length === 0) {
    throw new IconPackImportError('No SVG icons found in this ZIP');
  }
  const pack: ImportedPack = {
    id: crypto.randomUUID(),
    name: uniqueName(detectPackName(names, file.name), existingNames),
    importedAt: Date.now(),
    icons,
  };
  await saveIconPack(pack);
  return { pack, skipped };
}
