import type { History } from '../engine/history';

export function initMobileActionBar(workspace: HTMLElement, history: History): void {
  const bar = document.createElement('div');
  bar.id = 'mobile-actions';
  workspace.appendChild(bar);

  // ── Always visible ──────────────────────────────────────────────────────────
  const undoBtn = mkBtn(IC_UNDO, 'Undo');
  const redoBtn = mkBtn(IC_REDO, 'Redo');

  // ── Separator (visible only on selection) ───────────────────────────────────
  const sep = document.createElement('span');
  sep.className = 'mobile-action-sep';

  // ── Selection-specific ──────────────────────────────────────────────────────
  const duplicateBtn = mkBtn(IC_DUPLICATE, 'Duplicate');
  const deleteBtn    = mkBtn(IC_DELETE,    'Delete');
  deleteBtn.classList.add('mobile-action-danger');

  bar.append(undoBtn, redoBtn, sep, duplicateBtn, deleteBtn);

  undoBtn.addEventListener('click', () => history.undo());
  redoBtn.addEventListener('click', () => history.redo());

  duplicateBtn.addEventListener('click', () => {
    const scene = history.present;
    const selected = [...scene.selectedIds]
      .map((id) => scene.elements.find((el) => el.id === id))
      .filter((el) => el !== undefined);
    for (const el of selected) {
      history.dispatch({
        type: 'CREATE_ELEMENT',
        element: { ...el, id: crypto.randomUUID(), x: el.x + 16, y: el.y + 16 },
      });
    }
  });

  deleteBtn.addEventListener('click', () => {
    const ids = [...history.present.selectedIds];
    if (ids.length) history.dispatch({ type: 'DELETE_ELEMENTS', ids });
  });

  function sync(): void {
    const hasSelection = history.present.selectedIds.size > 0;

    undoBtn.disabled = !history.canUndo();
    redoBtn.disabled = !history.canRedo();

    sep.style.display       = hasSelection ? 'block' : 'none';
    duplicateBtn.style.display = hasSelection ? 'flex' : 'none';
    deleteBtn.style.display    = hasSelection ? 'flex' : 'none';
  }

  history.subscribe(sync);
  sync();
}

// ── Icons ──────────────────────────────────────────────────────────────────────

const IC_UNDO      = `<svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8h9a4 4 0 010 8H8"/><path d="M7 5L4 8l3 3"/></svg>`;
const IC_REDO      = `<svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M16 8H7a4 4 0 000 8h5"/><path d="M13 5l3 3-3 3"/></svg>`;
const IC_DUPLICATE = `<svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="7" y="7" width="9" height="9" rx="1.5"/><path d="M4 13V4h9"/></svg>`;
const IC_DELETE    = `<svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6h12M8 6V4h4v2M7 9v6M10 9v6M13 9v6M5 6l1 10h8l1-10"/></svg>`;

function mkBtn(icon: string, title: string): HTMLButtonElement {
  const b = document.createElement('button');
  b.className = 'mobile-action-btn';
  b.title = title;
  b.innerHTML = icon;
  return b;
}
