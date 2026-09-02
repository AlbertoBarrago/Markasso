import type { Command } from '../commands/commands';

import { randomAnimalName } from './animal_names';

type UndoOp = { type: 'UNDO' | 'REDO' };

import type { Element } from '../elements/element';
import { isSessionCommand } from '../engine/ephemeral';
import type { History } from '../engine/history';
import {
  clearCursors,
  setLocalCursorSender,
  syncRemotePeers,
  upsertRemoteCursor,
} from './presence';

export interface PeerInfo {
  id: string;
  name: string;
  color: string;
}

export interface LiveOptions {
  roomId?: string;
  name?: string;
  color?: string;
  /** Current content to seed into a fresh room (only used when creating). */
  seedElements?: readonly Element[];
  onPeers?: (peers: PeerInfo[]) => void;
  onStatus?: (connected: boolean) => void;
}

interface InitMsg {
  type: 'init';
  self: string;
  commands: Command[];
  peers: PeerInfo[];
}
interface ApplyMsg {
  type: 'apply';
  command: Command | UndoOp;
  from: string;
}
interface CursorMsg {
  type: 'cursor';
  from: string;
  x: number;
  y: number;
  color: string;
  name: string;
}
interface PresenceMsg {
  type: 'presence';
  peers: PeerInfo[];
}
type ServerMsg = InitMsg | ApplyMsg | PresenceMsg | CursorMsg;

const LIVE_PARAM = 'live';
const NAME_KEY = 'markasso-live-name';
const CLIENT_ID_KEY = 'markasso-live-client-id';
const CLIENT_ID_RE = /^[a-zA-Z0-9_-]{8,64}$/;

/**
 * A stable, per-user identity persisted in localStorage. It is sent to the
 * server on every connect so a peer keeps their name/color across reconnects
 * and the server can enforce that a peer only ever modifies its own
 * properties. It is effectively a secret: only someone who knows it can
 * impersonate that peer.
 */
export function getClientId(): string {
  try {
    let id = localStorage.getItem(CLIENT_ID_KEY);
    if (!id || !CLIENT_ID_RE.test(id)) {
      id = crypto.randomUUID();
      localStorage.setItem(CLIENT_ID_KEY, id);
    }
    return id;
  } catch {
    return crypto.randomUUID();
  }
}

export function getStoredName(): string {
  try {
    const name = localStorage.getItem(NAME_KEY);
    return name?.trim() ? name.trim() : '';
  } catch {
    return '';
  }
}

export function setStoredName(name: string): void {
  try {
    localStorage.setItem(NAME_KEY, name.trim());
  } catch {
    /* ignore quota/private mode */
  }
}

export function getLiveRoomId(): string | null {
  const param = new URLSearchParams(location.search).get(LIVE_PARAM);
  return param && /^[a-zA-Z0-9_-]{3,64}$/.test(param) ? param : null;
}

export function buildLiveRoomUrl(roomId: string): string {
  const url = new URL(location.href);
  url.searchParams.set(LIVE_PARAM, roomId);
  return url.href;
}

export function generateRoomId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  const chars =
    'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  return Array.from(bytes, (byte) => chars[byte % chars.length] ?? '').join('');
}

const PALETTE = [
  '#a78bfa',
  '#f472b6',
  '#34d399',
  '#60a5fa',
  '#fbbf24',
  '#fb7185',
  '#22d3ee',
  '#a3e635',
];

function randomColor(): string {
  return PALETTE[Math.floor(Math.random() * PALETTE.length)] ?? '#a78bfa';
}

function randomName(): string {
  return randomAnimalName();
}

/** The active live session (if any), so the UI can update the peer's name. */
let activeSession: {
  self: PeerInfo;
  send: (msg: unknown) => void;
  emitPeers: () => void;
} | null = null;

/** Subscribers (the people list UIs) notified whenever presence changes. */
const peerListeners = new Set<(others: PeerInfo[], self: PeerInfo) => void>();

/** Subscribe to live-presence changes. Returns an unsubscribe function. */
export function onLivePeers(
  cb: (others: PeerInfo[], self: PeerInfo) => void,
): () => void {
  peerListeners.add(cb);
  return () => {
    peerListeners.delete(cb);
  };
}

/**
 * Update the current live session's display name and broadcast it to peers.
 * Persists the name locally and is a no-op when not in a live session.
 */
export function setLiveName(name: string): void {
  const trimmed = name.trim();
  if (!trimmed) return;
  setStoredName(trimmed);
  const session = activeSession;
  if (!session) return;
  session.self.name = trimmed;
  session.send({ type: 'presence', name: trimmed, color: session.self.color });
  session.emitPeers();
}

/**
 * Connect the given History to a live session. Local persistent commands are
 * forwarded to the room; commands from other peers are applied via
 * `history.applyRemote` (no undo pollution, no echo). Undo/redo are per-client
 * (model A) and never shared.
 */
const RECONNECT_BASE_MS = 1000;
const RECONNECT_MAX_MS = 10000;

export function joinLiveSession(
  history: History,
  opts: LiveOptions = {},
): void {
  const requestedRoomId = opts.roomId ?? getLiveRoomId();
  if (!requestedRoomId) return;
  const roomId: string = requestedRoomId;

  const peers = new Map<string, PeerInfo>();
  const isSeeder = opts.seedElements !== undefined;
  const seedElements = opts.seedElements ?? [];
  const self: PeerInfo = {
    id: '',
    name: opts.name ?? (getStoredName() || randomName()),
    color: opts.color ?? randomColor(),
  };
  let ws: WebSocket | null = null;
  let ready = false;
  let applyingRemote = false;
  let reconnectAttempt = 0;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  function send(msg: unknown): void {
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
  }

  const emitPeers = (): void => {
    const others = [...peers.values()];
    opts.onPeers?.(others);
    for (const cb of peerListeners) cb(others, self);
  };

  activeSession = { self, send, emitPeers };

  // When connected, our own pointer moves broadcast through this sender.
  // Registered once: it survives reconnects since `send` always targets the
  // current socket and is a no-op while disconnected.
  setLocalCursorSender((cursor) => {
    send({ type: 'cursor', ...cursor, name: self.name, color: self.color });
  });

  history.setOnCommand((command) => {
    if (!ready || applyingRemote || !isSessionCommand(command)) return;
    send({ type: 'command', command });
  });

  function applyPeers(list: PeerInfo[]): void {
    peers.clear();
    for (const peer of list) {
      if (peer.id !== self.id) peers.set(peer.id, peer);
    }
    emitPeers();
  }

  function isUndoOp(c: Command | UndoOp): c is UndoOp {
    return c.type === 'UNDO' || c.type === 'REDO';
  }

  function applyRemoteOrUndo(command: Command | UndoOp): void {
    if (isUndoOp(command)) {
      // Apply remote undo/redo, but never re-broadcast it back (echo guard).
      applyingRemote = true;
      try {
        if (command.type === 'UNDO') history.undo();
        else history.redo();
      } finally {
        applyingRemote = false;
      }
      return;
    }
    history.applyRemote(command);
  }

  function scheduleReconnect(): void {
    if (reconnectTimer) return;
    const delay = Math.min(
      RECONNECT_BASE_MS * 2 ** reconnectAttempt,
      RECONNECT_MAX_MS,
    );
    reconnectAttempt++;
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      connect();
    }, delay);
  }

  function connect(): void {
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const url = `${proto}//${location.host}/session/ws?room=${encodeURIComponent(roomId)}&clientId=${encodeURIComponent(getClientId())}`;
    const socket = new WebSocket(url);
    ws = socket;

    socket.onopen = () => {
      reconnectAttempt = 0;
      opts.onStatus?.(true);
      send({ type: 'presence', name: self.name, color: self.color });
    };

    socket.onmessage = (event: MessageEvent) => {
      let msg: ServerMsg;
      try {
        msg = JSON.parse(String(event.data)) as ServerMsg;
      } catch {
        return;
      }
      if (msg.type === 'init') {
        ready = true;
        self.id = msg.self;

        if (msg.commands.length > 0) {
          // Room already has content: it is authoritative — adopt it. On a
          // reconnect this also re-syncs anything missed while offline, at
          // the cost of any local edit made purely during the outage (never
          // reached the room log, so it isn't replayed).
          history.resetForLiveReplay(msg.commands);
        } else if (!isSeeder || seedElements.length === 0) {
          // Fresh/empty room and we have nothing to seed: start clean.
          history.resetForLiveReplay([]);
        }

        // Seeding: a brand-new room created from local content. Publish the
        // current elements so later joiners see them. Echo is suppressed by the
        // server, so the creator keeps the view they already had.
        if (isSeeder && msg.commands.length === 0) {
          for (const element of seedElements) {
            send({
              type: 'command',
              command: {
                type: 'CREATE_ELEMENT',
                element,
                select: false,
              },
            });
          }
        }

        applyPeers(msg.peers);
      } else if (msg.type === 'apply') {
        applyRemoteOrUndo(msg.command);
      } else if (msg.type === 'cursor') {
        upsertRemoteCursor(msg.from, {
          x: msg.x,
          y: msg.y,
          color: msg.color,
          name: msg.name,
        });
      } else if (msg.type === 'presence') {
        applyPeers(msg.peers);
        syncRemotePeers(msg.peers);
      }
    };

    socket.onclose = () => {
      ready = false;
      clearCursors();
      opts.onStatus?.(false);
      scheduleReconnect();
    };
    socket.onerror = () => {
      try {
        socket.close();
      } catch {
        /* noop */
      }
    };
  }

  connect();
}
