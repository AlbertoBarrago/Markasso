import { validateElements } from './io/element_validation';

const ID_LENGTH = 8;
const ID_CHARS =
  'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
const TTL_SECONDS = 60 * 60 * 24 * 90;
const MAX_REQUEST_BYTES = 1_000_000;

function generateId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(ID_LENGTH));
  return Array.from(bytes, (byte) => ID_CHARS[byte % ID_CHARS.length]).join('');
}

function isAllowedOrigin(request: Request, url: URL): boolean {
  const origin = request.headers.get('Origin');
  return origin === null || origin === url.origin;
}

function apiHeaders(request: Request, url: URL): Headers {
  const headers = new Headers({ Vary: 'Origin' });
  const origin = request.headers.get('Origin');
  if (origin === url.origin) headers.set('Access-Control-Allow-Origin', origin);
  return headers;
}

function jsonResponse(
  request: Request,
  url: URL,
  body: unknown,
  status = 200,
): Response {
  const headers = apiHeaders(request, url);
  headers.set('Cache-Control', 'no-store');
  return Response.json(body, { status, headers });
}

type JsonBodyResult =
  | { readonly ok: true; readonly value: unknown }
  | { readonly ok: false; readonly status: number; readonly error: string };

async function readJsonBody(request: Request): Promise<JsonBodyResult> {
  if (
    !request.headers
      .get('Content-Type')
      ?.toLowerCase()
      .startsWith('application/json')
  ) {
    return {
      ok: false,
      status: 415,
      error: 'Content-Type must be application/json',
    };
  }

  const contentLength = request.headers.get('Content-Length');
  if (contentLength !== null && Number(contentLength) > MAX_REQUEST_BYTES) {
    return { ok: false, status: 413, error: 'Request body too large' };
  }
  if (!request.body) return { ok: false, status: 400, error: 'Invalid JSON' };

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.byteLength;
      if (received > MAX_REQUEST_BYTES) {
        await reader.cancel();
        return { ok: false, status: 413, error: 'Request body too large' };
      }
      chunks.push(value);
    }

    const bytes = new Uint8Array(received);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return { ok: true, value: JSON.parse(new TextDecoder().decode(bytes)) };
  } catch {
    return { ok: false, status: 400, error: 'Invalid JSON' };
  } finally {
    reader.releaseLock();
  }
}

const worker = {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url);
    const isApiRoute =
      url.pathname === '/api/share' || url.pathname.startsWith('/api/share/');

    if (isApiRoute && !isAllowedOrigin(request, url)) {
      return jsonResponse(request, url, { error: 'Origin not allowed' }, 403);
    }

    if (request.method === 'OPTIONS' && isApiRoute) {
      const headers = apiHeaders(request, url);
      headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      headers.set('Access-Control-Allow-Headers', 'Content-Type');
      return new Response(null, { status: 204, headers });
    }

    if (request.method === 'POST' && url.pathname === '/api/share') {
      const clientAddress =
        request.headers.get('CF-Connecting-IP') ?? 'unknown';
      const rateLimit = await env.SHARE_RATE_LIMITER.limit({
        key: `share:${clientAddress}`,
      });
      if (!rateLimit.success) {
        const response = jsonResponse(
          request,
          url,
          { error: 'Too many requests' },
          429,
        );
        response.headers.set('Retry-After', '60');
        return response;
      }

      const body = await readJsonBody(request);
      if (!body.ok) {
        return jsonResponse(request, url, { error: body.error }, body.status);
      }
      const elements = validateElements(body.value);
      if (!elements) {
        return jsonResponse(request, url, { error: 'Invalid scene' }, 400);
      }

      const id = generateId();
      await env.SHARE_LINKS.put(id, JSON.stringify(elements), {
        expirationTtl: TTL_SECONDS,
      });
      return jsonResponse(request, url, { id, url: `${url.origin}/#s=${id}` });
    }

    if (request.method === 'GET' && url.pathname.startsWith('/api/share/')) {
      const id = url.pathname.slice('/api/share/'.length);
      if (!new RegExp(`^[a-zA-Z0-9]{${ID_LENGTH}}$`).test(id)) {
        return jsonResponse(request, url, { error: 'Not found' }, 404);
      }

      const data = await env.SHARE_LINKS.get(id);
      if (!data) return jsonResponse(request, url, { error: 'Not found' }, 404);

      const headers = apiHeaders(request, url);
      headers.set('Content-Type', 'application/json');
      headers.set('Cache-Control', 'private, max-age=60');
      return new Response(data, { headers });
    }

    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;

export default worker;
