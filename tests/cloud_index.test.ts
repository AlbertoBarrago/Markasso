import { describe, expect, it, vi } from 'vitest';
import type { Element } from '../src/elements/element';
import { CloudClient, CloudError, TOKEN_KEY } from '../src/io/cloud';
import {
  BOARD_INDEX_KEY,
  type BoardListItem,
  boardTitle,
  groupBoards,
  listBoards,
  readBoardIndex,
  renameBoard,
  searchBoards,
  touchBoard,
} from '../src/io/cloud_index';

const id = 'Abc123def456';
const other = 'Zzz999yyy888';
const token = 'x'.repeat(43);

function memory() {
  const values = new Map<string, string>();
  return {
    values,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value),
    removeItem: (key: string) => void values.delete(key),
  };
}

const text = (content: string): Element => ({
  id: 't',
  type: 'text',
  x: 0,
  y: 0,
  width: 10,
  height: 10,
  content,
  fontSize: 20,
  fontFamily: 'sans-serif',
  strokeColor: '#000000',
  fillColor: 'transparent',
  strokeWidth: 0,
  opacity: 1,
  roughness: 0,
});
const rect = (label?: string): Element => ({
  id: 'r',
  type: 'rectangle',
  x: 0,
  y: 0,
  width: 10,
  height: 10,
  strokeColor: '#000000',
  fillColor: 'transparent',
  strokeWidth: 1,
  opacity: 1,
  roughness: 0,
  ...(label ? { label } : {}),
});

describe('boardTitle', () => {
  it('prefers the first text, then the first label, first non-empty line', () => {
    expect(boardTitle([rect('Label'), text('\n  Roadmap Q1 \nmore')])).toBe(
      'Roadmap Q1',
    );
    expect(boardTitle([rect(), rect('Login flow')])).toBe('Login flow');
    expect(boardTitle([rect()])).toBe('');
    expect(boardTitle([text('a'.repeat(80))])).toHaveLength(60);
  });
});

describe('board index storage', () => {
  it('records opens and saves, keeping a user name over the title', () => {
    const s = memory();
    touchBoard(s, id, [text('First')], 'opened', 1000);
    touchBoard(s, id, [text('Second')], 'saved', 2000);
    renameBoard(s, id, '  My board ');
    expect(readBoardIndex(s)[id]).toEqual({
      name: 'My board',
      title: 'Second',
      openedAt: 1000,
      savedAt: 2000,
    });
    renameBoard(s, id, '');
    expect(readBoardIndex(s)[id]?.name).toBeUndefined();
  });

  it('drops malformed entries and survives corrupt or failing storage', () => {
    const s = memory();
    s.values.set(
      BOARD_INDEX_KEY,
      JSON.stringify({
        [id]: { title: 'ok', openedAt: 1 },
        bad: { title: 'x', openedAt: 1 },
        [other]: { title: 3, openedAt: 1 },
      }),
    );
    expect(Object.keys(readBoardIndex(s))).toEqual([id]);
    s.values.set(BOARD_INDEX_KEY, '{nope');
    expect(readBoardIndex(s)).toEqual({});
    s.setItem = () => {
      throw new Error('quota');
    };
    expect(() => touchBoard(s, id, [], 'opened')).not.toThrow();
  });
});

describe('listing, search and day sections', () => {
  const item = (name: string, usedAt: number): BoardListItem => ({
    id: name.padEnd(12, 'x').slice(0, 12),
    name,
    usedAt,
    editable: true,
  });

  it('lists indexed boards and token-only boards, most recent first', () => {
    const items = listBoards(
      { [id]: { title: 'Indexed', openedAt: 5, savedAt: 9 } },
      { [other]: token },
    );
    expect(items).toEqual([
      { id, name: 'Indexed', usedAt: 9, editable: false },
      { id: other, name: '', usedAt: 0, editable: true },
    ]);
  });

  it('searches every word, ignoring case and accents', () => {
    const items = [item('Città roadmap', 1), item('Login flow', 2)];
    expect(searchBoards(items, 'citta ROAD').map((i) => i.name)).toEqual([
      'Città roadmap',
    ]);
    expect(searchBoards(items, '  ')).toHaveLength(2);
  });

  it('groups by today, yesterday, weekday, month, then never used here', () => {
    const now = new Date(2026, 10, 6, 15, 0);
    const at = (days: number) => new Date(2026, 10, 6 - days, 10, 0).getTime();
    const sections = groupBoards(
      [
        item('a', at(0)),
        item('b', at(1)),
        item('c', at(3)),
        item('d', at(3)),
        item('e', at(20)),
        item('f', 0),
      ],
      now,
    );
    expect(sections.map((s) => [s.key.kind, s.items.length])).toEqual([
      ['today', 1],
      ['yesterday', 1],
      ['weekday', 2],
      ['month', 1],
      ['older', 1],
    ]);
  });
});

describe('CloudClient and the board index', () => {
  function setup() {
    const storage = memory();
    const fetcher = vi.fn<typeof fetch>();
    return { storage, fetcher, client: new CloudClient(storage, fetcher) };
  }
  const board = (version = 1) =>
    Response.json({ id, version, elements: [text('Plan')] });

  it('indexes a board when it is opened and saved', async () => {
    const ctx = setup();
    ctx.fetcher.mockResolvedValueOnce(board());
    await ctx.client.open(new URL(`https://markasso.it/b/${id}#k=${token}`));
    expect(readBoardIndex(ctx.storage)[id]?.title).toBe('Plan');
    ctx.fetcher.mockResolvedValueOnce(Response.json({ version: 2 }));
    ctx.client.schedule({
      elements: [text('Plan v2')],
      viewport: { offsetX: 0, offsetY: 0, zoom: 1 },
    });
    await ctx.client.flush();
    const entry = readBoardIndex(ctx.storage)[id];
    expect(entry?.title).toBe('Plan v2');
    expect(entry?.savedAt).toBeTypeOf('number');
  });

  it('forgets a board locally without any request', () => {
    const ctx = setup();
    ctx.storage.values.set(TOKEN_KEY, JSON.stringify({ [id]: token }));
    touchBoard(ctx.storage, id, [], 'opened');
    ctx.client.forget(id);
    expect(ctx.client.knownTokens()).toEqual({});
    expect(readBoardIndex(ctx.storage)).toEqual({});
    expect(ctx.fetcher).not.toHaveBeenCalled();
  });

  it('deletes with the stored token, treating 204 and 404 as done', async () => {
    const ctx = setup();
    ctx.storage.values.set(
      TOKEN_KEY,
      JSON.stringify({ [id]: token, [other]: token }),
    );
    ctx.fetcher.mockResolvedValueOnce(new Response(null, { status: 204 }));
    await ctx.client.deleteBoard(id);
    const [url, init] = ctx.fetcher.mock.calls[0]!;
    expect(url).toBe(`/api/board/${id}`);
    expect(init?.method).toBe('DELETE');
    expect((init?.headers as Record<string, string>).Authorization).toBe(
      `Bearer ${token}`,
    );
    ctx.fetcher.mockResolvedValueOnce(Response.json({}, { status: 404 }));
    await ctx.client.deleteBoard(other);
    expect(ctx.client.knownTokens()).toEqual({});
  });

  it('keeps the board when the delete fails or there is no token', async () => {
    const ctx = setup();
    ctx.storage.values.set(TOKEN_KEY, JSON.stringify({ [id]: token }));
    ctx.fetcher.mockResolvedValueOnce(Response.json({}, { status: 401 }));
    await expect(ctx.client.deleteBoard(id)).rejects.toEqual(
      new CloudError(401),
    );
    expect(ctx.client.knownTokens()).toEqual({ [id]: token });
    await expect(ctx.client.deleteBoard(other)).rejects.toBeInstanceOf(
      CloudError,
    );
  });
});
