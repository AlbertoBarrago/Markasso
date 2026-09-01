import type { Command } from '../commands/commands';
import { isSessionCommand } from '../engine/ephemeral';
import type { History } from '../engine/history';

export interface PeerInfo {
  id: string;
  name: string;
  color: string;
}

export interface LiveOptions {
  roomId?: string;
  name?: string;
  color?: string;
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
  command: Command;
  from: string;
}
interface PresenceMsg {
  type: 'presence';
  peers: PeerInfo[];
}
type ServerMsg = InitMsg | ApplyMsg | PresenceMsg;

const LIVE_PARAM = 'live';

export function getLiveRoomId(): string | null {
  const param = new URLSearchParams(location.search).get(LIVE_PARAM);
  return param && /^[a-zA-Z0-9_-]{3,64}$/.test(param) ? param : null;
}

export function buildLiveRoomUrl(roomId: string): string {
  const url = new URL(location.href);
  url.searchParams.set(LIVE_PARAM, roomId);
  return url.href;
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
  return `Guest${Math.floor(10 + Math.random() * 90)}`;
}

/**
 * Connect the given History to a live session. Local persistent commands are
 * forwarded to the room; commands from other peers are applied via
 * `history.applyRemote` (no undo pollution, no echo). Undo/redo are per-client
 * (model A) and never shared.
 */
export function joinLiveSession(
  history: History,
  opts: LiveOptions = {},
): void {
  const roomId = opts.roomId ?? getLiveRoomId();
  if (!roomId) return;

  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const url = `${proto}//${location.host}/session/ws?room=${encodeURIComponent(roomId)}`;
  const ws = new WebSocket(url);
  const peers = new Map<string, PeerInfo>();
  const self: PeerInfo = {
    id: '',
    name: opts.name ?? randomName(),
    color: opts.color ?? randomColor(),
  };
  let ready = false;

  function send(msg: unknown): void {
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
  }

  history.setOnCommand((command) => {
    if (!ready || !isSessionCommand(command)) return;
    send({ type: 'command', command });
  });

  ws.onopen = () => {
    opts.onStatus?.(true);
    send({ type: 'presence', name: self.name, color: self.color });
  };

  ws.onmessage = (event: MessageEvent) => {
    let msg: ServerMsg;
    try {
      msg = JSON.parse(String(event.data)) as ServerMsg;
    } catch {
      return;
    }
    if (msg.type === 'init') {
      ready = true;
      self.id = msg.self;
      history.resetForLiveReplay(msg.commands);
      applyPeers(msg.peers);
    } else if (msg.type === 'apply') {
      history.applyRemote(msg.command);
    } else if (msg.type === 'presence') {
      applyPeers(msg.peers);
    }
  };

  ws.onclose = () => {
    ready = false;
    opts.onStatus?.(false);
  };
  ws.onerror = () => {
    try {
      ws.close();
    } catch {
      /* noop */
    }
  };

  function applyPeers(list: PeerInfo[]): void {
    peers.clear();
    for (const peer of list) {
      if (peer.id !== self.id) peers.set(peer.id, peer);
    }
    opts.onPeers?.([...peers.values()]);
  }
}
