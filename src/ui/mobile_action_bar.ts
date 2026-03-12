import type { History } from '../engine/history';

export function initMobileActionBar(workspace: HTMLElement, history: History): void {
  const bar = document.createElement('div');
  bar.id = 'mobile-actions';
  workspace.appendChild(bar);

  const sendBackBtn    = mkBtn(IC_SEND_BACK,    'Send back');
  const bringFrontBtn  = mkBtn(IC_BRING_FRONT,  'Bring forward');
  const duplicateBtn   = mkBtn(IC_DUPLICATE,    'Duplicate');
  const visibilityBtn  = mkBtn(IC_EYE,          'Toggle visibility');
  const deleteBtn      = mkBtn(IC_DELETE,       'Delete');
  deleteBtn.classList.add('mobile-action-danger');

  bar.append(sendBackBtn, bringFrontBtn, duplicateBtn, visibilityBtn, deleteBtn);

  sendBackBtn.addEventListener('click', () => {
    const scene = history.present;
    const ids = [...scene.selectedIds];
    if (ids.length) history.dispatch({ type: 'REORDER_ELEMENTS', ids, targetIndex: 0 });
  });

  bringFrontBtn.addEventListener('click', () => {
    const scene = history.present;
    const ids = [...scene.selectedIds];
    if (ids.length) history.dispatch({ type: 'REORDER_ELEMENTS', ids, targetIndex: scene.elements.length });
  });

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

  visibilityBtn.addEventListener('click', () => {
    const ids = [...history.present.selectedIds];
    for (const id of ids) history.dispatch({ type: 'TOGGLE_ELEMENT_VISIBILITY', id });
  });

  deleteBtn.addEventListener('click', () => {
    const ids = [...history.present.selectedIds];
    if (ids.length) history.dispatch({ type: 'DELETE_ELEMENTS', ids });
  });

  function sync(): void {
    const scene = history.present;
    const hasSelection = scene.selectedIds.size > 0;
    bar.classList.toggle('open', hasSelection);

    const firstId = [...scene.selectedIds][0];
    const firstEl = firstId ? scene.elements.find((el) => el.id === firstId) : undefined;
    visibilityBtn.innerHTML = (firstEl?.visible === false) ? IC_EYE_OFF : IC_EYE;
  }

  history.subscribe(sync);
  sync();
}

// ── Icons ──────────────────────────────────────────────────────────────────────

const IC_SEND_BACK = `<svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><line x1="3" y1="17" x2="17" y2="17"/><path d="M10 13V5M6 9l4-4 4 4"/></svg>`;
const IC_BRING_FRONT = `<svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><line x1="3" y1="3" x2="17" y2="3"/><path d="M10 7v8M6 11l4 4 4-4"/></svg>`;
const IC_DUPLICATE = `<svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="7" y="7" width="9" height="9" rx="1.5"/><path d="M4 13V4h9"/></svg>`;
const IC_EYE = `<svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M1 10s3-6 9-6 9 6 9 6-3 6-9 6-9-6-9-6z"/><circle cx="10" cy="10" r="2.5"/></svg>`;
const IC_EYE_OFF = `<svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3l14 14M8.5 8.6A2.5 2.5 0 0012.4 12M6.4 5.4C4 6.9 2 10 2 10s3 6 8 6c1.7 0 3.2-.6 4.5-1.5M10 4c5 0 8 6 8 6s-.8 1.5-2.2 3"/></svg>`;
const IC_DELETE = `<svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6h12M8 6V4h4v2M7 9v6M10 9v6M13 9v6M5 6l1 10h8l1-10"/></svg>`;

function mkBtn(icon: string, title: string): HTMLButtonElement {
  const b = document.createElement('button');
  b.className = 'mobile-action-btn';
  b.title = title;
  b.innerHTML = icon;
  return b;
}
