import type { History } from '../engine/history';
import { t } from '../i18n';
import { confirmDialog } from './dialog';

/** The undo shortcut as the user's platform writes it. */
function undoShortcut(): string {
  return /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘Z' : 'Ctrl+Z';
}

/**
 * Asks before clearing the canvas, then deletes every element as one
 * undoable step. The menu and the command palette both go through here.
 * Resolves true when the canvas was cleared.
 */
export async function clearCanvas(history: History): Promise<boolean> {
  if (history.present.elements.length === 0) return false;
  const confirmed = await confirmDialog({
    title: t('clearCanvasTitle'),
    message: t('clearCanvasMessage').replace('{shortcut}', undoShortcut()),
    confirmKey: 'clearCanvasConfirm',
    danger: true,
  });
  // Read the scene again: a live peer may have drawn while the dialog was open.
  const ids = history.present.elements.map((element) => element.id);
  if (!confirmed || ids.length === 0) return false;
  history.dispatch({ type: 'DELETE_ELEMENTS', ids });
  return true;
}
