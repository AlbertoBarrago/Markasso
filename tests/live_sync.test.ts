import { describe, expect, it } from 'vitest';
import type { Command } from '../src/commands/commands';
import { createScene } from '../src/core/scene';
import type { ArrowElement, RectangleElement } from '../src/elements/element';
import { isSessionCommand } from '../src/engine/ephemeral';
import { History } from '../src/engine/history';

/**
 * End-to-end convergence of per-user undo across peers. `Room` mirrors the
 * worker relay (global order, no echo, persisted log) and `Client` mirrors
 * src/io/realtime.ts (local commands out, remote commands via applyRemote).
 */
class Room {
  readonly log: Command[] = [];
  readonly clients: Client[] = [];

  relay(from: Client, command: Command): void {
    if (!isSessionCommand(command)) return;
    for (const client of this.clients) {
      if (client !== from) client.receive(command);
    }
    this.log.push(command);
  }

  join(): Client {
    const client = new Client(this);
    client.history.resetForLiveReplay(this.log);
    this.clients.push(client);
    return client;
  }
}

class Client {
  readonly history = new History(createScene());

  constructor(room: Room) {
    this.history.setOnCommand((command) => room.relay(this, command));
  }

  receive(command: Command | { type: 'UNDO' | 'REDO' }): void {
    if (isSessionCommand(command)) this.history.applyRemote(command as Command);
  }

  el(id: string) {
    return this.history.present.elements.find((e) => e.id === id);
  }

  box() {
    const el = this.el('box');
    return el && { x: el.x, y: el.y, stroke: el.strokeColor };
  }

  ids(): string[] {
    return this.history.present.elements.map((e) => e.id);
  }
}

function rect(id: string, x = 0): RectangleElement {
  return {
    id,
    type: 'rectangle',
    x,
    y: 0,
    width: 100,
    height: 50,
    strokeColor: '#000000',
    fillColor: 'transparent',
    strokeWidth: 2,
    opacity: 1,
    roughness: 0,
  };
}

const RED = '#ff0000';

function setup() {
  const room = new Room();
  const user = room.join();
  const agent = room.join();
  user.history.dispatch({
    type: 'CREATE_ELEMENT',
    element: rect('box'),
    select: true,
  });
  return { room, user, agent };
}

function recolor(client: Client, color: string): void {
  client.history.dispatch({
    type: 'APPLY_STYLE',
    ids: ['box'],
    strokeColor: color,
  });
}

function move(client: Client, dx: number): void {
  client.history.dispatch({ type: 'MOVE_ELEMENTS', ids: ['box'], dx, dy: 0 });
}

describe('live sync: per-user undo converges', () => {
  it('a drag interleaved with remote recolors keeps both edits', () => {
    const { user, agent } = setup();
    const colors = ['#ff0000', '#00ff00', '#0000ff'];
    user.history.beginDrag();
    for (let i = 0; i < 10; i++) {
      move(user, 10);
      recolor(agent, colors[i % 3]!);
    }
    user.history.endDrag();
    expect(user.box()).toEqual({ x: 100, y: 0, stroke: colors[0] });
    expect(agent.box()).toEqual(user.box());
  });

  it('cancelling a drag reverts only the drag, on every peer', () => {
    const { user, agent } = setup();
    user.history.beginDrag();
    move(user, 50);
    recolor(agent, RED);
    user.history.cancelDrag();
    expect(user.box()).toEqual({ x: 0, y: 0, stroke: RED });
    expect(agent.box()).toEqual(user.box());
  });

  it('undo reverts my move and keeps a later peer recolor', () => {
    const { user, agent } = setup();
    move(user, 50);
    recolor(agent, RED);
    user.history.undo();
    expect(user.box()).toEqual({ x: 0, y: 0, stroke: RED });
    expect(agent.box()).toEqual(user.box());
  });

  it("a peer's undo reverts the peer's own change, not mine", () => {
    const { user, agent } = setup();
    recolor(agent, RED);
    move(user, 50);
    agent.history.undo();
    expect(user.box()).toEqual({ x: 50, y: 0, stroke: '#000000' });
    expect(agent.box()).toEqual(user.box());
  });

  it('a late joiner replays undo through the room log', () => {
    const { room, user } = setup();
    move(user, 50);
    user.history.undo();
    const late = room.join();
    expect(late.box()).toEqual({ x: 0, y: 0, stroke: '#000000' });
    expect(late.box()).toEqual(user.box());
  });

  it('redo after undo converges', () => {
    const { user, agent } = setup();
    move(user, 50);
    recolor(agent, RED);
    user.history.undo();
    user.history.redo();
    expect(user.box()).toEqual({ x: 50, y: 0, stroke: RED });
    expect(agent.box()).toEqual(user.box());
  });

  it('when a peer changed the same field afterwards, the peer wins', () => {
    const { user, agent } = setup();
    move(user, 50);
    move(agent, 10);
    user.history.undo();
    expect(user.box()?.x).toBe(60);
    expect(agent.box()).toEqual(user.box());
  });

  it('undoing a creation removes it everywhere; undoing a delete restores it', () => {
    const { user, agent } = setup();
    user.history.dispatch({ type: 'DELETE_ELEMENTS', ids: ['box'] });
    expect(agent.box()).toBeUndefined();
    user.history.undo();
    expect(agent.box()).toEqual(user.box());
    user.history.undo(); // the creation
    expect(user.box()).toBeUndefined();
    expect(agent.box()).toBeUndefined();
  });

  it('undoing a delete restores the connectors it removed', () => {
    const { user, agent } = setup();
    user.history.dispatch({
      type: 'CREATE_ELEMENT',
      element: rect('other', 300),
    });
    const arrow: ArrowElement = {
      id: 'arrow',
      type: 'arrow',
      x: 100,
      y: 25,
      x2: 300,
      y2: 25,
      strokeColor: '#000000',
      fillColor: 'transparent',
      strokeWidth: 2,
      opacity: 1,
      roughness: 0,
      startElementId: 'box',
      endElementId: 'other',
    };
    user.history.dispatch({ type: 'CREATE_ELEMENT', element: arrow });
    user.history.dispatch({ type: 'DELETE_ELEMENTS', ids: ['box'] });
    expect(agent.ids()).toEqual(['other']);
    user.history.undo();
    expect(user.ids()).toEqual(['box', 'other', 'arrow']);
    expect(agent.ids()).toEqual(user.ids());
  });

  it('undoing a reorder leaves elements a peer added in place', () => {
    const { user, agent } = setup();
    user.history.dispatch({ type: 'CREATE_ELEMENT', element: rect('b') });
    user.history.dispatch({
      type: 'REORDER_ELEMENTS',
      ids: ['box'],
      targetIndex: 1,
    });
    expect(user.ids()).toEqual(['b', 'box']);
    agent.history.dispatch({ type: 'CREATE_ELEMENT', element: rect('peer') });
    user.history.undo();
    expect(user.ids()).toEqual(['box', 'b', 'peer']);
    expect(agent.ids()).toEqual(user.ids());
  });

  it('ignores a bare UNDO from an outdated client', () => {
    const { user, agent } = setup();
    move(user, 50);
    agent.receive({ type: 'UNDO' });
    expect(agent.box()).toEqual(user.box());
    expect(isSessionCommand({ type: 'UNDO' })).toBe(false);
  });
});
