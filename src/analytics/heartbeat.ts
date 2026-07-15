import { track } from './track';

const HEARTBEAT_INTERVAL_MS = 30_000;

/**
 * Emits a heartbeat event every 30s while the tab is visible, so session
 * duration can be approximated from heartbeat count in Grafana. Pauses
 * automatically when the tab is hidden/backgrounded instead of running on
 * a plain setInterval, to avoid inflating "active time" for idle tabs.
 */
export function startHeartbeat(): void {
  let timer: ReturnType<typeof setInterval> | null = null;

  function beat(): void {
    track('session_heartbeat');
  }

  function start(): void {
    if (timer !== null) return;
    beat();
    timer = setInterval(beat, HEARTBEAT_INTERVAL_MS);
  }

  function stop(): void {
    if (timer === null) return;
    clearInterval(timer);
    timer = null;
  }

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') start();
    else stop();
  });

  if (document.visibilityState === 'visible') start();
}
