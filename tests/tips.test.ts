import { describe, expect, it } from 'vitest';
import en from '../src/i18n/locales/en.json';
import {
  buildTips,
  MAX_SHOWS,
  markShown,
  markUsed,
  parseTipStats,
  pickTip,
  type TipContext,
  type TipEvent,
  type TipStats,
} from '../src/ui/tips';

const EMPTY: TipContext = {
  elementCount: 0,
  selectedCount: 0,
  hasShapes: false,
  isLive: false,
};
const BUSY_BOARD: TipContext = {
  elementCount: 12,
  selectedCount: 2,
  hasShapes: true,
  isLive: false,
};

const key = (
  k: string,
  mods: Partial<Omit<Extract<TipEvent, { type: 'key' }>, 'type' | 'key'>> = {},
): TipEvent => ({
  type: 'key',
  key: k,
  ctrlKey: false,
  metaKey: false,
  shiftKey: false,
  altKey: false,
  ...mods,
});

const tips = buildTips(true);

/** Ids of every tip pickTip would show, in order, on a board. */
function sequence(ctx: TipContext, start: TipStats = {}): string[] {
  const ids: string[] = [];
  let stats = start;
  let last: string | null = null;
  for (;;) {
    const tip = pickTip(tips, ctx, stats, last);
    if (!tip) return ids;
    ids.push(tip.id);
    stats = markShown(stats, tip.id);
    last = tip.id;
  }
}

describe('tip catalog', () => {
  it('has a translated text for every tip, with a slot for its key', () => {
    const dict = en as Record<string, string>;
    for (const tip of buildTips(false)) {
      const text = dict[tip.textKey];
      expect(text, tip.textKey).toBeTruthy();
      expect(text!.includes('{{key}}'), tip.id).toBe(tip.key !== undefined);
    }
  });

  it('shows the platform modifier', () => {
    const palette = (isMac: boolean) =>
      buildTips(isMac).find((tip) => tip.id === 'palette')!.key;
    expect(palette(true)).toBe('⌘K');
    expect(palette(false)).toBe('Ctrl+K');
    expect(buildTips(false).find((tip) => tip.id === 'lock')!.key).toBe(
      'Ctrl+Shift+L',
    );
  });

  it('has unique ids', () => {
    expect(new Set(tips.map((tip) => tip.id)).size).toBe(tips.length);
  });
});

describe('pickTip', () => {
  it('starts with the shortcuts reference', () => {
    expect(pickTip(tips, EMPTY, {})?.id).toBe('shortcuts');
  });

  it('only offers board tips when the board has something', () => {
    const empty = new Set(sequence(EMPTY));
    for (const id of ['search', 'duplicate', 'group', 'shapeLabel', 'fit'])
      expect(empty.has(id), id).toBe(false);
    const busy = new Set(sequence(BUSY_BOARD));
    for (const id of ['search', 'duplicate', 'group', 'shapeLabel', 'fit'])
      expect(busy.has(id), id).toBe(true);
  });

  it('never repeats the tip just shown', () => {
    const ids = sequence(EMPTY);
    for (let i = 1; i < ids.length; i++) expect(ids[i]).not.toBe(ids[i - 1]);
  });

  it('retires a tip after it was shown MAX_SHOWS times', () => {
    const ids = sequence(BUSY_BOARD);
    for (const tip of tips.filter((t) => !t.when || t.when(BUSY_BOARD)))
      expect(ids.filter((id) => id === tip.id)).toHaveLength(MAX_SHOWS);
    expect(pickTip(tips, BUSY_BOARD, {})).not.toBeNull();
  });

  it('prefers the least shown tip', () => {
    const stats = markShown({}, 'shortcuts');
    expect(pickTip(tips, EMPTY, stats)?.id).toBe('palette');
  });

  it('skips the live tip during a live session', () => {
    expect(sequence({ ...EMPTY, isLive: true })).not.toContain('live');
  });
});

describe('markUsed', () => {
  it('retires the tips a shortcut proves known', () => {
    let stats: TipStats = {};
    stats = markUsed(tips, stats, key('k', { metaKey: true }));
    stats = markUsed(tips, stats, key('?', { shiftKey: true }));
    expect(stats.palette?.used).toBe(true);
    expect(stats.shortcuts?.used).toBe(true);
    expect(sequence(EMPTY, stats)).not.toContain('palette');
    expect(pickTip(tips, EMPTY, stats)?.id).not.toBe('shortcuts');
  });

  it('tells plain keys from modified ones', () => {
    const plainF = markUsed(tips, {}, key('f'));
    expect(plainF.fit?.used).toBe(true);
    expect(plainF.search).toBeUndefined();
    const modF = markUsed(tips, {}, key('f', { ctrlKey: true }));
    expect(modF.search?.used).toBe(true);
    expect(modF.fit).toBeUndefined();
    // Shift matters: Cmd+Shift+L locks, Cmd+L does not.
    expect(
      markUsed(tips, {}, key('l', { metaKey: true })).lock,
    ).toBeUndefined();
    expect(
      markUsed(tips, {}, key('L', { metaKey: true, shiftKey: true })).lock
        ?.used,
    ).toBe(true);
  });

  it('learns from double-clicks and live sessions', () => {
    expect(markUsed(tips, {}, { type: 'dblclick' }).shapeLabel?.used).toBe(
      true,
    );
    expect(markUsed(tips, {}, { type: 'live' }).live?.used).toBe(true);
  });

  it('retires the agent tip only once the setup is opened', () => {
    // The tip shows ⌘K too, but opening the palette is not using the setup.
    expect(markUsed(tips, {}, key('k', { metaKey: true })).mcp).toBeUndefined();
    expect(markUsed(tips, {}, { type: 'mcpSetup' }).mcp?.used).toBe(true);
  });

  it('returns the same stats when nothing changes', () => {
    const stats = markUsed(tips, {}, key('k', { metaKey: true }));
    expect(markUsed(tips, stats, key('k', { metaKey: true }))).toBe(stats);
    expect(markUsed(tips, stats, key('x'))).toBe(stats);
  });

  it('keeps the show count of a tip it retires', () => {
    const shown = markShown(markShown({}, 'palette'), 'palette');
    expect(markUsed(tips, shown, key('k', { ctrlKey: true })).palette).toEqual({
      shown: 2,
      used: true,
    });
  });
});

describe('parseTipStats', () => {
  it('round-trips stored stats', () => {
    const stats = markUsed(tips, markShown({}, 'fit'), key('f'));
    expect(parseTipStats(JSON.stringify(stats))).toEqual(stats);
  });

  it('drops malformed data', () => {
    expect(parseTipStats(null)).toEqual({});
    expect(parseTipStats('not json')).toEqual({});
    expect(parseTipStats('[1,2]')).toEqual({});
    expect(
      parseTipStats(
        JSON.stringify({
          ok: { shown: 1, used: false },
          bad: { shown: 'x', used: true },
          worse: 3,
        }),
      ),
    ).toEqual({ ok: { shown: 1, used: false } });
  });
});
