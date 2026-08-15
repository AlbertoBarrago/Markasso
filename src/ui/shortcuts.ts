import type { ActiveTool } from '../core/app_state';
import {
  ELEMENT_CLIPBOARD_MIME,
  ELEMENT_CLIPBOARD_TEXT_PREFIX,
  serializeElementClipboard,
} from '../core/clipboard';
import { fitToElements } from '../core/viewport';
import { cloneElementsWithOffset } from '../elements/clone';
import type { History } from '../engine/history';
import { validateElements } from '../io/element_validation';
import type { SelectTool } from '../tools/select_tool';
import { isFocusInPanel } from './keyboard_utils';

export function initShortcuts(history: History, selectTool: SelectTool): void {
  let pasteCount = 0;
  const shortcuts = new Map<string, () => void>([
    ['h', () => history.dispatch({ type: 'SET_TOOL', tool: 'hand' })],
    ['v', () => history.dispatch({ type: 'SET_TOOL', tool: 'select' })],
    ['1', () => history.dispatch({ type: 'SET_TOOL', tool: 'select' })],
    ['r', () => history.dispatch({ type: 'SET_TOOL', tool: 'rectangle' })],
    ['2', () => history.dispatch({ type: 'SET_TOOL', tool: 'rectangle' })],
    ['e', () => history.dispatch({ type: 'SET_TOOL', tool: 'ellipse' })],
    ['4', () => history.dispatch({ type: 'SET_TOOL', tool: 'ellipse' })],
    ['a', () => history.dispatch({ type: 'SET_TOOL', tool: 'line' })],
    ['5', () => history.dispatch({ type: 'SET_TOOL', tool: 'line' })],
    ['l', () => history.dispatch({ type: 'SET_TOOL', tool: 'line' })],
    ['p', () => history.dispatch({ type: 'SET_TOOL', tool: 'freehand' })],
    ['6', () => history.dispatch({ type: 'SET_TOOL', tool: 'freehand' })],
    ['t', () => history.dispatch({ type: 'SET_TOOL', tool: 'text' })],
    ['7', () => history.dispatch({ type: 'SET_TOOL', tool: 'text' })],
    ['n', () => history.dispatch({ type: 'SET_TOOL', tool: 'sticky' })],
    ['d', () => history.dispatch({ type: 'SET_TOOL', tool: 'rombo' })],
    ['3', () => history.dispatch({ type: 'SET_TOOL', tool: 'rombo' })],
    ['0', () => history.dispatch({ type: 'SET_TOOL', tool: 'eraser' })],
    ['g', () => history.dispatch({ type: 'TOGGLE_GRID' })],
  ]);

  // Space bar handling: hold to activate hand tool temporarily
  let spacePressed = false;
  let previousTool: ActiveTool | null = null;

  window.addEventListener('keydown', (e) => {
    // Don't capture shortcuts when typing in an input/textarea/select/contenteditable
    const target = e.target as HTMLElement;
    if (
      target.tagName === 'INPUT' ||
      target.tagName === 'TEXTAREA' ||
      target.tagName === 'SELECT' ||
      target.isContentEditable
    )
      return;
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

    const key = e.key.toLowerCase();
    if (
      (e.ctrlKey || e.metaKey) &&
      (key === 'y' || (e.shiftKey && key === 'z'))
    ) {
      e.preventDefault();
      history.redo();
      return;
    }
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && key === 'z') {
      e.preventDefault();
      history.undo();
      return;
    }
    if ((e.ctrlKey || e.metaKey) && key === 'a') {
      e.preventDefault();
      const ids = history.present.elements.map((el) => el.id);
      if (ids.length > 0) history.dispatch({ type: 'SELECT_ELEMENTS', ids });
      return;
    }

    // Delete/Backspace alone — delete selected unlocked elements.
    // Escape is the non-destructive way to clear selection.
    if (
      (e.key === 'Delete' || e.key === 'Backspace') &&
      !e.metaKey &&
      !e.ctrlKey &&
      !e.shiftKey &&
      !e.altKey
    ) {
      e.preventDefault();
      const scene = history.present;
      const ids = [...scene.selectedIds].filter((id) => {
        const el = scene.elements.find((el) => el.id === id);
        return el && !el.locked;
      });
      if (ids.length > 0) {
        history.dispatch({ type: 'DELETE_ELEMENTS', ids });
      }
      history.dispatch({ type: 'SET_TOOL', tool: 'select' });
      return;
    }

    // Cmd/Ctrl+Delete/Backspace — delete selected elements regardless of active tool
    if (
      (e.metaKey || e.ctrlKey) &&
      (e.key === 'Delete' || e.key === 'Backspace')
    ) {
      const scene = history.present;
      const ids = [...scene.selectedIds].filter((id) => {
        const el = scene.elements.find((el) => el.id === id);
        return el && !el.locked;
      });
      if (ids.length > 0) {
        e.preventDefault();
        history.dispatch({ type: 'DELETE_ELEMENTS', ids });
        return;
      }
    }

    // Ctrl+D — duplicate selected elements with a small offset
    if ((e.ctrlKey || e.metaKey) && key === 'd') {
      e.preventDefault();
      const scene = history.present;
      const selectedEls = scene.elements.filter((el) =>
        scene.selectedIds.has(el.id),
      );
      const newElements = cloneElementsWithOffset(selectedEls, 20, 20);
      if (newElements.length > 0)
        history.dispatch({ type: 'CREATE_ELEMENTS', elements: newElements });
      return;
    }

    // Ctrl+Alt+C (Cmd+Alt+C) — copy style of first selected element (format painter)
    if ((e.ctrlKey || e.metaKey) && e.altKey && key === 'c') {
      e.preventDefault();
      const scene = history.present;
      const selected = scene.elements.filter((el) =>
        scene.selectedIds.has(el.id),
      );
      if (selected.length > 0 && selected[0]) {
        selectTool.activateFormatPainter(selected[0]);
      }
      return;
    }

    // Ctrl+Shift+] — bring to front
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === ']') {
      e.preventDefault();
      const scene = history.present;
      const ids = [...scene.selectedIds];
      if (ids.length > 0) {
        history.dispatch({
          type: 'REORDER_ELEMENTS',
          ids,
          targetIndex: scene.elements.length,
        });
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
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && key === 'g') {
      e.preventDefault();
      const ids = [...history.present.selectedIds];
      if (ids.length > 1) {
        history.dispatch({
          type: 'GROUP_ELEMENTS',
          ids,
          groupId: crypto.randomUUID(),
        });
      }
      return;
    }

    // Ctrl+Shift+G — ungroup
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && key === 'g') {
      e.preventDefault();
      const scene = history.present;
      const groupIds = new Set(
        [...scene.selectedIds]
          .map((id) => scene.elements.find((el) => el.id === id)?.groupId)
          .filter((gid): gid is string => gid !== undefined),
      );
      for (const groupId of groupIds) {
        history.dispatch({ type: 'UNGROUP_ELEMENTS', groupId });
      }
      // Clear activeGroupId on the select tool
      selectTool.activeGroupId = null;
      return;
    }

    // Ctrl+Shift+L — toggle lock on selected elements (e.code = layout-independent)
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.code === 'KeyL') {
      e.preventDefault();
      const scene = history.present;
      const ids = [...scene.selectedIds];
      if (ids.length > 0) {
        const allLocked = ids.every(
          (id) => scene.elements.find((el) => el.id === id)?.locked,
        );
        history.dispatch({
          type: allLocked ? 'UNLOCK_ELEMENTS' : 'LOCK_ELEMENTS',
          ids,
        });
      }
      return;
    }

    if (e.key === '\\') {
      document.body.classList.toggle('ui-hidden');
      return;
    }

    if (e.key === 'f' || e.key === 'F') {
      const vp = fitToElements(
        history.present.elements,
        window.innerWidth,
        window.innerHeight,
      );
      history.dispatch({
        type: 'SET_VIEWPORT',
        offsetX: vp.offsetX,
        offsetY: vp.offsetY,
        zoom: vp.zoom,
      });
      return;
    }
    if (e.key === '0' && e.shiftKey) {
      history.dispatch({
        type: 'SET_VIEWPORT',
        offsetX: 0,
        offsetY: 0,
        zoom: 1,
      });
      return;
    }

    if (!e.ctrlKey && !e.metaKey && !e.altKey) {
      const fn = shortcuts.get(e.key.toLowerCase());
      if (fn) fn();
    }
  });

  // Release space bar: restore previous tool
  window.addEventListener('keyup', (e) => {
    if (e.key === ' ' && spacePressed) {
      spacePressed = false;
      if (previousTool && previousTool !== 'hand') {
        history.dispatch({ type: 'SET_TOOL', tool: previousTool });
        previousTool = null;
      }
    }
  });

  document.addEventListener('copy', (e) => {
    if (window.getSelection()?.toString() || !e.clipboardData) return;
    const scene = history.present;
    const selected = scene.elements.filter((element) =>
      scene.selectedIds.has(element.id),
    );
    if (selected.length === 0) return;

    const serialized = serializeElementClipboard(selected);
    e.clipboardData.setData(
      'text/plain',
      `${ELEMENT_CLIPBOARD_TEXT_PREFIX}${serialized}`,
    );
    try {
      e.clipboardData.setData(ELEMENT_CLIPBOARD_MIME, serialized);
    } catch {
      // The text fallback keeps element paste working on restricted browsers.
    }
    pasteCount = 0;
    e.preventDefault();
  });

  document.addEventListener(
    'paste',
    (e) => {
      if (!e.clipboardData) return;
      const customData = e.clipboardData.getData(ELEMENT_CLIPBOARD_MIME);
      const textData = e.clipboardData.getData('text/plain');
      const serialized =
        customData ||
        (textData.startsWith(ELEMENT_CLIPBOARD_TEXT_PREFIX)
          ? textData.slice(ELEMENT_CLIPBOARD_TEXT_PREFIX.length)
          : '');
      if (!serialized) return;

      try {
        const payload = JSON.parse(serialized) as Record<string, unknown>;
        if (payload.version !== 1) return;
        const elements = validateElements(payload.elements);
        if (!elements || elements.length === 0) return;

        pasteCount += 1;
        const offset = pasteCount * 20;
        history.dispatch({
          type: 'CREATE_ELEMENTS',
          elements: cloneElementsWithOffset(elements, offset, offset),
        });
        e.preventDefault();
        e.stopImmediatePropagation();
      } catch {
        // Ignore malformed clipboard data and let other paste handlers proceed.
      }
    },
    true,
  );
}
