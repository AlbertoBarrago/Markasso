import type { History } from '../engine/history';
import type { SelectTool } from '../tools/select_tool';
import type { Element } from '../elements/element';
import { fitToElements } from '../core/viewport';
import { isFocusInPanel } from './keyboard_utils';
import { elementClipboard } from '../core/clipboard';

export function initShortcuts(history: History, selectTool: SelectTool): void {
  const shortcuts = new Map<string, () => void>([
    ['h', () => history.dispatch({ type: 'SET_TOOL', tool: 'hand' })],
    ['v', () => history.dispatch({ type: 'SET_TOOL', tool: 'select' })],
    ['1', () => history.dispatch({ type: 'SET_TOOL', tool: 'select' })],
    ['r', () => history.dispatch({ type: 'SET_TOOL', tool: 'rectangle' })],
    ['2', () => history.dispatch({ type: 'SET_TOOL', tool: 'rectangle' })],
    ['e', () => history.dispatch({ type: 'SET_TOOL', tool: 'ellipse' })],
    ['3', () => history.dispatch({ type: 'SET_TOOL', tool: 'ellipse' })],
    ['a', () => history.dispatch({ type: 'SET_TOOL', tool: 'arrow' })],
    ['5', () => history.dispatch({ type: 'SET_TOOL', tool: 'arrow' })],
    ['l', () => history.dispatch({ type: 'SET_TOOL', tool: 'line' })],
    ['6', () => history.dispatch({ type: 'SET_TOOL', tool: 'line' })],
    ['p', () => history.dispatch({ type: 'SET_TOOL', tool: 'freehand' })],
    ['7', () => history.dispatch({ type: 'SET_TOOL', tool: 'freehand' })],
    ['t', () => history.dispatch({ type: 'SET_TOOL', tool: 'text' })],
    ['8', () => history.dispatch({ type: 'SET_TOOL', tool: 'text' })],
    ['d', () => history.dispatch({ type: 'SET_TOOL', tool: 'rombo' })],
    ['4', () => history.dispatch({ type: 'SET_TOOL', tool: 'rombo' })],
    ['0', () => history.dispatch({ type: 'SET_TOOL', tool: 'eraser' })],
    ['g', () => history.dispatch({ type: 'TOGGLE_GRID' })],
  ]);

  // Space bar handling: hold to activate hand tool temporarily
  let spacePressed = false;
  let previousTool: string | null = null;

  window.addEventListener('keydown', (e) => {
    // Don't capture shortcuts when typing in an input/textarea/select
    const target = e.target as HTMLElement;
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT') return;
    // Block single-key shortcuts when focus is inside a UI panel; allow modifier combos (Ctrl/Cmd+…)
    if (isFocusInPanel() && !e.ctrlKey && !e.metaKey) return;

    // Space bar: activate hand tool while pressed
    if (e.key === ' ' && !e.ctrlKey && !e.metaKey) {
      // Keep native Space activation on focused controls (buttons/menu items).
      // This avoids stealing Space from toolbar buttons after a11y focus updates.
      if (target.closest('button, [role="button"], [role="menuitem"]')) return;
      e.preventDefault();
      if (!spacePressed) {
        spacePressed = true;
        previousTool = history.present.appState.activeTool;
        history.dispatch({ type: 'SET_TOOL', tool: 'hand' });
      }
      return;
    }

    // Escape: tool switch or delegate group exit to SelectTool
    if (e.key === 'Escape') {
      if (history.present.appState.activeTool !== 'select') {
        history.dispatch({ type: 'SET_TOOL', tool: 'select' });
      }
      // SelectTool.onKeyDown handles CLEAR_SELECTION and group exit
      return;
    }

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

    // Ctrl+D — duplicate selected elements with a small offset
    if ((e.ctrlKey || e.metaKey) && e.key === 'd') {
      e.preventDefault();
      const scene = history.present;
      const selectedEls = scene.elements.filter((el) => scene.selectedIds.has(el.id));
      const newIds: string[] = [];
      for (const el of selectedEls) {
        const newId = crypto.randomUUID();
        newIds.push(newId);
        history.dispatch({ type: 'CREATE_ELEMENT', element: { ...el, id: newId } });
        history.dispatch({ type: 'MOVE_ELEMENT', id: newId, dx: 20, dy: 20 });
      }
      if (newIds.length > 0) history.dispatch({ type: 'SELECT_ELEMENTS', ids: newIds });
      return;
    }

    // Ctrl+C — copy selected elements to internal clipboard
    if ((e.ctrlKey || e.metaKey) && e.key === 'c') {
      if (window.getSelection()?.toString()) return; // let browser handle text selection copy
      const scene = history.present;
      const selected = scene.elements.filter((el) => scene.selectedIds.has(el.id));
      if (selected.length > 0) {
        elementClipboard.elements = selected;
        elementClipboard.pasteCount = 0;
      }
      return;
    }

    // Ctrl+V — paste elements from internal clipboard
    if ((e.ctrlKey || e.metaKey) && e.key === 'v') {
      const { elements } = elementClipboard;
      if (elements.length > 0) {
        e.preventDefault();
        elementClipboard.pasteCount += 1;
        const offset = elementClipboard.pasteCount * 20;
        const idMap = new Map(elements.map((el) => [el.id, crypto.randomUUID()]));
        const newElements: Element[] = elements.map((el) => {
          const newId = idMap.get(el.id)!;
          if (el.type === 'freehand') {
            return { ...el, id: newId, x: el.x + offset, y: el.y + offset,
                     points: el.points.map(([px, py]) => [px + offset, py + offset] as const) };
          }
          if (el.type === 'line' || el.type === 'arrow') {
            return { ...el, id: newId, x: el.x + offset, y: el.y + offset,
                     x2: el.x2 + offset, y2: el.y2 + offset };
          }
          return { ...el, id: newId, x: el.x + offset, y: el.y + offset };
        });
        history.dispatch({ type: 'CREATE_ELEMENTS', elements: newElements });
        return;
      }
      // no internal clipboard → fall through to native paste (image paste)
    }

    // Ctrl+Shift+] — bring to front
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === ']') {
      e.preventDefault();
      const scene = history.present;
      const ids = [...scene.selectedIds];
      if (ids.length > 0) {
        history.dispatch({ type: 'REORDER_ELEMENTS', ids, targetIndex: scene.elements.length });
      }
      return;
    }

    // Ctrl+Shift+[ — send to back
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === '[') {
      e.preventDefault();
      const scene = history.present;
      const ids = [...scene.selectedIds];
      if (ids.length > 0) {
        history.dispatch({ type: 'REORDER_ELEMENTS', ids, targetIndex: 0 });
      }
      return;
    }

    // Ctrl+G — group selected elements
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key === 'g') {
      e.preventDefault();
      const ids = [...history.present.selectedIds];
      if (ids.length > 1) {
        history.dispatch({ type: 'GROUP_ELEMENTS', ids, groupId: crypto.randomUUID() });
      }
      return;
    }

    // Ctrl+Shift+G — ungroup
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'G') {
      e.preventDefault();
      const scene = history.present;
      const groupIds = new Set(
        [...scene.selectedIds]
          .map((id) => scene.elements.find((el) => el.id === id)?.groupId)
          .filter((gid): gid is string => gid !== undefined)
      );
      for (const groupId of groupIds) {
        history.dispatch({ type: 'UNGROUP_ELEMENTS', groupId });
      }
      // Clear activeGroupId on the select tool
      selectTool.activeGroupId = null;
      return;
    }

    if (e.key === '\\') {
      document.body.classList.toggle('ui-hidden');
      return;
    }

    if (e.key === 'f' || e.key === 'F') {
      const vp = fitToElements(history.present.elements, window.innerWidth, window.innerHeight);
      history.dispatch({ type: 'SET_VIEWPORT', offsetX: vp.offsetX, offsetY: vp.offsetY, zoom: vp.zoom });
      return;
    }
    if (e.key === '0' && e.shiftKey) {
      history.dispatch({ type: 'SET_VIEWPORT', offsetX: 0, offsetY: 0, zoom: 1 });
      return;
    }

    const fn = shortcuts.get(e.key.toLowerCase());
    if (fn) fn();
  });

  // Release space bar: restore previous tool
  window.addEventListener('keyup', (e) => {
    if (e.key === ' ' && spacePressed) {
      spacePressed = false;
      if (previousTool && previousTool !== 'hand') {
        history.dispatch({ type: 'SET_TOOL', tool: previousTool as any });
        previousTool = null;
      }
    }
  });
}
