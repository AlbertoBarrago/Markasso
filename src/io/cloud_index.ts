import type { Element } from '../elements/element';

/**
 * Local index of the cloud boards this browser knows (issue #100): one entry
 * per board id with what the Boards panel shows. It lives next to the edit
 * tokens (`markasso-cloud-tokens`) and, like them, never leaves the browser:
 * the server keeps no list of a subscriber's boards.
 */
export const BOARD_INDEX_KEY = 'markasso-cloud-boards';

/** Longest title kept from a board's first text. */
const TITLE_MAX = 60;

export interface BoardIndexEntry {
  /** Name set by the user; when absent the panel shows `title`. */
  name?: string;
  /** First text or label found in the board, refreshed on every open and save. */
  title: string;
  /** Epoch ms of the last open in this browser. */
  openedAt: number;
  /** Epoch ms of the last save from this browser. */
  savedAt?: number;
}

export type BoardIndex = Record<string, BoardIndexEntry>;

type IndexStorage = Pick<Storage, 'getItem' | 'setItem'>;

const ID = /^[a-zA-Z0-9]{12}$/;

function isEntry(value: unknown): value is BoardIndexEntry {
  if (!value || typeof value !== 'object') return false;
  const e = value as Record<string, unknown>;
  return (
    typeof e.title === 'string' &&
    Number.isFinite(e.openedAt) &&
    (e.name === undefined || typeof e.name === 'string') &&
    (e.savedAt === undefined || Number.isFinite(e.savedAt))
  );
}

/** Reads the index, dropping anything malformed; storage errors read as empty. */
export function readBoardIndex(storage: IndexStorage): BoardIndex {
  try {
    const value: unknown = JSON.parse(storage.getItem(BOARD_INDEX_KEY) ?? '{}');
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    return Object.fromEntries(
      Object.entries(value).filter(([id, e]) => ID.test(id) && isEntry(e)),
    ) as BoardIndex;
  } catch {
    return {};
  }
}

/**
 * Writes the index. A full or disabled storage only loses the panel's
 * metadata (the boards and their tokens are unaffected), so it is reported
 * to the caller as `false` instead of thrown.
 */
export function writeBoardIndex(
  storage: IndexStorage,
  index: BoardIndex,
): boolean {
  try {
    storage.setItem(BOARD_INDEX_KEY, JSON.stringify(index));
    return true;
  } catch {
    return false;
  }
}

/**
 * Title of a board: the first line of its first text element, else its first
 * shape or connector label, cut to TITLE_MAX characters. Empty when the board
 * has no text at all (the panel then falls back to a dated name).
 */
export function boardTitle(elements: readonly Element[]): string {
  const clean = (s: string) => {
    const line =
      s
        .split('\n')
        .find((l) => l.trim())
        ?.trim() ?? '';
    return line.length > TITLE_MAX ? `${line.slice(0, TITLE_MAX - 1)}…` : line;
  };
  for (const el of elements)
    if (el.type === 'text' && el.content.trim()) return clean(el.content);
  for (const el of elements)
    if ('label' in el && typeof el.label === 'string' && el.label.trim())
      return clean(el.label);
  return '';
}

/** Records an open or a save of `id`, refreshing its title from `elements`. */
export function touchBoard(
  storage: IndexStorage,
  id: string,
  elements: readonly Element[],
  event: 'opened' | 'saved',
  now = Date.now(),
): void {
  const index = readBoardIndex(storage);
  const previous = index[id];
  index[id] = {
    ...previous,
    title: boardTitle(elements),
    openedAt: event === 'opened' ? now : (previous?.openedAt ?? now),
    ...(event === 'saved' ? { savedAt: now } : {}),
  };
  writeBoardIndex(storage, index);
}

/** Sets or clears (empty string) the user's name for a board. */
export function renameBoard(
  storage: IndexStorage,
  id: string,
  name: string,
): void {
  const index = readBoardIndex(storage);
  const entry = index[id];
  if (!entry) return;
  const { name: _old, ...rest } = entry;
  const trimmed = name.trim().slice(0, TITLE_MAX);
  index[id] = trimmed ? { ...rest, name: trimmed } : rest;
  writeBoardIndex(storage, index);
}

/** Removes a board from the index (its token is removed by the caller). */
export function forgetBoard(storage: IndexStorage, id: string): void {
  const index = readBoardIndex(storage);
  if (!(id in index)) return;
  delete index[id];
  writeBoardIndex(storage, index);
}

/** A board as the panel lists it. */
export interface BoardListItem {
  id: string;
  /** User name, else title; empty when neither exists (the panel dates it). */
  name: string;
  /** Last activity: the later of the last open and the last save. */
  usedAt: number;
  /** True when this browser holds the edit token. */
  editable: boolean;
}

/**
 * Every board the panel shows, most recent first: the indexed ones plus any
 * board with a stored token but no index entry (tokens saved before the
 * index existed), which gets `usedAt` 0 and sorts last.
 */
export function listBoards(
  index: BoardIndex,
  tokens: Readonly<Record<string, string>>,
): BoardListItem[] {
  const ids = new Set([...Object.keys(index), ...Object.keys(tokens)]);
  return [...ids]
    .map((id) => {
      const e = index[id];
      return {
        id,
        name: e?.name ?? e?.title ?? '',
        usedAt: Math.max(e?.openedAt ?? 0, e?.savedAt ?? 0),
        editable: id in tokens,
      };
    })
    .sort((a, b) => b.usedAt - a.usedAt || a.id.localeCompare(b.id));
}

/** Keeps the items whose name contains every word of `query` (case and accent insensitive). */
export function searchBoards(
  items: readonly BoardListItem[],
  query: string,
): BoardListItem[] {
  const fold = (s: string) =>
    s.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase();
  const words = fold(query).split(/\s+/).filter(Boolean);
  if (!words.length) return [...items];
  return items.filter((item) => {
    const name = fold(item.name);
    return words.every((w) => name.includes(w));
  });
}

export type BoardSectionKey =
  | { kind: 'today' }
  | { kind: 'yesterday' }
  | { kind: 'weekday'; date: Date }
  | { kind: 'month'; date: Date }
  | { kind: 'older' };

export interface BoardSection {
  key: BoardSectionKey;
  items: BoardListItem[];
}

/**
 * Splits items (already sorted, most recent first) into day sections like the
 * Mac app's Boards panel: Today, Yesterday, each of the five days before by
 * weekday, then by month. Items never used in this browser (`usedAt` 0) go
 * to a last "older" section.
 */
export function groupBoards(
  items: readonly BoardListItem[],
  now = new Date(),
): BoardSection[] {
  const startOfDay = (d: Date) =>
    new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const today = startOfDay(now);
  const DAY = 86_400_000;
  const sections: BoardSection[] = [];
  const keyId = (k: BoardSectionKey) =>
    k.kind === 'weekday' || k.kind === 'month'
      ? `${k.kind}-${k.kind === 'month' ? `${k.date.getFullYear()}-${k.date.getMonth()}` : startOfDay(k.date)}`
      : k.kind;
  for (const item of items) {
    let key: BoardSectionKey;
    if (!item.usedAt) key = { kind: 'older' };
    else {
      const day = startOfDay(new Date(item.usedAt));
      // Calendar days apart, robust to DST (a day can be 23 or 25 hours).
      const daysAgo = Math.round((today - day) / DAY);
      const date = new Date(item.usedAt);
      key =
        daysAgo <= 0
          ? { kind: 'today' }
          : daysAgo === 1
            ? { kind: 'yesterday' }
            : daysAgo <= 6
              ? { kind: 'weekday', date }
              : { kind: 'month', date };
    }
    const last = sections[sections.length - 1];
    if (last && keyId(last.key) === keyId(key)) last.items.push(item);
    else sections.push({ key, items: [item] });
  }
  return sections;
}
