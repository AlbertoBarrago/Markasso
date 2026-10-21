import { screenToWorld } from '../core/viewport';
import { SHAPE_KINDS, type ShapeKind } from '../elements/element';
import {
  GENERIC_ICON_IDS,
  type GenericIconId,
  isGenericIconId,
} from '../elements/stencils/generic';
import {
  BUNDLED_PACKS,
  type BundledIcon,
  type BundledPack,
  getLoadedPack,
  isBundledPack,
  loadBundledPack,
  onBundledPackLoad,
} from '../elements/stencils/packs';
import type { History } from '../engine/history';
import { t } from '../i18n';
import type { ImportedIcon, ImportedPack } from '../io/icon_pack';
import { deleteIconPack, listIconPacks } from '../io/icon_pack_store';
import { insertShape, insertStencil } from './library_insert';
import { SHAPE_KIND_LABEL_KEYS, shapeKindIcon } from './shape_icons';
import { GENERIC_ICON_LABEL_KEYS, genericIconSvg } from './stencil_icons';

/**
 * Library sidebar, modeled on Excalidraw's: docked on the right, searchable,
 * grouped in collapsible sections. Click inserts at the center of the view,
 * dragging onto the canvas inserts at the drop point.
 */

/** One insertable entry. `key` is stable and is what recents store. */
interface LibraryItem {
  readonly key: string;
  readonly label: string;
  readonly icon: string;
  /** Sub-heading inside large packs (vendor categories). */
  readonly category?: string;
  insert(history: History, at?: { x: number; y: number }): void;
}

interface LibrarySection {
  readonly id: string;
  readonly title: string;
  readonly items: ReadonlyArray<LibraryItem>;
  /** Bundled packs start collapsed so the default view needs no scrolling. */
  readonly defaultOpen: boolean;
  /** Set for bundled packs, which load on demand. */
  readonly pack?: BundledPack;
  /** Set for packs the user imported (deletable, grouped by category). */
  readonly imported?: ImportedPack;
}

const OPEN_KEY = 'markasso-library-open';
/** Per-section open/closed state, keyed by section id. */
const SECTION_KEY_PREFIX = 'markasso-library-section-';
const RECENT_KEY = 'markasso-library-recent';
const MAX_RECENT = 8;
/** MIME type of library drags, so foreign drops (files, text) are ignored. */
const DRAG_TYPE = 'application/x-markasso-library-item';

const visibilityListeners = new Set<(open: boolean) => void>();
let toggleImpl: ((open?: boolean) => void) | null = null;
let currentlyOpen = false;

/** Opens, closes or (without argument) toggles the library sidebar. */
export function toggleLibrary(open?: boolean): void {
  toggleImpl?.(open);
}

/** Subscribes to open/close changes (e.g. to sync a toolbar button). */
export function onLibraryVisibilityChange(
  listener: (open: boolean) => void,
): () => void {
  visibilityListeners.add(listener);
  return () => visibilityListeners.delete(listener);
}

function shapeItem(kind: ShapeKind): LibraryItem {
  return {
    key: `shape:${kind}`,
    label: t(SHAPE_KIND_LABEL_KEYS[kind]),
    icon: shapeKindIcon(kind, 24),
    insert: (history, at) => insertShape(history, kind, at),
  };
}

function genericIconItem(id: GenericIconId): LibraryItem {
  const label = t(GENERIC_ICON_LABEL_KEYS[id]);
  return {
    key: `icon:generic/${id}`,
    label,
    icon: genericIconSvg(id, 24),
    insert: (history, at) =>
      insertStencil(
        history,
        { kind: 'builtin', ref: `generic/${id}` },
        label,
        at,
      ),
  };
}

function bundledIconItem(pack: BundledPack, icon: BundledIcon): LibraryItem {
  return {
    key: `icon:${pack.id}/${icon.id}`,
    label: icon.label,
    // Bundled artwork is ours (generated at build time), safe as an <img>.
    icon: `<img src="${icon.src}" width="24" height="24" alt="" draggable="false" />`,
    insert: (history, at) =>
      insertStencil(
        history,
        { kind: 'builtin', ref: `${pack.id}/${icon.id}` },
        icon.label,
        at,
      ),
  };
}

function importedIconItem(pack: ImportedPack, icon: ImportedIcon): LibraryItem {
  return {
    key: `icon:imported/${pack.id}/${icon.id}`,
    label: icon.name,
    category: icon.category,
    // `src` was sanitized and is a strict base64 data URL (see icon_pack).
    icon: `<img src="${icon.src}" width="24" height="24" alt="" draggable="false" />`,
    insert: (history, at) =>
      insertStencil(
        history,
        { kind: 'embedded', src: icon.src, pack: pack.name, name: icon.name },
        icon.name,
        at,
      ),
  };
}

/** Sections in display order; pack sections are empty until loaded. */
function buildSections(
  importedPacks: ReadonlyArray<ImportedPack>,
): LibrarySection[] {
  return [
    {
      id: 'flowchart',
      title: t('shapes'),
      items: SHAPE_KINDS.map(shapeItem),
      defaultOpen: true,
    },
    {
      id: 'generic',
      title: t('libraryIcons'),
      items: GENERIC_ICON_IDS.map(genericIconItem),
      defaultOpen: true,
    },
    ...BUNDLED_PACKS.map((pack) => ({
      id: `pack-${pack.id}`,
      title: pack.title,
      items: (getLoadedPack(pack.id) ?? []).map((icon) =>
        bundledIconItem(pack, icon),
      ),
      defaultOpen: false,
      pack,
    })),
    ...importedPacks.map((pack) => ({
      id: `imported-${pack.id}`,
      title: pack.name,
      items: pack.icons.map((icon) => importedIconItem(pack, icon)),
      defaultOpen: false,
      imported: pack,
    })),
  ];
}

function readStorage(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    // Storage can be unavailable (private mode, blocked site data): the
    // library then simply starts closed and without recents.
    return null;
  }
}

function writeStorage(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Same as readStorage: persistence is a convenience only.
  }
}

function readRecent(): string[] {
  const raw = readStorage(RECENT_KEY);
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((k): k is string => typeof k === 'string')
      : [];
  } catch {
    return [];
  }
}

/** Library keys stay valid across releases only if their target exists. */
function isKnownKey(key: string): boolean {
  const [kind, rest = ''] = key.split(':');
  if (kind === 'shape')
    return (SHAPE_KINDS as readonly string[]).includes(rest);
  if (kind === 'icon') {
    const [pack = '', id = ''] = rest.split('/');
    // Imported packs are checked at render time (they load asynchronously).
    if (pack === 'imported') return true;
    return pack === 'generic' ? isGenericIconId(id) : isBundledPack(pack);
  }
  return false;
}

export function initLibraryPanel(
  workspace: HTMLElement,
  history: History,
  canvas: HTMLCanvasElement,
): void {
  const panel = document.createElement('aside');
  panel.id = 'library-panel';
  panel.setAttribute('aria-label', t('library'));
  panel.innerHTML = `
    <div class="lib-header">
      <span class="lib-title">${t('library')}</span>
      <button class="lib-close" type="button" title="${t('close')}" aria-label="${t('close')}">
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="3" y1="3" x2="13" y2="13"/><line x1="13" y1="3" x2="3" y2="13"/></svg>
      </button>
    </div>
    <input class="lib-search" type="search" placeholder="${t('librarySearch')}" aria-label="${t('librarySearch')}" />
    <div class="lib-body"></div>
  `;
  workspace.appendChild(panel);

  const body = panel.querySelector<HTMLElement>('.lib-body')!;
  const search = panel.querySelector<HTMLInputElement>('.lib-search')!;
  let itemsByKey = new Map<string, LibraryItem>();
  let recent = readRecent().filter(isKnownKey);
  let importedPacks: ImportedPack[] = [];
  let importStatus: { text: string; error: boolean } | null = null;
  let importing = false;

  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = '.zip,application/zip';
  fileInput.hidden = true;
  panel.appendChild(fileInput);
  fileInput.addEventListener('change', () => {
    const file = fileInput.files?.[0];
    fileInput.value = '';
    if (file) void runImport(file);
  });

  async function runImport(file: File): Promise<void> {
    importing = true;
    importStatus = { text: t('libraryImporting'), error: false };
    render();
    try {
      // ZIP reading and SVG sanitizing only load when importing.
      const { importIconPack } = await import('./icon_pack_import');
      const { pack, skipped } = await importIconPack(
        file,
        importedPacks.map((p) => p.name),
      );
      importedPacks = [...importedPacks, pack];
      // Open the new pack so the result is visible right away.
      writeStorage(`${SECTION_KEY_PREFIX}imported-${pack.id}`, 'open');
      importStatus = {
        text: t('libraryImportDone')
          .replace('{count}', String(pack.icons.length))
          .replace('{name}', pack.name)
          .concat(
            skipped > 0
              ? ` ${t('libraryImportSkipped').replace('{count}', String(skipped))}`
              : '',
          ),
        error: false,
      };
    } catch (error) {
      console.error('[library] Icon pack import failed', error);
      importStatus = {
        text: `${t('libraryImportError')} ${error instanceof Error ? error.message : ''}`.trim(),
        error: true,
      };
    } finally {
      importing = false;
      render();
    }
  }

  async function removePack(pack: ImportedPack): Promise<void> {
    if (
      !window.confirm(
        t('libraryDeletePackConfirm').replace('{name}', pack.name),
      )
    ) {
      return;
    }
    try {
      await deleteIconPack(pack.id);
      importedPacks = importedPacks.filter((p) => p.id !== pack.id);
      recent = recent.filter((k) => !k.startsWith(`icon:imported/${pack.id}/`));
      writeStorage(RECENT_KEY, JSON.stringify(recent));
      importStatus = null;
    } catch (error) {
      console.error('[library] Icon pack deletion failed', error);
      importStatus = { text: t('libraryStorageError'), error: true };
    }
    render();
  }

  /** Import button, privacy note and last import result. */
  function importArea(): HTMLElement {
    const area = document.createElement('div');
    area.className = 'lib-import';
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'lib-import-btn';
    button.textContent = importing
      ? t('libraryImporting')
      : t('libraryImportZip');
    button.disabled = importing;
    button.addEventListener('click', () => fileInput.click());
    const hint = document.createElement('p');
    hint.className = 'lib-credit';
    hint.textContent = t('libraryImportHint');
    area.append(button, hint);
    if (importStatus) {
      const status = document.createElement('p');
      status.className = importStatus.error
        ? 'lib-status lib-status-error'
        : 'lib-status';
      status.setAttribute('role', 'status');
      status.textContent = importStatus.text;
      area.appendChild(status);
    }
    return area;
  }

  /** Loads a pack, then re-renders (the load listener below does that). */
  function ensurePack(pack: BundledPack): void {
    if (getLoadedPack(pack.id)) return;
    loadBundledPack(pack.id).catch((error: unknown) => {
      console.error(`[library] Failed to load "${pack.id}"`, error);
    });
  }

  function remember(key: string): void {
    recent = [key, ...recent.filter((k) => k !== key)].slice(0, MAX_RECENT);
    writeStorage(RECENT_KEY, JSON.stringify(recent));
  }

  function use(item: LibraryItem, at?: { x: number; y: number }): void {
    item.insert(history, at);
    remember(item.key);
    render();
    // Hand focus back to the canvas so Delete, arrows and tool shortcuts act
    // on the inserted element (shortcuts are muted while focus is in here).
    (document.activeElement as HTMLElement | null)?.blur();
  }

  function itemButton(item: LibraryItem): HTMLButtonElement {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'lib-item';
    b.title = item.label;
    b.draggable = true;
    b.innerHTML = `${item.icon}<span class="lib-item-label"></span>`;
    // Labels come from i18n but are set as text to keep markup out of them.
    b.querySelector('.lib-item-label')!.textContent = item.label;
    b.addEventListener('click', () => use(item));
    b.addEventListener('dragstart', (e) => {
      e.dataTransfer?.setData(DRAG_TYPE, item.key);
      if (e.dataTransfer) e.dataTransfer.effectAllowed = 'copy';
    });
    return b;
  }

  function sectionEl(
    section: Pick<
      LibrarySection,
      'id' | 'title' | 'defaultOpen' | 'pack' | 'imported'
    >,
    items: ReadonlyArray<LibraryItem>,
    grouped = false,
  ): HTMLElement {
    const { id, pack, imported } = section;
    const details = document.createElement('details');
    details.className = 'lib-section';
    details.dataset.section = id;
    const stored = readStorage(`${SECTION_KEY_PREFIX}${id}`);
    details.open = stored === null ? section.defaultOpen : stored === 'open';
    details.addEventListener('toggle', () => {
      writeStorage(
        `${SECTION_KEY_PREFIX}${id}`,
        details.open ? 'open' : 'closed',
      );
      if (details.open && pack) ensurePack(pack);
    });
    const summary = document.createElement('summary');
    const title = document.createElement('span');
    title.textContent = section.title;
    summary.appendChild(title);
    if (imported) {
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'lib-pack-delete';
      remove.title = t('libraryDeletePack');
      remove.setAttribute(
        'aria-label',
        `${t('libraryDeletePack')}: ${imported.name}`,
      );
      remove.textContent = '✕';
      remove.addEventListener('click', (e) => {
        // Keep the click from toggling the section.
        e.preventDefault();
        void removePack(imported);
      });
      summary.appendChild(remove);
    }
    details.appendChild(summary);

    if (pack && !getLoadedPack(pack.id)) {
      const loading = document.createElement('p');
      loading.className = 'lib-empty';
      loading.textContent = t('libraryLoading');
      details.appendChild(loading);
      if (details.open) ensurePack(pack);
      return details;
    }
    // Large vendor packs read better split by their own categories.
    const groups = new Map<string, LibraryItem[]>();
    for (const item of items) {
      const key = grouped ? (item.category ?? '') : '';
      groups.set(key, [...(groups.get(key) ?? []), item]);
    }
    for (const [category, groupItems] of groups) {
      if (category) {
        const heading = document.createElement('p');
        heading.className = 'lib-category';
        heading.textContent = category;
        details.appendChild(heading);
      }
      const grid = document.createElement('div');
      grid.className = 'lib-grid';
      for (const item of groupItems) grid.appendChild(itemButton(item));
      details.appendChild(grid);
    }
    if (pack) {
      const credit = document.createElement('p');
      credit.className = 'lib-credit';
      credit.textContent = pack.attribution;
      details.appendChild(credit);
    }
    return details;
  }

  function render(): void {
    const query = search.value.trim().toLowerCase();
    const matches = (item: LibraryItem): boolean =>
      !query ||
      item.label.toLowerCase().includes(query) ||
      item.key.toLowerCase().includes(query);
    body.replaceChildren();
    const sections = buildSections(importedPacks);
    itemsByKey = new Map(
      sections.flatMap((s) => s.items.map((i) => [i.key, i] as const)),
    );
    // Searching or showing a recent icon needs its pack's artwork.
    for (const { pack } of sections) {
      if (!pack) continue;
      if (query || recent.some((k) => k.startsWith(`icon:${pack.id}/`))) {
        ensurePack(pack);
      }
    }

    const recentItems = recent
      .map((k) => itemsByKey.get(k))
      .filter((i): i is LibraryItem => i !== undefined && matches(i));
    if (!query && recentItems.length > 0) {
      body.appendChild(
        sectionEl(
          { id: 'recent', title: t('libraryRecent'), defaultOpen: true },
          recentItems,
        ),
      );
    }
    let shown = 0;
    for (const section of sections) {
      const items = section.items.filter(matches);
      shown += items.length;
      // Unloaded packs stay listed (collapsed) so they can be opened.
      const unloadedPack =
        section.pack !== undefined && !getLoadedPack(section.pack.id);
      if (items.length > 0 || (unloadedPack && !query)) {
        body.appendChild(
          sectionEl(section, items, section.imported !== undefined && !query),
        );
      }
    }
    if (shown === 0) {
      const empty = document.createElement('p');
      empty.className = 'lib-empty';
      empty.textContent = t('libraryNoResults');
      body.appendChild(empty);
    }
    if (!query) body.appendChild(importArea());
  }

  function setOpen(open: boolean): void {
    currentlyOpen = open;
    panel.classList.toggle('open', open);
    document.body.classList.toggle('library-open', open);
    writeStorage(OPEN_KEY, open ? '1' : '0');
    for (const listener of visibilityListeners) listener(open);
  }

  toggleImpl = (open) => {
    const next = open ?? !currentlyOpen;
    setOpen(next);
    if (next) search.focus();
  };

  search.addEventListener('input', render);
  panel
    .querySelector('.lib-close')!
    .addEventListener('click', () => setOpen(false));
  panel.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      setOpen(false);
      (document.activeElement as HTMLElement | null)?.blur();
    }
  });

  // Drop from the library onto the canvas inserts at the pointer position.
  canvas.addEventListener('dragover', (e) => {
    if (e.dataTransfer?.types.includes(DRAG_TYPE)) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
    }
  });
  canvas.addEventListener('drop', (e) => {
    const key = e.dataTransfer?.getData(DRAG_TYPE);
    const item = key ? itemsByKey.get(key) : undefined;
    if (!item) return;
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const [x, y] = screenToWorld(
      history.present.viewport,
      e.clientX - rect.left,
      e.clientY - rect.top,
    );
    use(item, { x, y });
  });

  onBundledPackLoad(render);
  listIconPacks().then(
    (packs) => {
      importedPacks = packs;
      render();
    },
    (error: unknown) => {
      console.error('[library] Could not load imported icon packs', error);
      importStatus = { text: t('libraryStorageError'), error: true };
      render();
    },
  );
  render();
  setOpen(readStorage(OPEN_KEY) === '1');
}
