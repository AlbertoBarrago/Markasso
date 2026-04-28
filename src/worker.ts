/* eslint-disable @typescript-eslint/no-explicit-any */
// Minimal inline types — avoids importing @cloudflare/workers-types globally
// which would conflict with the DOM lib used by the rest of the project.
declare const KVNamespace: never; // type-only guard
type KV = {
  get(key: string): Promise<string | null>;
  put(
    key: string,
    value: string,
    options?: { expirationTtl?: number },
  ): Promise<void>;
};
type StaticFetcher = { fetch(req: Request): Promise<Response> };
type Ctx = {
  waitUntil(p: Promise<unknown>): void;
  passThroughOnException(): void;
};

interface Env {
  ASSETS: StaticFetcher;
  SHARE_LINKS: KV;
}

const ID_LENGTH = 8;
const ID_CHARS =
  'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
const TTL_SECONDS = 60 * 60 * 24 * 90; // 90 days

function generateId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(ID_LENGTH));
  return Array.from(bytes, (b) => ID_CHARS[b % ID_CHARS.length]).join('');
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export default {
  async fetch(request: Request, env: Env, _ctx: Ctx): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    // POST /api/share — store scene, return {id, url}
    if (request.method === 'POST' && url.pathname === '/api/share') {
      let body: unknown;
      try {
        body = await request.json();
      } catch {
        return Response.json(
          { error: 'Invalid JSON' },
          { status: 400, headers: CORS_HEADERS },
        );
      }

      const id = generateId();
      await env.SHARE_LINKS.put(id, JSON.stringify(body), {
        expirationTtl: TTL_SECONDS,
      });

      return Response.json(
        { id, url: `${url.origin}/#s=${id}` },
        { headers: CORS_HEADERS },
      );
    }

    // GET /api/share/:id — retrieve scene
    if (request.method === 'GET' && url.pathname.startsWith('/api/share/')) {
      const id = url.pathname.slice('/api/share/'.length);
      if (!id || id.length !== ID_LENGTH) {
        return new Response('Not found', {
          status: 404,
          headers: CORS_HEADERS,
        });
      }

      const data = await env.SHARE_LINKS.get(id);
      if (!data)
        return new Response('Not found', {
          status: 404,
          headers: CORS_HEADERS,
        });

      return new Response(data, {
        headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
      });
    }

    // Everything else → static assets
    if (!env.ASSETS) {
      return new Response('Not found', { status: 404, headers: CORS_HEADERS });
    }
    return env.ASSETS.fetch(request);
  },
};
