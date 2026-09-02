/**
 * Registry so any entry point (link-join in `main.ts`, toolbar "Go live",
 * mobile bar) can reveal/hide the live-session UI — the editable name chip and
 * the people list — inside the toolbar / mobile action bar.
 *
 * Multiple callbacks are stored because both the desktop toolbar and the
 * mobile bar are always initialized; the right element is shown by the CSS
 * for the current device.
 *
 * Visibility follows connection status: the live UI is revealed only while a
 * live session is actually connected, and hidden again on disconnect, so no
 * empty button lingers when there is no live session.
 */
const revealFns: (() => void)[] = [];
const hideFns: (() => void)[] = [];

/** Register a callback that reveals live-session UI (toolbar / mobile bar). */
export function onLiveReveal(fn: () => void): void {
  revealFns.push(fn);
}

/** Register a callback that hides live-session UI (toolbar / mobile bar). */
export function onLiveHide(fn: () => void): void {
  hideFns.push(fn);
}

/** Show or hide the live-session UI based on the connection state. */
export function setLiveUI(connected: boolean): void {
  if (connected) {
    for (const fn of revealFns) fn();
  } else {
    for (const fn of hideFns) fn();
  }
}
