/** Returns true when keyboard focus is inside a UI panel (not the canvas). */
export function isFocusInPanel(): boolean {
  const active = document.activeElement as HTMLElement | null;
  if (!active || active === document.body) return false;

  // Keep global single-key shortcuts disabled while interacting with modal/panel UI.
  if (active.closest('#context-panel, .settings-panel, #welcome-overlay, #shortcuts-help')) return true;

  // Toolbar buttons should not disable shortcuts (regression after a11y focus updates).
  if (active.closest('.tb-btn')) return false;

  // Non-toolbar controls in toolbar islands (e.g. export menu items) keep blocking.
  return active.closest('.tb-island, .tb-island-bottomleft, .tb-island-topright, .tb-island-topleft') !== null;
}
