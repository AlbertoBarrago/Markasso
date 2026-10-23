import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Element } from '../../src/elements/element';
import { Diagram } from '../src/diagram';
import { LiveLink, parseLiveLink } from '../src/live';

/** Minimal stand-in for the platform WebSocket, driven by the test. */
class FakeSocket {
  static OPEN = 1;
  static last: FakeSocket | null = null;
  readyState = 0;
  readonly url: string;
  readonly sent: unknown[] = [];
  private listeners = new Map<
    string,
    Array<(event: { data?: string }) => void>
  >();
  constructor(url: string) {
    this.url = url;
    FakeSocket.last = this;
    queueMicrotask(() => {
      this.readyState = FakeSocket.OPEN;
      this.emit('open', {});
    });
  }
  addEventListener(type: string, cb: (event: { data?: string }) => void): void {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), cb]);
  }
  send(data: string): void {
    this.sent.push(JSON.parse(data));
  }
  close(): void {
    this.readyState = 3;
    this.emit('close', {});
  }
  emit(type: string, event: { data?: string }): void {
    for (const cb of this.listeners.get(type) ?? []) cb(event);
  }
  receive(message: unknown): void {
    this.emit('message', { data: JSON.stringify(message) });
  }
}

const original = globalThis.WebSocket;
beforeEach(() => {
  (globalThis as { WebSocket: unknown }).WebSocket = FakeSocket;
});
afterEach(() => {
  (globalThis as { WebSocket: unknown }).WebSocket = original;
});

const rect = (id: string, label: string): Element => ({
  id,
  type: 'rectangle',
  x: 0,
  y: 0,
  width: 100,
  height: 50,
  strokeColor: '#000',
  fillColor: 'transparent',
  strokeWidth: 1,
  opacity: 1,
  roughness: 0,
  label,
});

async function join(diagram: Diagram, commands: unknown[]) {
  const pending = LiveLink.join(
    diagram,
    'https://markasso.it/?live=room-123',
    'Claude',
  );
  await new Promise((r) => setTimeout(r, 0));
  const socket = FakeSocket.last!;
  socket.receive({
    type: 'init',
    self: 'me',
    commands,
    peers: [{ id: 'p1', name: 'Alberto', color: '#fff' }],
  });
  return { result: await pending, socket };
}

describe('parseLiveLink', () => {
  it('reads the room from a live link or a bare id', () => {
    expect(parseLiveLink('https://markasso.it/?live=abc_123')).toEqual({
      room: 'abc_123',
      origin: 'https://markasso.it',
    });
    expect(parseLiveLink('abc-123').room).toBe('abc-123');
    expect(() => parseLiveLink('https://markasso.it/')).toThrow(
      'no valid "live"',
    );
  });
});

describe('LiveLink', () => {
  it('connects with presence and adopts a room that has content', async () => {
    const diagram = new Diagram([rect('local', 'Mine')]);
    const { result, socket } = await join(diagram, [
      { type: 'CREATE_ELEMENT', element: rect('room', 'From room') },
    ]);
    expect(socket.url).toMatch(
      /^wss:\/\/markasso\.it\/session\/ws\?room=room-123&clientId=[A-Za-z0-9]{24}$/,
    );
    expect(socket.sent[0]).toMatchObject({ type: 'presence', name: 'Claude' });
    expect(result.discarded).toBe(1);
    expect(diagram.elements.map((el) => el.id)).toEqual(['room']);
    expect(result.link.otherPeers.map((p) => p.name)).toEqual(['Alberto']);
  });

  it('publishes the local diagram to an empty room', async () => {
    const diagram = new Diagram([rect('local', 'Mine')]);
    const { result, socket } = await join(diagram, []);
    expect(result.seeded).toBe(true);
    expect(socket.sent[1]).toMatchObject({
      type: 'command',
      command: { type: 'CREATE_ELEMENTS' },
    });
  });

  it('forwards local edits and applies remote ones', async () => {
    const diagram = new Diagram();
    const { socket } = await join(diagram, []);
    await diagram.addNodes([{ key: 'api' }]);
    expect(socket.sent.at(-1)).toMatchObject({
      type: 'command',
      command: { type: 'CREATE_ELEMENTS' },
    });
    socket.receive({
      type: 'apply',
      from: 'p1',
      command: { type: 'CREATE_ELEMENT', element: rect('peer', 'Peer') },
    });
    expect(diagram.elements.map((el) => el.id)).toContain('peer');
  });

  it('ignores a bare UNDO from an outdated client', async () => {
    const diagram = new Diagram();
    const { socket } = await join(diagram, []);
    await diagram.addNodes([{ key: 'api' }]);
    const sentBefore = socket.sent.length;
    socket.receive({ type: 'apply', from: 'p1', command: { type: 'UNDO' } });
    expect(diagram.elements).toHaveLength(1);
    expect(socket.sent).toHaveLength(sentBefore);
  });

  it('forwards its own undo to the room as a patch', async () => {
    const diagram = new Diagram();
    const { socket } = await join(diagram, []);
    await diagram.addNodes([{ key: 'api' }]);
    diagram.history.undo();
    expect(diagram.elements).toHaveLength(0);
    expect(socket.sent.at(-1)).toMatchObject({
      type: 'command',
      command: { type: 'PATCH_ELEMENTS', delete: [expect.any(String)] },
    });
  });

  it('stops forwarding after leaving', async () => {
    const diagram = new Diagram();
    const { result, socket } = await join(diagram, []);
    result.link.leave();
    const sentBefore = socket.sent.length;
    await diagram.addNodes([{ key: 'api' }]);
    expect(socket.sent).toHaveLength(sentBefore);
  });
});
