import type { History } from '../engine/history';

export function initShortcuts(history: History): void {
  const shortcuts = new Map<string, () => void>([
    ['v', () => history.dispatch({ type: 'SET_TOOL', tool: 'select' })],
    ['r', () => history.dispatch({ type: 'SET_TOOL', tool: 'rectangle' })],
    ['e', () => history.dispatch({ type: 'SET_TOOL', tool: 'ellipse' })],
    ['l', () => history.dispatch({ type: 'SET_TOOL', tool: 'line' })],
    ['a', () => history.dispatch({ type: 'SET_TOOL', tool: 'arrow' })],
    ['p', () => history.dispatch({ type: 'SET_TOOL', tool: 'freehand' })],
    ['t', () => history.dispatch({ type: 'SET_TOOL', tool: 'text' })],
    ['g', () => history.dispatch({ type: 'TOGGLE_GRID' })],
    ['Escape', () => {
      history.dispatch({ type: 'SET_TOOL', tool: 'select' });
      history.dispatch({ type: 'CLEAR_SELECTION' });
    }],
  ]);

  window.addEventListener('keydown', (e) => {
    // Don't capture shortcuts when typing in an input/textarea
    const target = e.target as HTMLElement;
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;

    if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
      e.preventDefault();
      history.undo();
      return;
    }
    if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.shiftKey && e.key === 'z'))) {
      e.preventDefault();
      history.redo();
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
      e.preventDefault();
      const ids = history.present.elements.map((el) => el.id);
      if (ids.length > 0) history.dispatch({ type: 'SELECT_ELEMENTS', ids });
      return;
    }

    const fn = shortcuts.get(e.key.toLowerCase());
    if (fn) fn();
  });
}
