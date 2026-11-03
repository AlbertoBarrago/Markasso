import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createScene } from '../src/core/scene';
import type { Element } from '../src/elements/element';
import { History } from '../src/engine/history';
import {
  boardLinks,
  CloudClient,
  CloudError,
  LICENSE_KEY,
  parseBoardUrl,
  TOKEN_KEY,
} from '../src/io/cloud';
import { initCloudBoards } from '../src/ui/cloud_boards';

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

describe('cloud board conflict UI', () => {
  it('Take theirs preserves app state and viewport as one undoable step', async () => {
    class Node extends EventTarget {
      textContent = '';
      children: Node[] = [];
      append(...nodes: Node[]) {
        this.children.push(...nodes);
      }
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
    const modal = body.children[1]!;
    modal.children[2]!.dispatchEvent(new Event('click'));
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
