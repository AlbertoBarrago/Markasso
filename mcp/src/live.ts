import type { Command } from '../../src/commands/commands';
import { isSessionCommand } from '../../src/engine/ephemeral';
import type { Diagram } from './diagram';
import { markassoBaseUrl } from './storage';

/**
 * Joins a Markasso live room as a peer, speaking the same WebSocket protocol
 * as the app (src/io/realtime.ts): the room's command log is replayed into
 * the diagram's History, remote commands are applied as they arrive, and
 * every local command is forwarded. People in the room see the agent in the
 * participant list and its cursor moving to where it works.
 */

export interface PeerInfo {
  readonly id: string;
  readonly name: string;
  readonly color: string;
}

type UndoOp = { type: 'UNDO' | 'REDO' };

type ServerMsg =
  | { type: 'init'; self: string; commands: Command[]; peers: PeerInfo[] }
  | { type: 'apply'; command: Command | UndoOp; from: string }
  | { type: 'presence'; peers: PeerInfo[] }
  | { type: 'cursor' };

const ROOM_ID = /^[a-zA-Z0-9_-]{3,64}$/;
const AGENT_COLOR = '#c77dff';
const JOIN_TIMEOUT_MS = 10_000;

function isUndoOp(command: Command | UndoOp): command is UndoOp {
  return command.type === 'UNDO' || command.type === 'REDO';
}

export class LiveError extends Error {
  override name = 'LiveError';
}

/** Room id and app origin from a live link (`...?live=<room>`) or a bare id. */
export function parseLiveLink(link: string): { room: string; origin: string } {
  const trimmed = link.trim();
  if (ROOM_ID.test(trimmed))
    return { room: trimmed, origin: markassoBaseUrl() };
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new LiveError(
      'Expected a Markasso live link (…?live=<room>) or a room id.',
    );
  }
  const room = url.searchParams.get('live');
  if (!room || !ROOM_ID.test(room)) {
    throw new LiveError('The link has no valid "live" room parameter.');
  }
  return { room, origin: url.origin };
}

function randomClientId(): string {
  const alphabet =
    'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
}

export interface JoinResult {
  readonly link: LiveLink;
  /** True when the room was empty and the agent published its diagram. */
  readonly seeded: boolean;
  /** Elements the agent had locally and dropped to adopt the room. */
  readonly discarded: number;
}

export class LiveLink {
  readonly room: string;
  readonly url: string;
  private socket: WebSocket | null = null;
  private peers: PeerInfo[] = [];
  private selfId = '';
  private open = false;
  /** Set while replaying a remote undo/redo, which History re-emits. */
  private applyingRemote = false;

  private constructor(
    private readonly diagram: Diagram,
    room: string,
    origin: string,
    private readonly name: string,
  ) {
    this.room = room;
    this.url = `${origin}/?live=${encodeURIComponent(room)}`;
  }

  static async join(
    diagram: Diagram,
    link: string,
    name: string,
  ): Promise<JoinResult> {
    const { room, origin } = parseLiveLink(link);
    const live = new LiveLink(diagram, room, origin, name);
    const result = await live.connect(origin);
    return { link: live, ...result };
  }

  get connected(): boolean {
    return this.open;
  }

  /** Other people currently in the room. */
  get otherPeers(): ReadonlyArray<PeerInfo> {
    return this.peers.filter((p) => p.id !== this.selfId);
  }

  private send(message: unknown): void {
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(message));
    }
  }

  private connect(
    origin: string,
  ): Promise<{ seeded: boolean; discarded: number }> {
    const wsOrigin = origin.replace(/^http/, 'ws');
    const socket = new WebSocket(
      `${wsOrigin}/session/ws?room=${encodeURIComponent(this.room)}&clientId=${randomClientId()}`,
    );
    this.socket = socket;
    const history = this.diagram.history;

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        socket.close();
        reject(new LiveError('Timed out joining the live room.'));
      }, JOIN_TIMEOUT_MS);

      socket.addEventListener('open', () => {
        this.send({ type: 'presence', name: this.name, color: AGENT_COLOR });
      });

      socket.addEventListener('message', (event) => {
        let msg: ServerMsg;
        try {
          msg = JSON.parse(String(event.data)) as ServerMsg;
        } catch {
          return;
        }
        if (msg.type === 'init') {
          clearTimeout(timer);
          this.selfId = msg.self;
          this.peers = msg.peers;
          const local = [...this.diagram.elements];
          let seeded = false;
          let discarded = 0;
          if (msg.commands.length > 0) {
            // The room is authoritative, as in the app.
            discarded = local.length;
            history.resetForLiveReplay(msg.commands);
          } else if (local.length > 0) {
            // Empty room: publish what the agent already drew.
            this.send({
              type: 'command',
              command: { type: 'CREATE_ELEMENTS', elements: local },
            });
            seeded = true;
          }
          history.setOnCommand((command) => {
            if (
              this.open &&
              !this.applyingRemote &&
              isSessionCommand(command)
            ) {
              this.send({ type: 'command', command });
            }
          });
          this.open = true;
          resolve({ seeded, discarded });
        } else if (msg.type === 'apply') {
          const command = msg.command;
          if (isUndoOp(command)) {
            // History emits the undo/redo again: don't echo it to the room.
            this.applyingRemote = true;
            try {
              if (command.type === 'UNDO') history.undo();
              else history.redo();
            } finally {
              this.applyingRemote = false;
            }
          } else {
            history.applyRemote(command);
          }
        } else if (msg.type === 'presence') {
          this.peers = msg.peers;
        }
      });

      socket.addEventListener('close', () => {
        clearTimeout(timer);
        if (!this.open)
          reject(new LiveError('The live room closed the connection.'));
        this.open = false;
        history.setOnCommand(undefined);
      });
      socket.addEventListener('error', () => {
        if (!this.open) {
          clearTimeout(timer);
          reject(new LiveError('Could not connect to the live room.'));
        }
      });
    });
  }

  /** Moves the agent's cursor so people see where it is working. */
  pointAt(x: number, y: number): void {
    this.send({ type: 'cursor', x, y, name: this.name, color: AGENT_COLOR });
  }

  leave(): void {
    this.open = false;
    this.diagram.history.setOnCommand(undefined);
    this.socket?.close();
    this.socket = null;
  }
}
