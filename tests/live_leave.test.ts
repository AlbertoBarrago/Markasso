import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createScene } from '../src/core/scene';
import { History } from '../src/engine/history';
import {
  getLiveSessionUrl,
  joinLiveSession,
  leaveLiveSession,
} from '../src/io/realtime';

/** Platform WebSocket stand-in driven by the test. */
class FakeSocket {
  static OPEN = 1;
  static all: FakeSocket[] = [];
  readyState = 0;
  readonly sent: unknown[] = [];
  closed: { code?: number; reason?: string } | null = null;
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(readonly url: string) {
    FakeSocket.all.push(this);
  }
  open(): void {
    this.readyState = FakeSocket.OPEN;
    this.onopen?.();
    this.onmessage?.({
      data: JSON.stringify({ type: 'init', self: 'me', commands: [], peers: [] }),
    });
  }
  send(data: string): void {
    this.sent.push(JSON.parse(data));
  }
  close(code?: number, reason?: string): void {
    this.readyState = 3;
    this.closed = { code, reason } as { code?: number; reason?: string };
    this.onclose?.();
  }
}

const rect = {
  id: 'a',
  type: 'rectangle' as const,
  x: 0,
  y: 0,
  width: 10,
  height: 10,
  strokeColor: '#000',
  fillColor: 'transparent',
  strokeWidth: 1,
  opacity: 1,
  roughness: 0,
};

let address: URL;
beforeEach(() => {
  vi.useFakeTimers();
  FakeSocket.all = [];
  address = new URL('https://markasso.example/?live=room-123&x=1');
  vi.stubGlobal('WebSocket', FakeSocket);
  vi.stubGlobal('location', {
    get href() {
      return address.href;
    },
    get search() {
      return address.search;
    },
    protocol: 'https:',
    host: 'markasso.example',
    pathname: '/',
  });
  vi.stubGlobal('window', {
    matchMedia: () => ({ matches: false }),
    history: {
      state: null,
      replaceState: (_: unknown, __: string, url: URL) => {
        address = new URL(String(url));
      },
    },
  });
  const store = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => store.set(k, v),
  });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('leaveLiveSession', () => {
  it('is a no-op outside a session', () => {
    expect(leaveLiveSession()).toBe(false);
  });

  it('closes the room, stops relaying and never reconnects', () => {
    const history = new History(createScene());
    joinLiveSession(history, { roomId: 'room-123' });
    const socket = FakeSocket.all[0]!;
    socket.open();
    expect(getLiveSessionUrl()).not.toBeNull();

    expect(leaveLiveSession()).toBe(true);
    expect(socket.closed).toEqual({ code: 1000, reason: 'left' });
    expect(getLiveSessionUrl()).toBeNull();
    // The live link is gone from the address, other parameters stay.
    expect(address.search).toBe('?x=1');

    // Local edits are no longer sent, and no reconnect is ever scheduled.
    const sentBefore = socket.sent.length;
    history.dispatch({ type: 'CREATE_ELEMENT', element: rect });
    expect(socket.sent).toHaveLength(sentBefore);
    vi.advanceTimersByTime(60_000);
    expect(FakeSocket.all).toHaveLength(1);
    // The board stays as a local copy.
    expect(history.present.elements.map((e) => e.id)).toEqual(['a']);
  });

  it('can leave while reconnecting after a dropped connection', () => {
    const history = new History(createScene());
    joinLiveSession(history, { roomId: 'room-123' });
    FakeSocket.all[0]!.open();
    FakeSocket.all[0]!.close(1006);
    expect(leaveLiveSession()).toBe(true);
    vi.advanceTimersByTime(60_000);
    expect(FakeSocket.all).toHaveLength(1);
  });
});
