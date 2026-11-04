import { describe, expect, it, vi } from 'vitest';
import worker from '../src/worker';
import { purgeBoards } from '../src/worker/boards';

function setup() {
  const rows = new Map<string, Record<string, unknown>>();
  const objects = new Map<string, { text: string; uploaded: Date }>();
  const env = {
    CLOUD_REQUIRES_LICENSE: 'false',
    BOARD_RATE_LIMITER: { limit: vi.fn(async () => ({ success: true })) },
    BOARDS_DB: {
      prepare: (sql: string) => ({
        bind: (...args: unknown[]) => ({
          first: async () =>
            structuredClone(
              sql.includes('scene_key =')
                ? ([...rows.values()].find((r) => r.scene_key === args[0]) ??
                    null)
                : (rows.get(String(args[0])) ?? null),
            ),
          all: async () => ({
            results: [...rows.values()].filter(
              (r) => String(r.last_written_at) < String(args[0]),
            ),
          }),
          run: async () => {
            let changes = 0;
            if (sql.startsWith('INSERT')) {
              const [
                id,
                token_hash,
                version,
                updated_at,
                size,
                created_at,
                last_written_at,
                scene_key,
              ] = args;
              rows.set(String(id), {
                id,
                token_hash,
                version,
                updated_at,
                size,
                created_at,
                last_written_at,
                scene_key,
              });
              changes = 1;
            } else if (sql.startsWith('DELETE')) {
              const row = rows.get(String(args[0]));
              if (
                row &&
                (sql.includes('last_written_at')
                  ? String(row.last_written_at) < String(args[1])
                  : row.token_hash === args[1])
              ) {
                rows.delete(String(args[0]));
                changes = 1;
              }
            } else if (sql.includes('SET token_hash')) {
              const row = rows.get(String(args[1]));
              if (row && row.token_hash === args[2]) {
                row.token_hash = args[0];
                changes = 1;
              }
            } else {
              const [
                version,
                updated_at,
                last_written_at,
                size,
                scene_key,
                id,
                expected,
                hash,
              ] = args;
              const row = rows.get(String(id));
              if (row && row.version === expected && row.token_hash === hash) {
                Object.assign(row, {
                  version,
                  updated_at,
                  last_written_at,
                  size,
                  scene_key,
                });
                changes = 1;
              }
            }
            return { meta: { changes } };
          },
        }),
      }),
    },
    BOARDS_BUCKET: {
      put: async (key: string, text: string) => {
        objects.set(key, { text, uploaded: new Date() });
      },
      get: async (key: string) => {
        const o = objects.get(key);
        return o ? { json: async () => JSON.parse(o.text) } : null;
      },
      delete: async (keys: string | string[]) => {
        for (const key of Array.isArray(keys) ? keys : [keys])
          objects.delete(key);
      },
      list: async ({ prefix }: { prefix: string }) => ({
        objects: [...objects]
          .filter(([key]) => key.startsWith(prefix))
          .map(([key, o]) => ({ key, uploaded: o.uploaded })),
        truncated: false,
      }),
    },
  } as unknown as Env;
  const call = (
    method: string,
    path = '',
    headers: Record<string, string> = {},
    body: unknown = { elements: [] },
  ) =>
    worker.fetch(
      new Request(`https://markasso.example/api/board${path}`, {
        method,
        headers: { 'Content-Type': 'application/json', ...headers },
        ...(['POST', 'PUT'].includes(method)
          ? { body: JSON.stringify(body) }
          : {}),
      }) as Parameters<typeof worker.fetch>[0],
      env,
    );
  const create = async () => {
    const response = await call('POST');
    expect(response.status).toBe(201);
    return (await response.json()) as {
      id: string;
      writeToken: string;
      version: number;
    };
  };
  return { rows, objects, env, call, create };
}

describe('cloud boards', () => {
  it('creates, reads with ETag, writes, rejects stale and missing versions, rotates and deletes', async () => {
    const { call, create, rows, objects } = setup();
    const board = await create();
    expect(board.id).toMatch(/^[A-Za-z0-9]{12}$/);
    expect(board.writeToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(rows.get(board.id)?.token_hash).not.toBe(board.writeToken);
    const path = `/${board.id}`;
    const auth = { Authorization: `Bearer ${board.writeToken}` };
    const read = await call('GET', path);
    expect(read.headers.get('ETag')).toBe('"1"');
    expect(await read.json()).toMatchObject({
      elements: [],
      version: 1,
      id: board.id,
    });
    expect((await call('PUT', path)).status).toBe(401);
    expect((await call('PUT', path, auth)).status).toBe(428);
    expect(
      (await call('PUT', path, { ...auth, 'If-Match': '"1"' })).status,
    ).toBe(200);
    expect(objects.size).toBe(1);
    expect(
      (await call('PUT', path, { ...auth, 'If-Match': '"1"' })).status,
    ).toBe(409);
    const rotated = await call('POST', `${path}/token`, auth);
    const next = (await rotated.json()) as { writeToken: string };
    expect((await call('DELETE', path, auth)).status).toBe(401);
    expect(
      (
        await call('DELETE', path, {
          Authorization: `Bearer ${next.writeToken}`,
        })
      ).status,
    ).toBe(204);
    expect(objects.size).toBe(0);
    expect((await call('GET', path)).status).toBe(404);
  });
  it('gates create and PUT while keeping public reads, rotation and deletion available', async () => {
    const { env, call, create } = setup();
    const b = await create();
    const auth = { Authorization: `Bearer ${b.writeToken}`, 'If-Match': '"1"' };
    Object.assign(env, {
      CLOUD_REQUIRES_LICENSE: 'true',
      LEMON_STORE_ID: '1',
      LEMON_PRODUCT_ID: '4',
      SHARE_LINKS: { get: async () => null, put: async () => {} },
    });
    expect((await call('POST')).status).toBe(402);
    expect((await call('PUT', `/${b.id}`, auth)).status).toBe(402);
    expect((await call('GET', `/${b.id}`)).status).toBe(200);
    const upstream = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async () =>
        Response.json({
          valid: true,
          license_key: { status: 'active' },
          meta: { store_id: 1, product_id: 4 },
        }),
      );
    try {
      expect(
        (
          await call('PUT', `/${b.id}`, {
            ...auth,
            'X-Markasso-License': 'license',
          })
        ).status,
      ).toBe(200);
      expect(
        (await call('POST', '', { 'X-Markasso-License': 'license' })).status,
      ).toBe(201);
    } finally {
      upstream.mockRestore();
    }
    expect((await call('POST', `/${b.id}/token`, auth)).status).toBe(200);
  });
  it('allows only one simultaneous write and keeps the winning scene', async () => {
    const { create, call, objects } = setup();
    const b = await create();
    const headers = {
      Authorization: `Bearer ${b.writeToken}`,
      'If-Match': '"1"',
    };
    const results = await Promise.all(
      [1, 2].map((n) =>
        call('PUT', `/${b.id}`, headers, {
          elements: [],
          viewport: { offsetX: n, offsetY: 0, zoom: 1 },
        }),
      ),
    );
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    const read = await call('GET', `/${b.id}`);
    expect(await read.json()).toMatchObject({
      version: 2,
      viewport: { offsetX: results[0]?.status === 200 ? 1 : 2 },
    });
    expect(objects.size).toBe(1);
  });
  it('enforces origin, validation, streamed size cap and rate limit', async () => {
    const { call, env } = setup();
    expect(
      (await call('POST', '', { Origin: 'https://evil.example' })).status,
    ).toBe(403);
    expect((await call('POST', '', {}, { elements: [{}] })).status).toBe(400);
    expect(
      (await call('POST', '', {}, { elements: [], viewport: { zoom: 0 } }))
        .status,
    ).toBe(400);
    expect(
      (
        await call(
          'POST',
          '',
          {},
          { elements: [], padding: 'x'.repeat(10_000_000) },
        )
      ).status,
    ).toBe(413);
    vi.mocked(env.BOARD_RATE_LIMITER.limit).mockResolvedValue({
      success: false,
    });
    const limited = await call('POST');
    expect(limited.status).toBe(429);
    expect(limited.headers.get('Retry-After')).toBe('60');
  });
  it('purges expired boards and old orphans while retaining recent and referenced objects', async () => {
    const { create, rows, objects, env } = setup();
    const old = await create();
    const kept = await create();
    const row = rows.get(old.id);
    if (row)
      row.last_written_at = new Date(Date.now() - 366 * 86400000).toISOString();
    objects.set('boards/orphan/old.json', {
      text: '{}',
      uploaded: new Date(Date.now() - 7 * 3600000),
    });
    objects.set('boards/orphan/recent.json', {
      text: '{}',
      uploaded: new Date(),
    });
    await purgeBoards(env);
    expect(rows.has(old.id)).toBe(false);
    expect(rows.has(kept.id)).toBe(true);
    expect(objects.has('boards/orphan/old.json')).toBe(false);
    expect(objects.has('boards/orphan/recent.json')).toBe(true);
  });
});
