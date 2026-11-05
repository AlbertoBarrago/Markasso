import { validateElements, validateViewport } from '../io/element_validation';
import { readJsonBody } from '../worker';
import { licenseGate, sha256 } from './license';

type Board = {
  id: string;
  token_hash: string;
  version: number;
  updated_at: string;
  scene_key: string;
};
const MAX_BYTES = 10_000_000;
const YEAR = 365 * 86400000;
const GRACE = 6 * 3600000;
const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
function randomId(): string {
  let id = '';
  while (id.length < 12) {
    for (const byte of crypto.getRandomValues(new Uint8Array(16))) {
      if (byte < 248 && id.length < 12) id += chars[byte % 62];
    }
  }
  return id;
}
function token(): string {
  return btoa(
    String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))),
  )
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '');
}
function equal(a: string, b: string): boolean {
  let diff = a.length ^ b.length;
  for (let i = 0; i < 64; i++)
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}
function json(body: unknown, status = 200): Response {
  return Response.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  });
}
/**
 * `If-None-Match` uses the weak comparison (RFC 9110, 13.1.2): a `W/` prefix
 * is ignored, a list matches when any entry does, and `*` matches any board.
 */
function notModified(header: string | null, etag: string): boolean {
  if (header === null) return false;
  return header
    .split(',')
    .map((tag) => tag.trim().replace(/^W\//, ''))
    .some((tag) => tag === '*' || tag === etag);
}
async function getBoard(env: Env, id: string): Promise<Board | null> {
  return env.BOARDS_DB.prepare('SELECT * FROM boards WHERE id = ?')
    .bind(id)
    .first<Board>();
}
async function deletePrefix(env: Env, prefix: string): Promise<void> {
  let cursor: string | undefined;
  do {
    const page = await env.BOARDS_BUCKET.list({
      prefix,
      ...(cursor ? { cursor } : {}),
    });
    if (page.objects.length)
      await env.BOARDS_BUCKET.delete(page.objects.map((o) => o.key));
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
}
export async function boardRequest(
  request: Request,
  env: Env,
): Promise<Response> {
  try {
    return await handle(request, env);
  } catch {
    return json({ error: 'Board service unavailable' }, 503);
  }
}
async function handle(request: Request, env: Env): Promise<Response> {
  const path = new URL(request.url).pathname;
  const create = path === '/api/board' && request.method === 'POST';
  const match = /^\/api\/board\/([a-zA-Z0-9]{12})(\/token)?$/.exec(path);
  if (!create && !match) return json({ error: 'Not found' }, 404);
  const rotate = !!match?.[2];
  if (
    !create &&
    !(rotate
      ? request.method === 'POST'
      : ['GET', 'PUT', 'DELETE'].includes(request.method))
  )
    return json({ error: 'Method not allowed' }, 405);
  if (request.method !== 'GET') {
    const limited = await env.BOARD_RATE_LIMITER.limit({
      key: `board:${request.headers.get('CF-Connecting-IP') ?? 'unknown'}`,
    });
    if (!limited.success) {
      const response = json({ error: 'Too many requests' }, 429);
      response.headers.set('Retry-After', '60');
      return response;
    }
  }
  const id = create ? randomId() : (match?.[1] as string);
  const board = create ? null : await getBoard(env, id);
  if (!create && !board) return json({ error: 'Not found' }, 404);
  if (board && request.method === 'GET') {
    const etag = `"${board.version}"`;
    // Clients poll for remote changes with the ETag they hold: the D1 row is
    // enough to answer, so an unchanged board never touches R2.
    if (notModified(request.headers.get('If-None-Match'), etag))
      return new Response(null, {
        status: 304,
        headers: { 'Cache-Control': 'no-store', ETag: etag },
      });
    const object = await env.BOARDS_BUCKET.get(board.scene_key);
    if (!object) return json({ error: 'Board service unavailable' }, 503);
    const scene = await object.json<Record<string, unknown>>();
    const response = json({
      ...scene,
      id,
      version: board.version,
      updatedAt: board.updated_at,
    });
    response.headers.set('ETag', etag);
    return response;
  }
  if (board) {
    const bearer = /^Bearer ([A-Za-z0-9_-]{43})$/.exec(
      request.headers.get('Authorization') ?? '',
    );
    if (!bearer?.[1] || !equal(await sha256(bearer[1]), board.token_hash))
      return json({ error: 'Unauthorized' }, 401);
  }
  if (request.method === 'DELETE' && board) {
    const result = await env.BOARDS_DB.prepare(
      'DELETE FROM boards WHERE id = ? AND token_hash = ?',
    )
      .bind(id, board.token_hash)
      .run();
    if (!result.meta.changes) return json({ error: 'Unauthorized' }, 401);
    await deletePrefix(env, `boards/${id}/`);
    return new Response(null, { status: 204 });
  }
  if (rotate && board) {
    const writeToken = token();
    const result = await env.BOARDS_DB.prepare(
      'UPDATE boards SET token_hash = ? WHERE id = ? AND token_hash = ?',
    )
      .bind(await sha256(writeToken), id, board.token_hash)
      .run();
    return result.meta.changes
      ? json({ writeToken })
      : json({ error: 'Unauthorized' }, 401);
  }
  if (board) {
    const version = request.headers.get('If-Match');
    if (version === null) return json({ error: 'If-Match required' }, 428);
    if (!/^"[1-9]\d*"$/.test(version))
      return json({ error: 'Invalid If-Match' }, 400);
    if (version !== `"${board.version}"`)
      return json({ version: board.version, updatedAt: board.updated_at }, 409);
  }
  const license = await licenseGate(request, env);
  if (license)
    return json(
      {
        error:
          license === 402 ? 'license required' : 'License service unavailable',
      },
      license,
    );
  const body = await readJsonBody(request, MAX_BYTES);
  if (!body.ok) return json({ error: body.error }, body.status);
  if (
    !body.value ||
    typeof body.value !== 'object' ||
    Array.isArray(body.value)
  )
    return json({ error: 'Invalid scene' }, 400);
  const raw = body.value as Record<string, unknown>;
  const elements = validateElements(raw.elements);
  const viewport =
    raw.viewport === undefined ? undefined : validateViewport(raw.viewport);
  if (!elements || viewport === null)
    return json({ error: 'Invalid scene' }, 400);
  const scene = JSON.stringify({ elements, ...(viewport ? { viewport } : {}) });
  const size = new TextEncoder().encode(scene).byteLength;
  if (size > MAX_BYTES) return json({ error: 'Request body too large' }, 413);
  const version = (board?.version ?? 0) + 1;
  const sceneKey = `boards/${id}/${version}-${crypto.randomUUID()}.json`;
  const now = new Date().toISOString();
  const writeToken = create ? token() : null;
  await env.BOARDS_BUCKET.put(sceneKey, scene, {
    httpMetadata: { contentType: 'application/json' },
  });
  let changed: number;
  try {
    const result = board
      ? await env.BOARDS_DB.prepare(
          'UPDATE boards SET version = ?, updated_at = ?, last_written_at = ?, size = ?, scene_key = ? WHERE id = ? AND version = ? AND token_hash = ?',
        )
          .bind(
            version,
            now,
            now,
            size,
            sceneKey,
            id,
            board.version,
            board.token_hash,
          )
          .run()
      : await env.BOARDS_DB.prepare(
          'INSERT INTO boards (id, token_hash, version, updated_at, size, created_at, last_written_at, scene_key) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        )
          .bind(
            id,
            await sha256(writeToken as string),
            version,
            now,
            size,
            now,
            now,
            sceneKey,
          )
          .run();
    changed = result.meta.changes;
  } catch {
    // An ambiguous D1 failure may have committed. Leave the object for the cron.
    return json({ error: 'Board service unavailable' }, 503);
  }
  if (!changed) {
    await env.BOARDS_BUCKET.delete(sceneKey);
    const current = await getBoard(env, id);
    if (!current) return json({ error: 'Not found' }, 404);
    if (!equal(current.token_hash, board?.token_hash ?? ''))
      return json({ error: 'Unauthorized' }, 401);
    return json(
      { version: current.version, updatedAt: current.updated_at },
      409,
    );
  }
  if (board) {
    try {
      await env.BOARDS_BUCKET.delete(board.scene_key);
    } catch {
      /* Cron retries orphan cleanup. */
    }
  }
  return create ? json({ id, writeToken, version }, 201) : json({ version });
}

export async function purgeBoards(env: Env): Promise<void> {
  const cutoff = new Date(Date.now() - YEAR).toISOString();
  const expired = await env.BOARDS_DB.prepare(
    'SELECT id FROM boards WHERE last_written_at < ?',
  )
    .bind(cutoff)
    .all<{ id: string }>();
  for (const { id } of expired.results) {
    const result = await env.BOARDS_DB.prepare(
      'DELETE FROM boards WHERE id = ? AND last_written_at < ?',
    )
      .bind(id, cutoff)
      .run();
    if (result.meta.changes) await deletePrefix(env, `boards/${id}/`);
  }
  let cursor: string | undefined;
  do {
    const page = await env.BOARDS_BUCKET.list({
      prefix: 'boards/',
      ...(cursor ? { cursor } : {}),
    });
    for (const object of page.objects) {
      if (object.uploaded.getTime() > Date.now() - GRACE) continue;
      const referenced = await env.BOARDS_DB.prepare(
        'SELECT id FROM boards WHERE scene_key = ?',
      )
        .bind(object.key)
        .first();
      if (!referenced) await env.BOARDS_BUCKET.delete(object.key);
    }
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
}
