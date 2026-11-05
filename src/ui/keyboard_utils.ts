/** Returns true when keyboard focus is inside a UI panel (not the canvas). */
export function isFocusInPanel(): boolean {
  const active = document.activeElement as HTMLElement | null;
  if (!active || active === document.body) return false;

  // Keep global single-key shortcuts disabled while interacting with modal/panel UI.
  if (
    active.closest(
      '#context-panel, #library-panel, .settings-panel, #welcome-overlay, #whats-new-overlay, #shortcuts-help',
    )
  )
    return true;

  // Toolbar buttons should not disable shortcuts (regression after a11y focus updates).
  if (active.closest('.tb-btn')) return false;

  // Non-toolbar controls in toolbar islands (e.g. export menu items) keep blocking.
  return (
    active.closest('.tb-island, .tb-island-topright, .tb-island-topleft') !==
    null
  );
}

/**
 * Returns true while a modal dialog is shown. Dialogs are either removed from
 * the DOM or hidden with `display: none` when closed, so presence alone is not
 * enough: an element with no client rects is not rendered.
 */
export function isModalDialogOpen(): boolean {
  return [...document.querySelectorAll('[aria-modal="true"]')].some(
    (el) => el.getClientRects().length > 0,
  );
}

/**
 * Maps Cmd/Ctrl+O and Cmd/Ctrl+S to the board's file actions. Without this the
 * browser keeps its own meaning for them: Chrome's Cmd+O opens a native file
 * dialog that shows a `.markasso` file as raw JSON in a new tab, and Cmd+S
 * saves the page HTML instead of the board.
 */
export function fileShortcut(
  e: Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey'>,
): 'open' | 'save' | null {
  if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey) return null;
  const key = e.key.toLowerCase();
  if (key === 'o') return 'open';
  if (key === 's') return 'save';
  return null;
}
