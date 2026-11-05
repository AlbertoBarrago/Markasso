import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createScene } from '../src/core/scene';
import type { Element } from '../src/elements/element';
import { History } from '../src/engine/history';
import {
  boardLinks,
  CloudClient,
  CloudError,
  cloudPageUrl,
  LICENSE_KEY,
  parseBoardUrl,
  TOKEN_KEY,
} from '../src/io/cloud';
import {
  cloudAction,
  cloudActionAvailable,
  cloudSeparators,
  initCloudBoards,
} from '../src/ui/cloud_boards';

vi.mock('../src/config/features', () => ({ CLOUD_ENABLED: true }));

vi.mock('../src/i18n', () => ({ t: (key: string) => key }));

const id = 'Abc123def456';
const token = 'x'.repeat(43);
const element: Element = {
  id: 'rect',
  type: 'rectangle',
  x: 0,
  y: 0,
  width: 20,
  height: 10,
  strokeColor: '#000000',
  fillColor: 'transparent',
  strokeWidth: 1,
  opacity: 1,
  roughness: 0,
};
const scene = { ...createScene(), elements: [element] };
const newer = { ...scene, elements: [{ ...element, x: 30 }] };
function setup() {
  const values = new Map<string, string>();
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
    removeItem: (key: string) => {
      values.delete(key);
    },
  };
  const fetcher = vi.fn<typeof fetch>();
  const client = new CloudClient(storage, fetcher);
  return { values, storage, fetcher, client };
}
function response(data: unknown, status = 200): Response {
  return Response.json(data, { status });
}
function board(version = 1) {
  return {
    id,
    version,
    updatedAt: '2026-11-03T10:00:00Z',
    elements: [element],
    viewport: scene.viewport,
  };
}
async function editable(ctx: ReturnType<typeof setup>) {
  ctx.fetcher.mockResolvedValueOnce(response(board()));
  await ctx.client.open(new URL(`https://markasso.it/b/${id}#k=${token}`));
}
async function conflict(ctx: ReturnType<typeof setup>) {
  await editable(ctx);
  ctx.fetcher.mockResolvedValueOnce(response({ version: 4 }, 409));
  ctx.client.schedule(scene);
  await ctx.client.flush();
  expect(ctx.client.state).toBe('conflict');
}
beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('cloud links and storage', () => {
  it('keeps the token only in edit and Mac fragments', () => {
    const links = boardLinks('https://markasso.it', id, token);
    expect(links.read).toBe(`https://markasso.it/b/${id}`);
    expect(links.edit).toBe(`${links.read}#k=${token}`);
    expect(links.mac).toBe(`markasso://board/${id}#k=${token}`);
    for (const link of Object.values(links)) {
      const url = new URL(link);
      expect(url.search).toBe('');
      expect(url.pathname).not.toContain(token);
    }
    expect(boardLinks('https://markasso.it', id).mac).toBe(
      `markasso://board/${id}`,
    );
  });
  it.each([
    'https://preview.markasso.workers.dev',
    'http://localhost:8787',
    'https://markasso.it:8443',
  ])('preserves the origin in Mac links from %s', (origin) => {
    for (const writeToken of [token, undefined]) {
      const links = boardLinks(origin, id, writeToken);
      expect(links.mac).toBe(
        `markasso://open?url=${encodeURIComponent(links.edit)}`,
      );
      const mac = new URL(links.mac);
      expect(mac.hash).toBe('');
      expect(mac.searchParams.get('url')).toBe(links.edit);
      expect(links.read).toBe(`${origin}/b/${id}`);
      expect(links.edit).toBe(
        links.read + (writeToken ? `#k=${writeToken}` : ''),
      );
    }
  });
  it('parses only valid board routes and tokens', () => {
    expect(
      parseBoardUrl(new URL(`https://markasso.it/b/${id}#k=${token}`)),
    ).toEqual({ id, token });
    expect(
      parseBoardUrl(new URL(`https://markasso.it/b/${id}?k=${token}`)),
    ).toEqual({ id });
    expect(parseBoardUrl(new URL(`https://markasso.it/b/${id}#k=bad`))).toEqual(
      { id },
    );
    expect(
      parseBoardUrl(new URL('https://markasso.it/#s=abcd1234')),
    ).toBeNull();
    expect(
      parseBoardUrl(new URL(`https://markasso.it/b/${id}/extra`)),
    ).toBeNull();
  });
  it('opens anonymously as read-only, without a bearer or licence header', async () => {
    const ctx = setup();
    ctx.fetcher.mockResolvedValueOnce(response(board()));
    expect(
      await ctx.client.open(new URL(`https://markasso.it/b/${id}`)),
    ).toEqual({ elements: [element], viewport: scene.viewport });
    expect(ctx.client.editable).toBe(false);
    expect(ctx.fetcher.mock.calls[0]?.[1]).toMatchObject({
      referrerPolicy: 'no-referrer',
      cache: 'no-store',
    });
    expect(ctx.fetcher.mock.calls[0]?.[1]?.headers).toBeUndefined();
    ctx.client.schedule(newer);
    await vi.advanceTimersByTimeAsync(3000);
    expect(ctx.fetcher).toHaveBeenCalledTimes(1);
  });
  it('stores a fragment token and reuses it on a later read link', async () => {
    const ctx = setup();
    await editable(ctx);
    expect(JSON.parse(ctx.values.get(TOKEN_KEY)!)).toEqual({ [id]: token });
    const reopened = new CloudClient(ctx.storage, ctx.fetcher);
    ctx.fetcher.mockResolvedValueOnce(response(board(5)));
    await reopened.open(new URL(`https://markasso.it/b/${id}`));
    expect(reopened.editable).toBe(true);
    expect(reopened.version).toBe(5);
  });
  it('ignores corrupt or invalid token storage', async () => {
    for (const value of [
      '{',
      'null',
      '[]',
      JSON.stringify({ [id]: 'invalid' }),
    ]) {
      const ctx = setup();
      ctx.values.set(TOKEN_KEY, value);
      ctx.fetcher.mockResolvedValueOnce(response(board()));
      await ctx.client.open(new URL(`https://markasso.it/b/${id}`));
      expect(ctx.client.editable).toBe(false);
    }
  });
  it('can open an edit link when token persistence is unavailable', async () => {
    const ctx = setup();
    ctx.storage.setItem = () => {
      throw new Error('unavailable');
    };
    await editable(ctx);
    expect(ctx.client.editable).toBe(true);
  });
});

describe('cloud writes', () => {
  it('keeps the saved indicator unchanged when there is nothing to retry', async () => {
    const ctx = setup();
    await editable(ctx);
    await ctx.client.retry();
    expect(ctx.client.state).toBe('saved');
    expect(ctx.fetcher).toHaveBeenCalledTimes(1);
  });
  it('creates a board with a scene and stores the write token', async () => {
    const ctx = setup();
    ctx.fetcher.mockResolvedValueOnce(
      response({ id, writeToken: token, version: 1 }, 201),
    );
    await ctx.client.create(scene);
    expect(ctx.fetcher.mock.calls[0]?.[0]).toBe('/api/board');
    expect(ctx.fetcher.mock.calls[0]?.[1]).toMatchObject({
      method: 'POST',
      body: JSON.stringify({
        elements: scene.elements,
        viewport: scene.viewport,
      }),
    });
    expect(ctx.client.id).toBe(id);
    expect(ctx.client.token).toBe(token);
    expect(ctx.client.version).toBe(1);
    expect(ctx.client.state).toBe('saved');
  });
  it('debounces the latest scene and uses bearer and quoted If-Match', async () => {
    const ctx = setup();
    await editable(ctx);
    ctx.fetcher.mockResolvedValueOnce(response({ version: 2 }));
    ctx.client.schedule(scene);
    await vi.advanceTimersByTimeAsync(1500);
    ctx.client.schedule(newer);
    await vi.advanceTimersByTimeAsync(1999);
    expect(ctx.fetcher).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    const [path, init] = ctx.fetcher.mock.calls[1]!;
    expect(path).toBe(`/api/board/${id}`);
    expect(init?.method).toBe('PUT');
    expect(init?.headers).toMatchObject({
      Authorization: `Bearer ${token}`,
      'If-Match': '"1"',
    });
    expect(JSON.parse(init?.body as string).elements).toEqual(newer.elements);
    expect(ctx.client.version).toBe(2);
    expect(ctx.client.state).toBe('saved');
  });
  it('flushes pending changes on pagehide with keepalive', async () => {
    const ctx = setup();
    await editable(ctx);
    ctx.fetcher.mockResolvedValueOnce(response({ version: 2 }));
    ctx.client.schedule(scene);
    await ctx.client.flush(true);
    expect(ctx.fetcher.mock.calls[1]?.[1]?.keepalive).toBe(true);
  });
  it('serializes writes and retains edits made during an in-flight save', async () => {
    const ctx = setup();
    await editable(ctx);
    let finish!: (value: Response) => void;
    ctx.fetcher.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    ctx.client.schedule(scene);
    const first = ctx.client.flush();
    ctx.client.schedule(newer);
    await ctx.client.flush();
    expect(ctx.fetcher).toHaveBeenCalledTimes(2);
    finish(response({ version: 2 }));
    await first;
    ctx.fetcher.mockResolvedValueOnce(response({ version: 3 }));
    await vi.advanceTimersByTimeAsync(2000);
    expect(ctx.fetcher.mock.calls[2]?.[1]?.headers).toMatchObject({
      'If-Match': '"2"',
    });
    expect(ctx.client.state).toBe('saved');
  });
  it('detaches without later background writes', async () => {
    const ctx = setup();
    await editable(ctx);
    ctx.client.schedule(scene);
    ctx.client.detach();
    await vi.advanceTimersByTimeAsync(3000);
    expect(ctx.fetcher).toHaveBeenCalledTimes(1);
    expect(ctx.client.id).toBeNull();
  });
});

describe('conflicts', () => {
  it('stops autosaving until the user chooses', async () => {
    const ctx = setup();
    await conflict(ctx);
    ctx.client.schedule(newer);
    await vi.advanceTimersByTimeAsync(100000);
    expect(ctx.fetcher).toHaveBeenCalledTimes(2);
  });
  it('Keep mine writes the latest local scene with the server version', async () => {
    const ctx = setup();
    await conflict(ctx);
    ctx.client.schedule(newer);
    ctx.fetcher.mockResolvedValueOnce(response({ version: 5 }));
    await ctx.client.keepMine();
    expect(ctx.fetcher.mock.calls[2]?.[1]?.headers).toMatchObject({
      'If-Match': '"4"',
    });
    expect(
      JSON.parse(ctx.fetcher.mock.calls[2]?.[1]?.body as string).elements,
    ).toEqual(newer.elements);
    expect(ctx.client.state).toBe('saved');
  });
  it('handles another conflict during Keep mine without merging', async () => {
    const ctx = setup();
    await conflict(ctx);
    ctx.fetcher.mockResolvedValueOnce(response({ version: 6 }, 409));
    await ctx.client.keepMine();
    expect(ctx.client.state).toBe('conflict');
    expect(ctx.client.version).toBe(6);
  });
  it('Take theirs loads the newest server snapshot and discards pending saves', async () => {
    const ctx = setup();
    await conflict(ctx);
    ctx.fetcher.mockResolvedValueOnce(
      response({ ...board(5), elements: newer.elements }),
    );
    expect((await ctx.client.takeTheirs()).elements).toEqual(newer.elements);
    await ctx.client.flush();
    expect(ctx.fetcher).toHaveBeenCalledTimes(3);
    expect(ctx.client.state).toBe('saved');
  });
  it('Save a copy creates a separate cloud board from the local scene', async () => {
    const ctx = setup();
    await conflict(ctx);
    const download = vi.fn();
    ctx.fetcher.mockResolvedValueOnce(
      response(
        { id: 'New123def456', writeToken: 'y'.repeat(43), version: 1 },
        201,
      ),
    );
    await ctx.client.saveCopy(newer, download);
    expect(ctx.fetcher.mock.calls[2]?.[0]).toBe('/api/board');
    expect(ctx.client.id).toBe('New123def456');
    expect(download).not.toHaveBeenCalled();
  });
  it('Save a copy downloads on failure and leaves the original conflict paused', async () => {
    const ctx = setup();
    await conflict(ctx);
    const download = vi.fn();
    ctx.fetcher.mockRejectedValueOnce(new TypeError('offline'));
    await ctx.client.saveCopy(newer, download);
    expect(download).toHaveBeenCalledOnce();
    expect(ctx.client.id).toBe(id);
    expect(ctx.client.state).toBe('conflict');
    await vi.advanceTimersByTimeAsync(100000);
    expect(ctx.fetcher).toHaveBeenCalledTimes(3);
  });
});

describe('remote check', () => {
  const notModified = () => new Response(null, { status: 304 });
  it('sends If-None-Match silently and reports 304 as unchanged', async () => {
    const ctx = setup();
    await editable(ctx);
    const activity = vi.fn();
    ctx.client.onActivity = activity;
    ctx.fetcher.mockResolvedValueOnce(notModified());
    const before = ctx.client.lastSyncedAt;
    vi.advanceTimersByTime(1000);
    expect(await ctx.client.check()).toBe('unchanged');
    expect(activity).not.toHaveBeenCalled();
    expect(ctx.fetcher.mock.calls[1]?.[0]).toBe(`/api/board/${id}`);
    expect(ctx.fetcher.mock.calls[1]?.[1]?.headers).toEqual({
      'If-None-Match': '"1"',
    });
    expect(ctx.client.state).toBe('saved');
    expect(ctx.client.lastSyncedAt).toBeGreaterThan(before!);
  });
  it('compares versions when the server answers 200', async () => {
    const ctx = setup();
    await editable(ctx);
    ctx.fetcher.mockResolvedValueOnce(response(board(1)));
    expect(await ctx.client.check()).toBe('unchanged');
    ctx.fetcher.mockResolvedValueOnce(
      response({ ...board(3), elements: newer.elements }),
    );
    expect(await ctx.client.check()).toEqual({
      scene: { elements: newer.elements, viewport: scene.viewport },
      version: 3,
    });
    // The caller raises the version once the board is applied.
    expect(ctx.client.version).toBe(1);
    expect(ctx.client.state).toBe('saved');
  });
  it('checks read-only boards too', async () => {
    const ctx = setup();
    ctx.fetcher.mockResolvedValueOnce(response(board()));
    await ctx.client.open(new URL(`https://markasso.it/b/${id}`));
    ctx.fetcher.mockResolvedValueOnce(response(board(2)));
    expect(await ctx.client.check()).toMatchObject({ version: 2 });
  });
  it('shows a deleted board as missing', async () => {
    const ctx = setup();
    await editable(ctx);
    ctx.fetcher.mockResolvedValueOnce(response({}, 404));
    expect(await ctx.client.check()).toBe('failed');
    expect(ctx.client.state).toBe('error');
    expect(ctx.client.error).toBe(404);
  });
  it('goes offline on a network error and back to saved on the next check', async () => {
    const ctx = setup();
    await editable(ctx);
    const activity = vi.fn();
    ctx.client.onActivity = activity;
    ctx.fetcher.mockRejectedValueOnce(new TypeError('network'));
    expect(await ctx.client.check()).toBe('failed');
    expect(ctx.client.state).toBe('offline');
    expect(ctx.client.error).toBe(0);
    await vi.advanceTimersByTimeAsync(60000);
    expect(ctx.fetcher).toHaveBeenCalledTimes(2);
    ctx.fetcher.mockResolvedValueOnce(notModified());
    expect(await ctx.client.check()).toBe('unchanged');
    expect(ctx.client.state).toBe('saved');
    expect(ctx.client.error).toBe(0);
    expect(activity).not.toHaveBeenCalled();
  });
  it.each([429, 503])('treats %s as offline', async (status) => {
    const ctx = setup();
    await editable(ctx);
    ctx.fetcher.mockResolvedValueOnce(response({}, status));
    expect(await ctx.client.check()).toBe('failed');
    expect(ctx.client.state).toBe('offline');
  });
  it('treats an invalid board as offline, not as a paused error', async () => {
    const ctx = setup();
    await editable(ctx);
    ctx.fetcher.mockResolvedValueOnce(response({ elements: 'x', version: 2 }));
    expect(await ctx.client.check()).toBe('failed');
    expect(ctx.client.state).toBe('offline');
  });
  it('is a no-op without a board, with unsaved changes or in conflict', async () => {
    const ctx = setup();
    expect(await ctx.client.check()).toBe('skipped');
    await editable(ctx);
    ctx.client.schedule(newer);
    expect(await ctx.client.check()).toBe('skipped');
    const other = setup();
    await conflict(other);
    expect(await other.client.check()).toBe('skipped');
    expect(ctx.fetcher).toHaveBeenCalledTimes(1);
    expect(other.fetcher).toHaveBeenCalledTimes(2);
  });
  it('is a no-op while a save, a read or another check is in flight', async () => {
    const ctx = setup();
    await editable(ctx);
    let finish!: (value: Response) => void;
    const hold = () =>
      new Promise<Response>((resolve) => {
        finish = resolve;
      });
    ctx.fetcher.mockImplementationOnce(hold);
    ctx.client.schedule(newer);
    const saving = ctx.client.flush();
    expect(ctx.client.writing).toBe(true);
    expect(await ctx.client.check()).toBe('skipped');
    finish(response({ version: 2 }));
    await saving;
    ctx.fetcher.mockImplementationOnce(hold);
    const reading = ctx.client.read();
    expect(await ctx.client.check()).toBe('skipped');
    finish(response(board(2)));
    await reading;
    ctx.fetcher.mockImplementationOnce(hold);
    const checking = ctx.client.check();
    expect(await ctx.client.check()).toBe('skipped');
    finish(notModified());
    expect(await checking).toBe('unchanged');
    expect(ctx.fetcher).toHaveBeenCalledTimes(4);
  });
  it('ignores a check answered after the board was detached', async () => {
    const ctx = setup();
    await editable(ctx);
    let finish!: (value: Response) => void;
    ctx.fetcher.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const checking = ctx.client.check();
    ctx.client.detach();
    finish(response({}, 404));
    expect(await checking).toBe('skipped');
    expect(ctx.client.state).toBe('saved');
  });
  it('a remote conflict records the server version so Keep mine overwrites it', async () => {
    const ctx = setup();
    await editable(ctx);
    ctx.client.schedule(newer);
    ctx.client.markConflict(4);
    expect(ctx.client.state).toBe('conflict');
    await vi.advanceTimersByTimeAsync(5000);
    expect(ctx.fetcher).toHaveBeenCalledTimes(1);
    ctx.fetcher.mockResolvedValueOnce(response({ version: 5 }));
    await ctx.client.keepMine();
    expect(ctx.fetcher.mock.calls[1]?.[1]?.headers).toMatchObject({
      'If-Match': '"4"',
    });
    expect(ctx.client.state).toBe('saved');
  });
});

describe('remote check UI', () => {
  class Node extends EventTarget {
    textContent = '';
    children: Node[] = [];
    append(...nodes: Node[]) {
      this.children.push(...nodes);
    }
    dataset: Record<string, string> = {};
    classList = { add() {}, toggle() {} };
    setAttribute() {}
    showModal() {}
    close() {}
    remove() {}
  }
  async function openBoard() {
    const body = new Node();
    const doc = {
      body,
      activeElement: null as { tagName: string } | null,
      visibilityState: 'visible',
      documentElement: { getAttribute: () => null },
      createElement: () => new Node(),
      querySelector: () => null,
      getElementById: () => null,
      dispatchEvent: vi.fn(),
    };
    vi.stubGlobal('document', doc);
    vi.stubGlobal('HTMLElement', Node);
    const win = new EventTarget();
    vi.stubGlobal(
      'window',
      Object.assign(win, { matchMedia: () => ({ matches: false }) }),
    );
    vi.stubGlobal(
      'location',
      new URL(`https://markasso.it/b/${id}#k=${token}`),
    );
    const ctx = setup();
    vi.stubGlobal('localStorage', ctx.storage);
    vi.stubGlobal('fetch', ctx.fetcher);
    ctx.fetcher.mockResolvedValueOnce(response(board()));
    const history = new History(scene);
    await initCloudBoards(history);
    const find = (node: Node, choice: string): Node | undefined =>
      node.dataset.choice === choice
        ? node
        : node.children.map((child) => find(child, choice)).find(Boolean);
    return { ctx, history, doc, win, find: (c: string) => find(body, c) };
  }
  const pointer = (type: string) =>
    Object.assign(new Event(type), { pointerId: 1 });
  it('applies a remote board as one undoable step without saving it back', async () => {
    const { ctx, history } = await openBoard();
    const viewport = history.present.viewport;
    ctx.fetcher.mockResolvedValueOnce(
      response({ ...board(2), elements: newer.elements }),
    );
    await vi.advanceTimersByTimeAsync(30000);
    expect(ctx.fetcher).toHaveBeenCalledTimes(2);
    expect(history.present.elements).toEqual(newer.elements);
    expect(history.present.viewport).toBe(viewport);
    ctx.fetcher.mockResolvedValue(new Response(null, { status: 304 }));
    await vi.advanceTimersByTimeAsync(5000);
    expect(ctx.fetcher).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(25000);
    expect(ctx.fetcher).toHaveBeenCalledTimes(3);
    expect(ctx.fetcher.mock.calls[2]?.[1]?.headers).toEqual({
      'If-None-Match': '"2"',
    });
    history.undo();
    expect(history.present.elements).toEqual(scene.elements);
  });
  it('does not poll while hidden and checks on return, throttled', async () => {
    const { ctx, doc, win } = await openBoard();
    ctx.fetcher.mockResolvedValue(new Response(null, { status: 304 }));
    doc.visibilityState = 'hidden';
    win.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(120000);
    expect(ctx.fetcher).toHaveBeenCalledTimes(1);
    doc.visibilityState = 'visible';
    win.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(0);
    expect(ctx.fetcher).toHaveBeenCalledTimes(2);
    doc.visibilityState = 'hidden';
    win.dispatchEvent(new Event('visibilitychange'));
    doc.visibilityState = 'visible';
    win.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(0);
    expect(ctx.fetcher).toHaveBeenCalledTimes(2);
  });
  it('defers applying while a pointer is pressed or a text is edited', async () => {
    const { ctx, history, doc, win } = await openBoard();
    win.dispatchEvent(pointer('pointerdown'));
    ctx.fetcher.mockResolvedValueOnce(
      response({ ...board(2), elements: newer.elements }),
    );
    await vi.advanceTimersByTimeAsync(30000);
    expect(history.present.elements).toEqual(scene.elements);
    doc.activeElement = { tagName: 'TEXTAREA' };
    win.dispatchEvent(pointer('pointerup'));
    await vi.advanceTimersByTimeAsync(1000);
    expect(history.present.elements).toEqual(scene.elements);
    doc.activeElement = null;
    await vi.advanceTimersByTimeAsync(300);
    expect(history.present.elements).toEqual(newer.elements);
  });
  it('turns a local edit made during the check into a conflict', async () => {
    const { ctx, history, find } = await openBoard();
    let finish!: (value: Response) => void;
    ctx.fetcher.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    await vi.advanceTimersByTimeAsync(30000);
    history.dispatch({ type: 'DELETE_ELEMENTS', ids: ['rect'] });
    finish(response({ ...board(4), elements: newer.elements }));
    await vi.advanceTimersByTimeAsync(0);
    expect(history.present.elements).toEqual([]);
    expect(find('cloudKeepMine')).toBeDefined();
    // Autosave paused: the debounced save never ran.
    await vi.advanceTimersByTimeAsync(5000);
    expect(ctx.fetcher).toHaveBeenCalledTimes(2);
    ctx.fetcher.mockResolvedValueOnce(response({ version: 5 }));
    find('cloudKeepMine')!.dispatchEvent(new Event('click'));
    await vi.advanceTimersByTimeAsync(0);
    expect(ctx.fetcher.mock.calls[2]?.[1]?.method).toBe('PUT');
    expect(ctx.fetcher.mock.calls[2]?.[1]?.headers).toMatchObject({
      'If-Match': '"4"',
    });
  });
});

describe('cloud board conflict UI', () => {
  it('Take theirs preserves app state and viewport as one undoable step', async () => {
    class Node extends EventTarget {
      textContent = '';
      children: Node[] = [];
      append(...nodes: Node[]) {
        this.children.push(...nodes);
      }
      dataset: Record<string, string> = {};
      classList = { add() {}, toggle() {} };
      setAttribute() {}
      showModal() {}
      close() {}
      remove() {}
    }
    const body = new Node();
    vi.stubGlobal('document', {
      body,
      activeElement: null,
      documentElement: { getAttribute: () => null },
      createElement: () => new Node(),
      querySelector: () => null,
      getElementById: () => null,
      dispatchEvent: vi.fn(),
    });
    vi.stubGlobal('HTMLElement', Node);
    vi.stubGlobal('window', {
      addEventListener: vi.fn(),
      matchMedia: () => ({ matches: false }),
    });
    vi.stubGlobal(
      'location',
      new URL(`https://markasso.it/b/${id}#k=${token}`),
    );
    const ctx = setup();
    vi.stubGlobal('localStorage', ctx.storage);
    vi.stubGlobal('fetch', ctx.fetcher);
    ctx.fetcher.mockResolvedValueOnce(response(board()));
    const appState = {
      ...scene.appState,
      activeTool: 'ellipse' as const,
      gridVisible: false,
      gridType: 'line' as const,
      toolLocked: true,
      strokeColor: '#123456',
    };
    const history = new History({ ...scene, appState });
    await initCloudBoards(history);
    expect(history.present.appState).toBe(appState);
    expect(history.canUndo()).toBe(false);
    history.dispatch({ type: 'PAN_VIEWPORT', dx: 120, dy: 80 });
    history.dispatch({ type: 'DELETE_ELEMENTS', ids: ['rect'] });
    const viewport = history.present.viewport;
    ctx.fetcher.mockResolvedValueOnce(response({ version: 4 }, 409));
    await vi.advanceTimersByTimeAsync(2000);
    ctx.fetcher.mockResolvedValueOnce(
      response({ ...board(5), elements: newer.elements }),
    );
    const find = (node: Node, choice: string): Node | undefined =>
      node.dataset.choice === choice
        ? node
        : node.children.map((child) => find(child, choice)).find(Boolean);
    find(body, 'cloudTakeTheirs')!.dispatchEvent(new Event('click'));
    await vi.advanceTimersByTimeAsync(0);
    expect(history.present.elements).toEqual(newer.elements);
    expect(history.present.appState).toBe(appState);
    expect(history.present.viewport).toBe(viewport);
    await vi.advanceTimersByTimeAsync(2000);
    expect(ctx.fetcher).toHaveBeenCalledTimes(3);
    history.undo();
    expect(history.present.elements).toEqual([]);
    expect(history.present.appState).toEqual(appState);
    expect(history.present.viewport).toBe(viewport);
    history.undo();
    expect(history.present.elements).toEqual(scene.elements);
  });
});

describe('licence and failures', () => {
  it('402 on create can be retried with a stored licence; removal clears it', async () => {
    const ctx = setup();
    ctx.fetcher.mockResolvedValueOnce(response({}, 402));
    await expect(ctx.client.create(scene)).rejects.toMatchObject({
      status: 402,
    });
    expect(ctx.client.error).toBe(402);
    ctx.client.setLicense('  secret-license  ');
    expect(ctx.values.get(LICENSE_KEY)).toBe('secret-license');
    ctx.fetcher.mockResolvedValueOnce(
      response({ id, writeToken: token, version: 1 }, 201),
    );
    await ctx.client.create(scene);
    expect(ctx.fetcher.mock.calls[1]?.[1]?.headers).toMatchObject({
      'X-Markasso-License': 'secret-license',
    });
    ctx.client.setLicense('');
    expect(ctx.client.license).toBe('');
    expect(ctx.values.has(LICENSE_KEY)).toBe(false);
  });
  it('402 on PUT retains pending edits and resumes after licence entry', async () => {
    const ctx = setup();
    await editable(ctx);
    ctx.fetcher.mockResolvedValueOnce(response({}, 402));
    ctx.client.schedule(newer);
    await ctx.client.flush();
    expect(ctx.client.state).toBe('error');
    ctx.client.setLicense('key');
    ctx.fetcher.mockResolvedValueOnce(response({ version: 2 }));
    await ctx.client.retry();
    expect(ctx.fetcher.mock.calls[2]?.[1]?.headers).toMatchObject({
      'X-Markasso-License': 'key',
      'If-Match': '"1"',
    });
    expect(ctx.client.state).toBe('saved');
  });
  it.each([
    404, 413, 429, 503, 401,
  ])('reports HTTP %s without treating it as saved', async (status) => {
    const ctx = setup();
    await editable(ctx);
    ctx.fetcher.mockResolvedValueOnce(response({}, status));
    ctx.client.schedule(scene);
    await ctx.client.flush();
    expect(ctx.client.error).toBe(status);
    expect(ctx.client.state).toBe(
      [429, 503].includes(status) ? 'offline' : 'error',
    );
    expect(ctx.client.version).toBe(1);
  });
  it('retries offline changes later with the original version', async () => {
    const ctx = setup();
    await editable(ctx);
    ctx.fetcher.mockRejectedValueOnce(new TypeError('offline'));
    ctx.client.schedule(scene);
    await ctx.client.flush();
    expect(ctx.client.state).toBe('offline');
    ctx.fetcher.mockResolvedValueOnce(response({ version: 2 }));
    await vi.advanceTimersByTimeAsync(10000);
    expect(ctx.client.state).toBe('saved');
  });
  it('waits a minute before retrying rate limits', async () => {
    const ctx = setup();
    await editable(ctx);
    ctx.fetcher.mockResolvedValueOnce(response({}, 429));
    ctx.client.schedule(scene);
    await ctx.client.flush();
    await vi.advanceTimersByTimeAsync(59999);
    expect(ctx.fetcher).toHaveBeenCalledTimes(2);
    ctx.fetcher.mockResolvedValueOnce(response({ version: 2 }));
    await vi.advanceTimersByTimeAsync(1);
    expect(ctx.client.state).toBe('saved');
  });
  it('reports a missing board on open', async () => {
    const ctx = setup();
    ctx.fetcher.mockResolvedValueOnce(response({}, 404));
    await expect(
      ctx.client.open(new URL(`https://markasso.it/b/${id}`)),
    ).rejects.toBeInstanceOf(CloudError);
  });
  it('validates scenes and viewport received from the server', async () => {
    for (const data of [
      { ...board(), elements: 'bad' },
      { ...board(), viewport: { zoom: 'bad' } },
      { ...board(), version: 'bad' },
    ]) {
      const ctx = setup();
      ctx.fetcher.mockResolvedValueOnce(response(data));
      await expect(
        ctx.client.open(new URL(`https://markasso.it/b/${id}`)),
      ).rejects.toMatchObject({ status: 503 });
    }
  });
});

describe('read-only history boundary', () => {
  it('allows navigation but blocks edits, import, remote changes, undo and redo', () => {
    const history = new History(scene);
    history.dispatch({ type: 'DELETE_ELEMENTS', ids: ['rect'] });
    history.undo();
    history.readOnly = true;
    history.dispatch({ type: 'DELETE_ELEMENTS', ids: ['rect'] });
    history.dispatch({
      type: 'LOAD_SCENE',
      elements: [],
      viewport: scene.viewport,
    });
    history.applyRemote({ type: 'DELETE_ELEMENTS', ids: ['rect'] });
    history.resetForLiveReplay([]);
    history.undo();
    history.redo();
    expect(history.present.elements).toEqual(scene.elements);
    expect(history.canRedo()).toBe(false);
    expect(history.canUndo()).toBe(false);
    history.dispatch({ type: 'PAN_VIEWPORT', dx: 10, dy: 20 });
    expect(history.present.viewport.offsetX).toBe(10);
  });
  it('replacing a snapshot clears undo, and a duplicate can be edited locally', () => {
    const history = new History(scene);
    history.dispatch({ type: 'DELETE_ELEMENTS', ids: ['rect'] });
    const appState = {
      ...history.present.appState,
      activeTool: 'ellipse' as const,
      gridVisible: false,
      toolLocked: true,
      strokeColor: '#123456',
    };
    const fresh = new History({ ...history.present, appState });
    fresh.dispatch({ type: 'CREATE_ELEMENT', element });
    fresh.undo();
    const stateBeforeOpen = fresh.present.appState;
    fresh.readOnly = true;
    fresh.replaceScene(newer.elements, newer.viewport);
    expect(fresh.present.appState).toBe(stateBeforeOpen);
    expect(fresh.present.elements).toEqual(newer.elements);
    expect(fresh.canUndo()).toBe(false);
    fresh.readOnly = false;
    expect(fresh.canRedo()).toBe(false);
    history.replaceScene(newer.elements, newer.viewport);
    expect(history.canUndo()).toBe(false);
    history.readOnly = false;
    history.dispatch({ type: 'DELETE_ELEMENTS', ids: ['rect'] });
    expect(history.present.elements).toEqual([]);
  });
});

describe('cloud compatibility with existing links', () => {
  it('builds live invites from cloud pages without the edit token or board route', async () => {
    const { buildLiveRoomUrl } = await import('../src/io/realtime');
    vi.stubGlobal(
      'location',
      new URL(`https://markasso.it/b/${id}#k=${token}`),
    );
    expect(buildLiveRoomUrl('room123')).toBe(
      'https://markasso.it/?live=room123',
    );
    vi.stubGlobal('location', new URL('https://markasso.it/Markasso/'));
    expect(buildLiveRoomUrl('room123')).toBe(
      'https://markasso.it/Markasso/?live=room123',
    );
  });
  it('builds offline snapshot links outside the cloud route and still decodes them', async () => {
    // Native compression streams need real timers in Node.
    vi.useRealTimers();
    const { buildShareUrl, decodeScene } = await import('../src/io/share');
    vi.stubGlobal(
      'location',
      new URL(`https://markasso.it/b/${id}#k=${token}`),
    );
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('offline')));
    const link = new URL(await buildShareUrl([element]));
    expect(link.pathname).toBe('/');
    expect(link.hash).toMatch(/^#s=/);
    expect(link.href).not.toContain(token);
    expect(await decodeScene(link.hash)).toEqual([element]);
  });
  it('ignores a detached board response so it cannot change the new local scene state', async () => {
    const ctx = setup();
    await editable(ctx);
    let finish!: (value: Response) => void;
    ctx.fetcher.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    ctx.client.schedule(scene);
    const request = ctx.client.flush();
    ctx.client.detach();
    finish(response({ version: 9 }, 409));
    await request;
    expect(ctx.client.id).toBeNull();
    expect(ctx.client.version).toBe(0);
  });
});

describe('injected fetch', () => {
  it('calls fetch as a plain function, like the browser requires', async () => {
    const replies = [
      response({ id, writeToken: token, version: 1 }, 201),
      response(board()),
      response({ version: 2 }),
    ];
    // window.fetch throws "Illegal invocation" when called with any other
    // receiver; this stand-in reproduces that so the regression shows in Node.
    const strictFetch = function (this: unknown): Promise<Response> {
      if (this !== undefined && this !== globalThis)
        throw new TypeError('Illegal invocation');
      const reply = replies.shift();
      if (!reply) throw new Error('unexpected request');
      return Promise.resolve(reply);
    } as typeof fetch;
    const values = new Map<string, string>();
    const client = new CloudClient(
      {
        getItem: (key) => values.get(key) ?? null,
        setItem: (key, value) => void values.set(key, value),
        removeItem: (key) => void values.delete(key),
      },
      strictFetch,
    );
    await client.create(scene);
    expect(client.state).toBe('saved');
    await client.open(new URL(`https://markasso.it/b/${id}#k=${token}`));
    expect(client.version).toBe(1);
    client.schedule(newer);
    await client.flush();
    expect(client.state).toBe('saved');
    expect(client.version).toBe(2);
  });
});

describe('cloud dialog', () => {
  class Node extends EventTarget {
    textContent = '';
    className = '';
    autofocus = false;
    children: Node[] = [];
    dataset: Record<string, string> = {};
    classList = { add() {}, toggle() {} };
    focus = vi.fn();
    showModal = vi.fn();
    close = vi.fn();
    remove = vi.fn();
    append(...nodes: Node[]) {
      this.children.push(...nodes);
    }
    prepend(...nodes: Node[]) {
      this.children.unshift(...nodes);
    }
    setAttribute() {}
  }
  const all = (node: Node): Node[] => [
    node,
    ...node.children.flatMap((child) => all(child)),
  ];
  async function openSaveDialog() {
    const body = new Node();
    const previous = new Node();
    vi.stubGlobal('HTMLElement', Node);
    vi.stubGlobal('document', {
      body,
      activeElement: previous,
      documentElement: { getAttribute: () => null },
      createElement: () => new Node(),
      querySelector: () => null,
      getElementById: () => null,
      dispatchEvent: vi.fn(),
    });
    vi.stubGlobal('window', {
      addEventListener: vi.fn(),
      matchMedia: () => ({ matches: false }),
    });
    vi.stubGlobal('location', new URL('https://markasso.it/'));
    const ctx = setup();
    // Save to cloud is offered only once a licence is stored.
    ctx.values.set(LICENSE_KEY, 'MKC-TEST-KEY');
    vi.stubGlobal('localStorage', ctx.storage);
    vi.stubGlobal('fetch', ctx.fetcher);
    const history = new History(scene);
    await initCloudBoards(history);
    cloudAction(history, 'cloudSave');
    await vi.advanceTimersByTimeAsync(0);
    const modal = body.children.find((node) =>
      node.className.includes('app-dialog'),
    )!;
    return { modal, previous, ctx, nodes: all(modal) };
  }
  it('has a title, one primary action and focuses it', async () => {
    const { modal, nodes } = await openSaveDialog();
    expect(modal.showModal).toHaveBeenCalled();
    expect(nodes.find((n) => n.className === 'cd-title')?.textContent).toBe(
      'cloudSaveTitle',
    );
    const primary = nodes.filter((n) => n.className === 'cd-cta');
    expect(primary).toHaveLength(1);
    expect(primary[0]!.dataset.choice).toBe('cloudSave');
    expect(primary[0]!.autofocus).toBe(true);
    expect(nodes.some((n) => n.dataset.choice === 'dialogCancel')).toBe(true);
  });
  it('offers Save to cloud only with a stored licence', async () => {
    const body = new Node();
    vi.stubGlobal('HTMLElement', Node);
    vi.stubGlobal('document', {
      body,
      activeElement: null,
      documentElement: { getAttribute: () => null },
      createElement: () => new Node(),
      querySelector: () => null,
      getElementById: () => null,
      dispatchEvent: vi.fn(),
    });
    vi.stubGlobal('window', {
      addEventListener: vi.fn(),
      matchMedia: () => ({ matches: false }),
    });
    vi.stubGlobal('location', new URL('https://markasso.it/'));
    const ctx = setup();
    vi.stubGlobal('localStorage', ctx.storage);
    vi.stubGlobal('fetch', ctx.fetcher);
    const history = new History(scene);
    await initCloudBoards(history);
    expect(cloudActionAvailable(history, 'cloudSave')).toBe(false);
    expect(cloudActionAvailable(history, 'cloudLicense')).toBe(true);
    expect(cloudActionAvailable(history, 'cloudSubscription')).toBe(true);
    cloudAction(history, 'cloudSave');
    await vi.advanceTimersByTimeAsync(0);
    expect(
      body.children.some((node) => node.className.includes('app-dialog')),
    ).toBe(false);
    ctx.values.set(LICENSE_KEY, 'MKC-TEST-KEY');
    expect(cloudActionAvailable(history, 'cloudSave')).toBe(true);
  });
  it('offers Open in Mac app only on a Mac desktop', async () => {
    vi.stubGlobal('HTMLElement', Node);
    vi.stubGlobal('document', {
      body: new Node(),
      activeElement: null,
      documentElement: { getAttribute: () => null },
      createElement: () => new Node(),
      querySelector: () => null,
      getElementById: () => null,
      dispatchEvent: vi.fn(),
    });
    vi.stubGlobal('window', {
      addEventListener: vi.fn(),
      matchMedia: () => ({ matches: false }),
      history: { replaceState: vi.fn() },
    });
    vi.stubGlobal(
      'location',
      new URL(`https://markasso.it/b/${id}#k=${token}`),
    );
    const ctx = setup();
    ctx.fetcher.mockResolvedValueOnce(response(board()));
    vi.stubGlobal('localStorage', ctx.storage);
    vi.stubGlobal('fetch', ctx.fetcher);
    const history = new History(scene);
    await initCloudBoards(history);
    expect(cloudActionAvailable(history, 'cloudReadLink')).toBe(true);
    const mac = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)';
    vi.stubGlobal('navigator', { userAgent: mac, maxTouchPoints: 0 });
    expect(cloudActionAvailable(history, 'cloudMac')).toBe(true);
    // iPadOS reports a Mac user agent, but with a touch screen.
    vi.stubGlobal('navigator', { userAgent: mac, maxTouchPoints: 5 });
    expect(cloudActionAvailable(history, 'cloudMac')).toBe(false);
    vi.stubGlobal('navigator', {
      userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8)',
      maxTouchPoints: 5,
    });
    expect(cloudActionAvailable(history, 'cloudMac')).toBe(false);
  });
  it('treats Escape as cancel and returns focus', async () => {
    const { modal, previous, ctx } = await openSaveDialog();
    modal.dispatchEvent(new Event('cancel', { cancelable: true }));
    await vi.advanceTimersByTimeAsync(0);
    expect(modal.remove).toHaveBeenCalled();
    expect(previous.focus).toHaveBeenCalled();
    expect(ctx.fetcher).not.toHaveBeenCalled();
  });
});

describe('licence check', () => {
  it('asks the worker without storing the key', async () => {
    const ctx = setup();
    ctx.fetcher.mockResolvedValueOnce(response({ valid: true }));
    expect(await ctx.client.checkLicense('  MKC-KEY-1234  ')).toBe('valid');
    const [url, init] = ctx.fetcher.mock.calls[0]!;
    expect(url).toBe('/api/licence/check');
    expect(init?.method).toBe('POST');
    expect(init?.headers).toEqual({ 'X-Markasso-License': 'MKC-KEY-1234' });
    expect(ctx.values.has(LICENSE_KEY)).toBe(false);
  });

  it('calls fetch without the client as receiver', async () => {
    // The browser's fetch throws "Illegal invocation" when called as a method
    // of another object; this stand-in does the same.
    const ctx = setup();
    const strictFetch = vi.fn(function (this: unknown) {
      if (this !== undefined && this !== globalThis)
        throw new TypeError('Illegal invocation');
      return Promise.resolve(response({ valid: true }));
    }) as unknown as typeof fetch;
    const client = new CloudClient(ctx.storage, strictFetch);
    expect(await client.checkLicense('MKC-KEY-1234')).toBe('valid');
  });

  it('tells a rejected key from an unanswered check', async () => {
    const ctx = setup();
    ctx.fetcher.mockResolvedValueOnce(response({ valid: false }));
    expect(await ctx.client.checkLicense('MKC-KEY-1234')).toBe('invalid');
    ctx.fetcher.mockResolvedValueOnce(response({}, 503));
    expect(await ctx.client.checkLicense('MKC-KEY-1234')).toBe('unknown');
    ctx.fetcher.mockResolvedValueOnce(response({}, 429));
    expect(await ctx.client.checkLicense('MKC-KEY-1234')).toBe('unknown');
    ctx.fetcher.mockRejectedValueOnce(new TypeError('offline'));
    expect(await ctx.client.checkLicense('MKC-KEY-1234')).toBe('unknown');
  });

  it('links to the cloud page of the current deployment', () => {
    expect(cloudPageUrl('https://markasso-preview.example.dev')).toBe(
      'https://markasso-preview.example.dev/cloud',
    );
    expect(cloudPageUrl('https://markasso.it')).toBe(
      'https://markasso.it/cloud',
    );
  });
});

describe('cloud menu separators', () => {
  it.each([
    // [groups with an item] -> [separator before each group]
    [
      [true, true, true],
      [false, true, true],
    ],
    // Licence but no open board: one line between saving and the account.
    [
      [true, false, true],
      [false, false, true],
    ],
    // No licence: only the account group, no line at all.
    [
      [false, false, true],
      [false, false, false],
    ],
    // An open board without a licence: board group then account.
    [
      [false, true, true],
      [false, false, true],
    ],
  ])('%j -> %j', (shown, expected) => {
    expect(cloudSeparators(shown)).toEqual(expected);
  });
});
