/**
 * Traps keyboard focus within `container`.
 * Wraps Tab and Shift+Tab to cycle within the container.
 * Returns a teardown function that removes the listener.
 */
export function trapFocus(container: HTMLElement): () => void {
  const FOCUSABLE =
    'button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex="0"]';

  const handler = (e: KeyboardEvent): void => {
    if (e.key !== 'Tab') return;
    const focusable = [...container.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
      (el) => el.offsetParent !== null
    );
    if (focusable.length === 0) return;
    const first = focusable[0]!;
    const last = focusable[focusable.length - 1]!;
    if (e.shiftKey) {
      if (document.activeElement === first) {
        e.preventDefault();
        last.focus();
      }
    } else {
      if (document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  };

  container.addEventListener('keydown', handler);
  return () => container.removeEventListener('keydown', handler);
}

/**
 * Enables arrow-key navigation within a group of buttons (roving tabIndex pattern).
 * The caller is responsible for keeping `tabIndex=0` on the correct item via sync().
 * Returns a teardown function.
 */
export function rovingTabIndex(
  container: HTMLElement,
  selector: string,
  direction: 'horizontal' | 'vertical' = 'horizontal'
): () => void {
  const handler = (e: KeyboardEvent): void => {
    const prevKey = direction === 'horizontal' ? 'ArrowLeft' : 'ArrowUp';
    const nextKey = direction === 'horizontal' ? 'ArrowRight' : 'ArrowDown';
    if (e.key !== prevKey && e.key !== nextKey) return;

    const items = [...container.querySelectorAll<HTMLElement>(selector)].filter(
      (el) => el.offsetParent !== null && !(el as HTMLButtonElement).disabled
    );
    const current = items.indexOf(document.activeElement as HTMLElement);
    if (current === -1) return;

    e.preventDefault();
    e.stopPropagation();
    const delta = e.key === prevKey ? -1 : 1;
    const next = (current + delta + items.length) % items.length;
    items.forEach((item, i) => { item.tabIndex = i === next ? 0 : -1; });
    items[next]?.focus();
  };

  container.addEventListener('keydown', handler);
  return () => container.removeEventListener('keydown', handler);
}

/** Returns true when keyboard focus is inside a UI panel (not the canvas). */
export function isFocusInPanel(): boolean {
  const active = document.activeElement;
  if (!active || active === document.body) return false;
  return (
    active.closest(
      '#context-panel, .settings-panel, .tb-island, .tb-island-bottomleft, ' +
      '.tb-island-topright, .tb-island-topleft, #welcome-overlay'
    ) !== null
  );
}
