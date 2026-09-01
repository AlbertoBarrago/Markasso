import { isSessionCommand } from './engine/ephemeral';
import { validateElements } from './io/element_validation';
import {
  buildIssueBody,
  buildIssueTitle,
  validateReport,
} from './io/report_validation';

const ID_LENGTH = 8;
const ID_CHARS =
  'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
const TTL_SECONDS = 60 * 60 * 24 * 90;
const MAX_REQUEST_BYTES = 1_000_000;

// The REPORT_RATE_LIMITER binding only bounds bursts (its `period` is capped
// at 60s by the Workers runtime); this is the actual per-IP quota window.
const REPORT_QUOTA_LIMIT = 3;
const REPORT_QUOTA_WINDOW_SECONDS = 600;

function generateId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(ID_LENGTH));
  return Array.from(bytes, (byte) => ID_CHARS[byte % ID_CHARS.length]).join('');
}

// ── Realtime sessions (Durable Object) ───────────────────────────────────────

interface PeerInfo {
  id: string;
  name: string;
  color: string;
}

const MAX_LOG_LENGTH = 5000;
const LOG_KEY = 'commands';
const ROOM_ID_RE = /^[a-zA-Z0-9_-]{3,64}$/;

/** A command as serialized over the wire. Kept structural so the Worker does
 *  not need to type-check browser-dependent element/app_state modules. */
type WireCommand = { type: string; [k: string]: unknown };

///**
/**
 * One live editing room. A single serialization point: it appends commands to
 * the room's log and broadcasts each to the other connected peers. Peers
 * converge by replaying the same deterministic reducer in server order.
 *
 * No server-side reducer: the log is relayed as-is and applied identically on
 * every client (LWW for concurrent edits to the same element).
 */
export class SessionRoom {
  private readonly state: DurableObjectState;
  private readonly commands: WireCommand[] = [];
  private readonly sockets = new Map<WebSocket, string>(); // ws -> peerId
  private readonly peers = new Map<string, Omit<PeerInfo, 'id'>>();
  private loaded = false;
  private persistTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(state: DurableObjectState, _env: Env) {
    this.state = state;
  }

  private async initialize(): Promise<void> {
    if (this.loaded) return;
    this.loaded = true;
    const stored = await this.state.storage.get<WireCommand[]>(LOG_KEY);
    if (Array.isArray(stored)) this.commands.push(...stored);
  }

  async fetch(request: Request): Promise<Response> {
    await this.initialize();
    if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
      return new Response('Expected a WebSocket upgrade', { status: 426 });
    }

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair) as [WebSocket, WebSocket];
    server.accept();

    const peerId = crypto.randomUUID();
    this.sockets.set(server, peerId);
    this.peers.set(peerId, { name: 'Guest', color: '#a78bfa' });

    server.send(
      JSON.stringify({
        type: 'init',
        self: peerId,
        commands: this.commands,
        peers: this.peerList(),
      }),
    );
    this.broadcast({ type: 'presence', peers: this.peerList() });

    server.addEventListener('message', (event) => {
      let msg: unknown;
      try {
        msg = JSON.parse(String(event.data));
      } catch {
        return;
      }
      this.handleMessage(peerId, msg);
    });
    server.addEventListener('close', () => {
      this.dropPeer(server, peerId);
    });
    server.addEventListener('error', () => {
      this.dropPeer(server, peerId);
    });

    return new Response(null, { status: 101, webSocket: client });
  }

  private handleMessage(peerId: string, msg: unknown): void {
    if (!msg || typeof msg !== 'object') return;
    const m = msg as Record<string, unknown>;

    if (m.type === 'command' && m.command) {
      const command = m.command as WireCommand | { type: 'UNDO' | 'REDO' };
      if (!isSessionCommand(command)) return;
      if (this.commands.length >= MAX_LOG_LENGTH) this.commands.shift();
      this.commands.push(command);
      this.schedulePersist();
      this.broadcast(
        { type: 'apply', command, from: peerId },
        /* except */ peerId,
      );
      return;
    }

    if (m.type === 'presence') {
      const peer = this.peers.get(peerId);
      if (!peer) return;
      if (
        typeof m.name === 'string' &&
        m.name.length > 0 &&
        m.name.length <= 24
      ) {
        peer.name = m.name;
      }
      if (typeof m.color === 'string' && /^#[0-9a-f]{6}$/i.test(m.color)) {
        peer.color = m.color;
      }
      this.broadcast({ type: 'presence', peers: this.peerList() });
    }
  }

  private dropPeer(socket: WebSocket, peerId: string): void {
    this.sockets.delete(socket);
    this.peers.delete(peerId);
    this.broadcast({ type: 'presence', peers: this.peerList() });
  }

  private peerList(): PeerInfo[] {
    return [...this.peers.entries()].map(([id, p]) => ({ id, ...p }));
  }

  private broadcast(msg: unknown, exceptPeerId?: string): void {
    const data = JSON.stringify(msg);
    for (const [socket, peerId] of this.sockets) {
      if (peerId === exceptPeerId) continue;
      try {
        socket.send(data);
      } catch {
        // socket may be closing
      }
    }
  }

  private schedulePersist(): void {
    if (this.persistTimer) return;
    this.persistTimer = setTimeout(async () => {
      this.persistTimer = null;
      await this.state.storage.put(LOG_KEY, this.commands.slice());
    }, 800);
  }
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
      url.pathname === '/api/share' ||
      url.pathname.startsWith('/api/share/') ||
      url.pathname === '/api/report';

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

    if (request.method === 'POST' && url.pathname === '/api/report') {
      const clientAddress =
        request.headers.get('CF-Connecting-IP') ?? 'unknown';

      const burst = await env.REPORT_RATE_LIMITER.limit({
        key: `report:${clientAddress}`,
      });
      if (!burst.success) {
        const response = jsonResponse(
          request,
          url,
          { error: 'Too many requests' },
          429,
        );
        response.headers.set('Retry-After', '60');
        return response;
      }

      const quotaKey = `report-quota:${clientAddress}`;
      const quotaUsed = Number((await env.SHARE_LINKS.get(quotaKey)) ?? '0');
      if (quotaUsed >= REPORT_QUOTA_LIMIT) {
        const response = jsonResponse(
          request,
          url,
          { error: 'Too many requests' },
          429,
        );
        response.headers.set(
          'Retry-After',
          String(REPORT_QUOTA_WINDOW_SECONDS),
        );
        return response;
      }

      const body = await readJsonBody(request);
      if (!body.ok) {
        return jsonResponse(request, url, { error: body.error }, body.status);
      }
      const report = validateReport(body.value);
      if (!report) {
        return jsonResponse(request, url, { error: 'Invalid report' }, 400);
      }

      const githubResponse = await fetch(
        `https://api.github.com/repos/${env.REPORT_REPO}/issues`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${env.GITHUB_TOKEN}`,
            Accept: 'application/vnd.github+json',
            'X-GitHub-Api-Version': '2022-11-28',
            'Content-Type': 'application/json',
            'User-Agent': 'markasso-report-form',
          },
          body: JSON.stringify({
            title: buildIssueTitle(report),
            body: buildIssueBody(report),
            labels: ['user-report'],
          }),
        },
      );

      if (!githubResponse.ok) {
        return jsonResponse(
          request,
          url,
          { error: 'Failed to submit report' },
          502,
        );
      }

      await env.SHARE_LINKS.put(quotaKey, String(quotaUsed + 1), {
        expirationTtl: REPORT_QUOTA_WINDOW_SECONDS,
      });

      const issue = (await githubResponse.json()) as { html_url: string };
      return jsonResponse(request, url, { url: issue.html_url }, 201);
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

    if (request.method === 'GET' && url.pathname === '/session/ws') {
      const room = url.searchParams.get('room');
      if (!room || !ROOM_ID_RE.test(room)) {
        return jsonResponse(request, url, { error: 'Invalid room' }, 400);
      }
      const id = env.SESSION_ROOMS.idFromName(room);
      return env.SESSION_ROOMS.get(id).fetch(request);
    }

    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;

export default worker;
