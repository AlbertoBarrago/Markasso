import type { PeerInfo } from './realtime';

export interface RemoteCursor {
  x: number;
  y: number;
  color: string;
  name: string;
}

/** Store of remote peers' cursors + the callback that sends our own cursor. */
const cursors = new Map<string, RemoteCursor>();
const listeners = new Set<() => void>();

let localSender: ((cursor: { x: number; y: number }) => void) | null = null;

// Throttle our own broadcasts so mousemove never floods the socket.
let lastSent = 0;
const CURSOR_THROTTLE_MS = 40;

function emit(): void {
  for (const listener of listeners) listener();
}

/** Register to be notified when remote cursors change (canvas re-render). */
export function subscribeCursors(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

/** Attach the live-session socket (sets a no-op when no session is active). */
export function setLocalCursorSender(
  send: ((cursor: { x: number; y: number }) => void) | null,
): void {
  localSender = send;
}

/** Called on local pointer move. Throttled; no-op when not in a live session. */
export function sendLocalCursor(x: number, y: number): void {
  if (!localSender) return;
  const now = performance.now();
  if (now - lastSent < CURSOR_THROTTLE_MS) return;
  lastSent = now;
  localSender({ x, y });
}

export function upsertRemoteCursor(
  id: string,
  cursor: { x: number; y: number; color: string; name: string },
): void {
  const prev = cursors.get(id);
  if (
    prev &&
    prev.x === cursor.x &&
    prev.y === cursor.y &&
    prev.color === cursor.color &&
    prev.name === cursor.name
  ) {
    return;
  }
  cursors.set(id, { ...cursor });
  emit();
}

/** Remove peers that left; refresh name/color from the authoritative peers list. */
export function syncRemotePeers(peers: readonly PeerInfo[]): void {
  const ids = new Set(peers.map((p) => p.id));
  let changed = false;
  for (const id of [...cursors.keys()]) {
    if (!ids.has(id)) {
      cursors.delete(id);
      changed = true;
    }
  }
  for (const peer of peers) {
    const c = cursors.get(peer.id);
    if (c && (c.color !== peer.color || c.name !== peer.name)) {
      c.color = peer.color;
      c.name = peer.name;
      changed = true;
    }
  }
  if (changed) emit();
}

export function clearCursors(): void {
  if (cursors.size === 0) return;
  cursors.clear();
  emit();
}

export function getRemoteCursors(): RemoteCursor[] {
  return [...cursors.values()];
}
