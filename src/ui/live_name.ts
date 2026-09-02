/**
 * Tiny registry so the link-join path in `main.ts` can reveal the editable
 * "your name" chip that lives inside the toolbar / mobile action bar.
 */
let showChip: (() => void) | null = null;

/** Register the UI's name-chip reveal callback (toolbar / mobile bar). */
export function registerLiveNameChip(fn: () => void): void {
  showChip = fn;
}

/** Reveal the name chip (called when joining a live session via a link). */
export function showLiveNameChip(): void {
  showChip?.();
}
