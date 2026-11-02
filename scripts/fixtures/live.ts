/**
 * `live` family: two or three `History` instances in a room, exchanging
 * commands. Each case is a trace (same encoding as `history`) plus every
 * peer's final scene and whether their elements converged.
 *
 * The room mirrors tests/live_sync.test.ts and the worker relay: session
 * commands only (isSessionCommand), global order, no echo to the sender,
 * persisted log replayed by joiners through resetForLiveReplay. In `sync`
 * rooms delivery is immediate; in `queued` rooms each peer has an inbox
 * flushed by explicit `deliver` calls (network latency), and every inbox is
 * flushed before the final scenes are taken. Deliveries show up in the trace
 * as `applyRemote` steps, so replaying the trace needs no room model.
 */
import type { Command } from '../../src/commands/commands';
import { createScene, type Scene } from '../../src/core/scene';
import {
  EPHEMERAL_COMMANDS,
  isEphemeralCommand,
  isSessionCommand,
} from '../../src/engine/ephemeral';
import { History } from '../../src/engine/history';
import { Family, type Json } from './common';
import { recordTrace, TRACE_ENCODING } from './history';
import { type Session, traceCase } from './recording';
import { COMMAND_TYPES } from './reducer';
import { sample } from './samples';
import { encodeScene, SCENE_ENCODING, sameElements } from './scene_codec';

/**
 * Cases where the web's peers end with different elements: a finding about
 * the web, kept as fixtures. The generator fails if this list goes stale.
 */
const KNOWN_DIVERGENT = new Set<string>([
  'queued: concurrent recolor of the same element',
  'queued: concurrent creates',
  'queued: undo reaches a peer before its concurrent edit lands',
  'queued: three peers, undo of a field changed concurrently',
]);

class Room {
  readonly log: Command[] = [];
  readonly clients: Client[] = [];

  constructor(readonly queued: boolean) {}

  relay(from: Client, command: Command): void {
    if (!isSessionCommand(command)) return;
    this.log.push(command);
    for (const client of this.clients) {
      if (client === from) continue;
      if (this.queued) client.inbox.push(command);
      else client.receive(command);
    }
  }

  join(): Client {
    const client = new Client(this);
    client.history.resetForLiveReplay(this.log);
    this.clients.push(client);
    return client;
  }

  /** Delivers every pending message, peer by peer. */
  flush(): void {
    for (const client of this.clients) client.deliver();
  }
}

class Client {
  readonly history: History;
  readonly inbox: Command[] = [];

  constructor(room: Room) {
    this.history = new History(createScene());
    this.history.setOnCommand((command) => room.relay(this, command));
  }

  receive(command: Command): void {
    if (isSessionCommand(command)) this.history.applyRemote(command);
  }

  /** Applies the first `count` pending messages (all by default). */
  deliver(count = this.inbox.length): void {
    for (const command of this.inbox.splice(0, count)) this.receive(command);
  }

  get h(): History {
    return this.history;
  }
}

const BOX = 'r';

function recolor(client: Client, color: string, ids = [BOX]): void {
  client.h.dispatch({ type: 'APPLY_STYLE', ids, strokeColor: color });
}

function move(client: Client, dx: number, dy = 0, id = BOX): void {
  client.h.dispatch({ type: 'MOVE_ELEMENT', id, dx, dy });
}

function create(
  client: Client,
  name: Parameters<typeof sample>[0],
  overrides = {},
): void {
  client.h.dispatch({
    type: 'CREATE_ELEMENT',
    element: sample(name, overrides),
  });
}

interface Outcome {
  readonly final: Scene[];
  readonly converged: boolean;
}

function outcome(room: Room): Outcome {
  room.flush();
  const final = room.clients.map((c) => c.h.present);
  const converged = final.every((scene) => sameElements(scene, final[0]!));
  return { final, converged };
}

function sessions(): Array<[string, boolean, (room: Room) => void]> {
  const s: Array<[string, boolean, (room: Room) => void]> = [];
  const sync = (name: string, run: (room: Room) => void) =>
    s.push([`sync: ${name}`, false, run]);
  const queued = (name: string, run: (room: Room) => void) =>
    s.push([`queued: ${name}`, true, run]);

  sync('three peers, undo reverts only fields still mine', (room) => {
    const [a, b, c] = [room.join(), room.join(), room.join()];
    create(a!, 'rect');
    move(b!, 50);
    recolor(c!, '#ff0000');
    move(a!, 10);
    b!.h.undo();
    c!.h.undo();
    a!.h.undo();
    a!.h.undo();
    b!.h.redo();
  });

  sync('style undo keeps the field a peer overwrote', (room) => {
    const [a, b] = [room.join(), room.join()];
    create(a!, 'rect');
    a!.h.dispatch({
      type: 'APPLY_STYLE',
      ids: [BOX],
      strokeColor: '#e03131',
      fillColor: '#ffc9c9',
    });
    b!.h.dispatch({ type: 'APPLY_STYLE', ids: [BOX], fillColor: '#a5d8ff' });
    a!.h.undo();
    a!.h.redo();
    b!.h.undo();
  });

  sync('creation undone while a peer edits it, then redone', (room) => {
    const [a, b] = [room.join(), room.join()];
    create(a!, 'note');
    b!.h.dispatch({ type: 'EDIT_TEXT', id: 'n', content: 'peer text' });
    a!.h.undo();
    b!.h.undo();
    a!.h.redo();
    b!.h.redo();
  });

  sync('undo of a delete restores the peer connector it cascaded', (room) => {
    const [a, b] = [room.join(), room.join()];
    create(a!, 'rect');
    create(a!, 'rhombus');
    create(b!, 'arrow');
    a!.h.dispatch({ type: 'DELETE_ELEMENTS', ids: [BOX] });
    a!.h.undo();
    b!.h.undo();
    a!.h.redo();
  });

  sync('late joiner after undo and redo, then everyone undoes', (room) => {
    const [a, b] = [room.join(), room.join()];
    create(a!, 'rect');
    create(b!, 'ellipse');
    move(a!, 30, 30);
    a!.h.undo();
    b!.h.dispatch({
      type: 'SET_SHAPE_LABEL',
      id: 'e',
      label: 'B',
      labelFontSize: 20,
      labelFontFamily: 'Arial',
    });
    a!.h.redo();
    const c = room.join();
    move(c, -5, 0, 'e');
    c.h.undo();
    a!.h.undo();
    b!.h.undo();
    c.h.redo();
  });

  sync('late joiner during a drag', (room) => {
    const [a, b] = [room.join(), room.join()];
    create(a!, 'rect');
    a!.h.beginDrag();
    move(a!, 10);
    move(a!, 10);
    const c = room.join();
    move(a!, 10);
    a!.h.endDrag();
    recolor(c, '#00ff00');
    a!.h.undo();
    b!.h.dispatch({ type: 'LOCK_ELEMENTS', ids: [BOX] });
  });

  sync('cancelled drag with peer edits in between', (room) => {
    const [a, b, c] = [room.join(), room.join(), room.join()];
    create(a!, 'rect');
    create(a!, 'ellipse');
    a!.h.beginDrag();
    a!.h.dispatch({ type: 'MOVE_ELEMENTS', ids: [BOX, 'e'], dx: 40, dy: 0 });
    b!.h.dispatch({ type: 'RESIZE_ELEMENT', id: 'e', width: 300 });
    c!.h.dispatch({ type: 'MOVE_ELEMENT', id: 'e', dx: 0, dy: 15 });
    a!.h.dispatch({ type: 'MOVE_ELEMENTS', ids: [BOX, 'e'], dx: 40, dy: 0 });
    a!.h.cancelDrag();
    c!.h.undo();
  });

  sync('two peers drag the same element on different axes', (room) => {
    const [a, b] = [room.join(), room.join()];
    create(a!, 'rect');
    a!.h.beginDrag();
    b!.h.beginDrag();
    move(a!, 10, 0);
    move(b!, 0, 20);
    move(a!, 10, 0);
    move(b!, 0, 20);
    a!.h.endDrag();
    b!.h.endDrag();
    a!.h.undo();
    b!.h.undo();
  });

  sync('reorder and group undo around a peer insert', (room) => {
    const [a, b] = [room.join(), room.join()];
    create(a!, 'rect');
    create(a!, 'ellipse');
    a!.h.dispatch({ type: 'REORDER_ELEMENTS', ids: [BOX], targetIndex: 1 });
    create(b!, 'rhombus');
    a!.h.dispatch({ type: 'GROUP_ELEMENTS', ids: [BOX, 'e'], groupId: 'g' });
    b!.h.dispatch({ type: 'GROUP_ELEMENTS', ids: ['d'], groupId: 'g' });
    a!.h.undo();
    a!.h.undo();
    b!.h.dispatch({ type: 'UNGROUP_ELEMENTS', groupId: 'g' });
  });

  sync('peer rejoins and replays the log', (room) => {
    const [a, b] = [room.join(), room.join()];
    create(a!, 'rect');
    move(b!, 5);
    a!.h.undo();
    b!.h.resetForLiveReplay(room.log);
    b!.h.undo();
    move(b!, 7);
    a!.h.redo();
  });

  sync('ephemeral commands and bare UNDO stay local', (room) => {
    const [a, b] = [room.join(), room.join()];
    create(a!, 'rect');
    a!.h.dispatch({ type: 'SELECT_ELEMENTS', ids: [BOX] });
    a!.h.dispatch({ type: 'PAN_VIEWPORT', dx: 100, dy: 0 });
    a!.h.dispatch({ type: 'SET_STROKE_COLOR', color: '#ff0000' });
    a!.h.dispatch({ type: 'APPLY_STYLE', strokeWidth: 5 });
    b!.receive({ type: 'UNDO' } as unknown as Command);
    a!.h.undo();
  });

  queued('concurrent moves of the same element', (room) => {
    const [a, b] = [room.join(), room.join()];
    create(a!, 'rect');
    room.flush();
    move(a!, 25);
    move(b!, 5);
    room.flush();
    a!.h.undo();
  });

  queued('concurrent edits of different fields', (room) => {
    const [a, b] = [room.join(), room.join()];
    create(a!, 'rect');
    room.flush();
    recolor(a!, '#ff0000');
    b!.h.dispatch({ type: 'RENAME_LAYER', id: BOX, name: 'B' });
    room.flush();
    b!.h.undo();
    a!.h.undo();
  });

  queued('concurrent recolor of the same element', (room) => {
    const [a, b] = [room.join(), room.join()];
    create(a!, 'rect');
    room.flush();
    recolor(a!, '#ff0000');
    recolor(b!, '#0000ff');
  });

  queued('concurrent creates', (room) => {
    const [a, b] = [room.join(), room.join()];
    create(a!, 'rect');
    create(b!, 'ellipse');
  });

  queued('concurrent reorders', (room) => {
    const [a, b] = [room.join(), room.join()];
    create(a!, 'rect');
    create(a!, 'ellipse');
    create(a!, 'rhombus');
    room.flush();
    a!.h.dispatch({ type: 'REORDER_ELEMENTS', ids: [BOX], targetIndex: 2 });
    b!.h.dispatch({ type: 'REORDER_ELEMENTS', ids: ['d'], targetIndex: 0 });
  });

  queued('move and concurrent delete, then undo', (room) => {
    const [a, b] = [room.join(), room.join()];
    create(a!, 'rect');
    room.flush();
    move(a!, 25);
    b!.h.dispatch({ type: 'DELETE_ELEMENTS', ids: [BOX] });
    room.flush();
    a!.h.undo();
    b!.h.undo();
  });

  queued('undo reaches a peer before its concurrent edit lands', (room) => {
    const [a, b] = [room.join(), room.join()];
    create(a!, 'rect');
    room.flush();
    move(a!, 25);
    b!.deliver();
    move(b!, 5);
    a!.h.undo();
    room.flush();
  });

  queued('three peers, undo of a field changed concurrently', (room) => {
    const [a, b, c] = [room.join(), room.join(), room.join()];
    create(a!, 'rect');
    room.flush();
    move(a!, 50);
    b!.deliver();
    c!.deliver();
    move(b!, 10);
    a!.h.undo();
    c!.deliver(1);
    recolor(c!, '#123456');
    room.flush();
    b!.h.undo();
  });

  queued('late joiner while messages are in flight', (room) => {
    const [a, b] = [room.join(), room.join()];
    create(a!, 'rect');
    room.flush();
    move(a!, 20);
    const c = room.join();
    recolor(b!, '#ff00ff');
    move(c, 0, 5);
    room.flush();
    a!.h.undo();
  });

  return s;
}

export function buildLive(lifted: ReadonlyArray<[string, Session]>): Family {
  const fam = new Family('live', {
    sceneEncoding: SCENE_ENCODING,
    traceEncoding: TRACE_ENCODING,
    room:
      'output.final[i] is peer i final scene; converged = every peer in the room has structurally equal elements ' +
      '(selection, appState and viewport are per-user). Lifted test traces from History instances not wired to a ' +
      'room (realtime.test) carry converged only as information.',
  });
  const divergent: string[] = [];

  for (const [testName, session] of lifted) {
    const { input, output } = traceCase(session.steps);
    const final = session.peers.map((p) => p.present);
    const converged = final.every((scene) => sameElements(scene, final[0]!));
    fam.add(`test: ${testName}`, 'History', input, {
      ...output,
      final: final.map(encodeScene),
      converged,
    });
    if (!converged && testName.startsWith('live sync'))
      divergent.push(testName);
  }

  for (const [name, queuedRoom, run] of sessions()) {
    let result: Outcome | null = null;
    const session = recordTrace(() => {
      const room = new Room(queuedRoom);
      run(room);
      result = outcome(room);
    });
    const { final, converged } = result as unknown as Outcome;
    const { input, output } = traceCase(session.steps);
    fam.add(name, 'History', input, {
      ...output,
      final: final.map(encodeScene),
      converged,
    });
    if (!converged) divergent.push(name);
  }

  const stale = [
    ...divergent.filter((n) => !KNOWN_DIVERGENT.has(n)),
    ...[...KNOWN_DIVERGENT].filter((n) => !divergent.includes(n)),
  ];
  if (stale.length > 0) {
    throw new Error(`live: divergence list changed: ${stale.join(' | ')}`);
  }

  // The relay filter (which commands travel at all).
  const types: string[] = [...COMMAND_TYPES, 'UNDO', 'REDO', 'UNKNOWN_TYPE'];
  for (const type of types) {
    fam.add(
      `isSessionCommand ${type}`,
      'isSessionCommand',
      { command: { type } },
      isSessionCommand({ type }),
    );
    fam.add(
      `isEphemeralCommand ${type}`,
      'isEphemeralCommand',
      { type },
      isEphemeralCommand(type),
    );
  }
  fam.add(
    'isSessionCommand no type',
    'isSessionCommand',
    { command: {} } as Json,
    isSessionCommand({}),
  );
  for (const type of EPHEMERAL_COMMANDS) {
    if (!types.includes(type))
      throw new Error(`live: ${type} is not a command`);
  }
  return fam;
}
