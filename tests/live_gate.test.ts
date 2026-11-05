import { afterEach, describe, expect, it, vi } from 'vitest';
import worker, { SessionRoom } from '../src/worker';
import { mockPolar, polarEnv } from './polar_fake';

const KEY = 'MKC_1C285B2D-6CE6-4BC7-B8BE-ADB6A7E304DA';
const OTHER = 'MKC_9D3E1F7A-0B2C-4D5E-8F90-123456789ABC';

/** Server half of a WebSocketPair, driven by the test. */
class FakeServerSocket {
  readonly sent: Record<string, unknown>[] = [];
  closed: { code: number; reason: string } | null = null;
  private listeners = new Map<
    string,
    Array<(event: { data?: string }) => void>
  >();
  addEventListener(type: string, cb: (event: { data?: string }) => void): void {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), cb]);
  }
  send(data: string): void {
    this.sent.push(JSON.parse(data) as Record<string, unknown>);
  }
  close(code: number, reason: string): void {
    this.closed = { code, reason };
    this.emit('close', {});
  }
  emit(type: string, event: { data?: string }): void {
    for (const cb of this.listeners.get(type) ?? []) cb(event);
  }
  receive(message: unknown): void {
    this.emit('message', { data: JSON.stringify(message) });
  }
}

type RoomInternals = {
  awaitAgentAuth(server: FakeServerSocket, clientId: string): void;
};

async function room(granted: string[] = [KEY]) {
  mockPolar(granted);
  const state = {
    id: { name: 'room-123' },
    storage: { get: async () => undefined, put: async () => {} },
  };
  const { env } = polarEnv({ LIVE_AGENT_REQUIRES_LICENSE: 'true' });
  const instance = new SessionRoom(
    state as unknown as DurableObjectState,
    env,
  ) as unknown as RoomInternals;
  const server = new FakeServerSocket();
  instance.awaitAgentAuth(server, 'agent-client-1');
  return { key: KEY, server };
}

/** Waits for the async licence check (WebCrypto + D1) to finish. */
const settled = (server: FakeServerSocket) =>
  vi.waitFor(() => {
    if (!server.closed && server.sent.length === 0) throw new Error('pending');
  });

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('live agent licence gate', () => {
  it('admits an agent with a valid licence and replays its queued messages', async () => {
    const { key, server } = await room();
    server.receive({ type: 'auth', license: key });
    server.receive({ type: 'presence', name: 'Claude', color: '#c77dff' });
    await settled(server);
    expect(server.closed).toBeNull();
    expect(server.sent[0]).toMatchObject({
      type: 'init',
      self: 'agent-client-1',
    });
    // The presence sent during the check is replayed once the agent is in.
    await vi.waitFor(() =>
      expect(
        server.sent.filter((m) => m.type === 'presence').at(-1)?.peers,
      ).toEqual([{ id: 'agent-client-1', name: 'Claude', color: '#c77dff' }]),
    );
  });

  it.each([
    ['a wrong key', () => ({ type: 'auth', license: OTHER })],
    ['no auth message', () => ({ type: 'presence', name: 'Claude' })],
  ])('refuses %s without leaking the room', async (_, message) => {
    const { server } = await room();
    server.receive(message());
    await settled(server);
    expect(server.sent).toEqual([{ type: 'error', error: 'licence required' }]);
    expect(server.closed).toEqual({ code: 4402, reason: 'licence required' });
  });

  it('refuses a revoked key (subscription ended)', async () => {
    const { key, server } = await room([]);
    server.receive({ type: 'auth', license: key });
    await settled(server);
    expect(server.closed?.code).toBe(4402);
  });

  it('closes an agent that never authenticates', async () => {
    vi.useFakeTimers();
    const { server } = await room();
    vi.advanceTimersByTime(5000);
    expect(server.closed?.code).toBe(4402);
  });
});

describe('live peer classification', () => {
  async function forward(headers: Record<string, string>) {
    const seen: Request[] = [];
    const env = {
      SESSION_ROOMS: {
        idFromName: (name: string) => name,
        get: () => ({
          fetch: async (request: Request) => {
            seen.push(request);
            return new Response(null, { status: 204 });
          },
        }),
      },
    } as unknown as Env;
    await worker.fetch(
      new Request('https://markasso.it/session/ws?room=room-123', { headers }),
      env,
    );
    return seen[0]!.headers.get('X-Markasso-Peer');
  }

  it('tags same-origin peers as browsers and everything else as agents', async () => {
    expect(await forward({ Origin: 'https://markasso.it' })).toBe('browser');
    expect(await forward({})).toBe('agent');
    expect(await forward({ Origin: 'https://evil.example' })).toBe('agent');
    expect(
      await forward({
        Origin: 'https://evil.example',
        'X-Markasso-Peer': 'browser',
      }),
    ).toBe('agent');
  });
});
