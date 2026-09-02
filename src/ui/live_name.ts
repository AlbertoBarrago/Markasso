/**
 * Registry so any entry point (link-join in `main.ts`, toolbar "Go live",
 * mobile bar) can reveal the live-session UI — the editable name chip and the
 * people list — inside the toolbar / mobile action bar.
 *
 * Multiple callbacks are stored because both the desktop toolbar and the
 * mobile bar are always initialized; the right element is shown by the CSS
 * for the current device.
 */
const revealFns: (() => void)[] = [];

/** Register a callback that reveals live-session UI (toolbar / mobile bar). */
export function onLiveReveal(fn: () => void): void {
  revealFns.push(fn);
}

/** Reveal all live-session UI (called when a live session is established). */
export function revealLiveUI(): void {
  for (const fn of revealFns) fn();
}
