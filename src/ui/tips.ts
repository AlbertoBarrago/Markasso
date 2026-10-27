/**
 * Idle tips: short suggestions shown while the user is inactive, chosen by
 * what is on the board and skipping what the user already knows. Pure data
 * and selection only; idle_tips.ts owns timing and the DOM.
 */

/** What the board looks like when a tip is picked. */
export interface TipContext {
  readonly elementCount: number;
  readonly selectedCount: number;
  /** A rectangle, ellipse, rhombus or flowchart shape is on the board. */
  readonly hasShapes: boolean;
  readonly isLive: boolean;
}

/** User action that proves a tip is already known. */
export type TipEvent =
  | {
      readonly type: 'key';
      readonly key: string;
      readonly ctrlKey: boolean;
      readonly metaKey: boolean;
      readonly shiftKey: boolean;
      readonly altKey: boolean;
    }
  | { readonly type: 'dblclick' }
  | { readonly type: 'live' };

export interface Tip {
  readonly id: string;
  /** i18n key; `{{key}}` in the text is replaced by {@link Tip.key}. */
  readonly textKey: string;
  /** Shortcut as displayed, already adapted to the platform. */
  readonly key?: string;
  readonly when?: (ctx: TipContext) => boolean;
  readonly isUsedBy: (e: TipEvent) => boolean;
}

/** Times a tip is shown before it retires, even if never used. */
export const MAX_SHOWS = 3;

export interface TipStat {
  readonly shown: number;
  readonly used: boolean;
}
export type TipStats = Readonly<Record<string, TipStat>>;

const plainKey =
  (...keys: string[]) =>
  (e: TipEvent): boolean =>
    e.type === 'key' &&
    !e.ctrlKey &&
    !e.metaKey &&
    !e.altKey &&
    keys.includes(e.key);

const modKey =
  (key: string, shift = false) =>
  (e: TipEvent): boolean =>
    e.type === 'key' &&
    (e.ctrlKey || e.metaKey) &&
    e.shiftKey === shift &&
    e.key.toLowerCase() === key;

/**
 * Every tip, most useful first: when several apply, the least shown wins
 * and ties go to the earlier one.
 */
export function buildTips(isMac: boolean): Tip[] {
  const mod = (key: string, shift = false): string =>
    isMac
      ? `⌘${shift ? '⇧' : ''}${key}`
      : `Ctrl+${shift ? 'Shift+' : ''}${key}`;
  const hasElements = (min: number) => (ctx: TipContext) =>
    ctx.elementCount >= min;
  return [
    {
      id: 'shortcuts',
      textKey: 'tipShortcuts',
      key: '?',
      isUsedBy: plainKey('?'),
    },
    {
      id: 'palette',
      textKey: 'tipPalette',
      key: mod('K'),
      isUsedBy: modKey('k'),
    },
    {
      id: 'search',
      textKey: 'tipSearch',
      key: mod('F'),
      when: hasElements(5),
      isUsedBy: modKey('f'),
    },
    {
      id: 'duplicate',
      textKey: 'tipDuplicate',
      key: mod('D'),
      when: (ctx) => ctx.selectedCount >= 1,
      isUsedBy: modKey('d'),
    },
    {
      id: 'group',
      textKey: 'tipGroup',
      key: mod('G'),
      when: (ctx) => ctx.selectedCount >= 2,
      isUsedBy: modKey('g'),
    },
    {
      id: 'shapeLabel',
      textKey: 'tipShapeLabel',
      when: (ctx) => ctx.hasShapes,
      isUsedBy: (e) => e.type === 'dblclick',
    },
    {
      id: 'fit',
      textKey: 'tipFit',
      key: 'F',
      when: hasElements(5),
      isUsedBy: plainKey('f', 'F'),
    },
    {
      id: 'library',
      textKey: 'tipLibrary',
      key: 'I',
      isUsedBy: plainKey('i', 'I'),
    },
    {
      id: 'sticky',
      textKey: 'tipSticky',
      key: 'N',
      isUsedBy: plainKey('n', 'N'),
    },
    {
      id: 'pan',
      textKey: 'tipPan',
      key: 'Space',
      isUsedBy: plainKey(' '),
    },
    {
      id: 'lock',
      textKey: 'tipLock',
      key: mod('L', true),
      when: (ctx) => ctx.selectedCount >= 1,
      isUsedBy: modKey('l', true),
    },
    {
      id: 'live',
      textKey: 'tipLive',
      when: (ctx) => !ctx.isLive,
      isUsedBy: (e) => e.type === 'live',
    },
    {
      id: 'minimap',
      textKey: 'tipMinimap',
      key: 'M',
      when: hasElements(5),
      isUsedBy: plainKey('m', 'M'),
    },
    {
      id: 'hideUi',
      textKey: 'tipHideUi',
      key: '\\',
      isUsedBy: plainKey('\\'),
    },
    {
      id: 'preferences',
      textKey: 'tipPreferences',
      key: mod(','),
      isUsedBy: modKey(','),
    },
  ];
}

/**
 * Next tip to show: one that applies to the board, has not been used, has
 * not retired and is not the one just shown. Least shown first, then
 * catalog order. Null when nothing is left to teach.
 */
export function pickTip(
  tips: ReadonlyArray<Tip>,
  ctx: TipContext,
  stats: TipStats,
  lastId: string | null = null,
): Tip | null {
  let best: Tip | null = null;
  let bestShown = Number.POSITIVE_INFINITY;
  for (const tip of tips) {
    const stat = stats[tip.id];
    const shown = stat?.shown ?? 0;
    if (stat?.used || shown >= MAX_SHOWS || tip.id === lastId) continue;
    if (tip.when && !tip.when(ctx)) continue;
    if (shown < bestShown) {
      best = tip;
      bestShown = shown;
    }
  }
  return best;
}

/** Stats after a user action: every tip it proves known is marked used. */
export function markUsed(
  tips: ReadonlyArray<Tip>,
  stats: TipStats,
  e: TipEvent,
): TipStats {
  let next: Record<string, TipStat> | null = null;
  for (const tip of tips) {
    if (stats[tip.id]?.used || !tip.isUsedBy(e)) continue;
    next ??= { ...stats };
    next[tip.id] = { shown: stats[tip.id]?.shown ?? 0, used: true };
  }
  return next ?? stats;
}

/** Stats after a tip was shown once more. */
export function markShown(stats: TipStats, id: string): TipStats {
  const stat = stats[id];
  return {
    ...stats,
    [id]: { shown: (stat?.shown ?? 0) + 1, used: stat?.used ?? false },
  };
}

/** Parses stored stats, dropping anything malformed. */
export function parseTipStats(raw: string | null): TipStats {
  if (!raw) return {};
  try {
    const data: unknown = JSON.parse(raw);
    if (!data || typeof data !== 'object' || Array.isArray(data)) return {};
    const out: Record<string, TipStat> = {};
    for (const [id, value] of Object.entries(data)) {
      if (
        value &&
        typeof value === 'object' &&
        'shown' in value &&
        'used' in value &&
        typeof value.shown === 'number' &&
        Number.isFinite(value.shown) &&
        typeof value.used === 'boolean'
      )
        out[id] = { shown: Math.max(0, value.shown), used: value.used };
    }
    return out;
  } catch {
    return {};
  }
}
