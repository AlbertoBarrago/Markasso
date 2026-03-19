import type { History } from '../engine/history';

export function initLayersPanel(container: HTMLElement, history: History): HTMLElement {
  const panel = document.createElement('div');
  panel.id = 'layers-panel';
  container.appendChild(panel);

  // ── Layers section (z-order) ────────────────────────────────────────
  const layersSection = document.createElement('div');
  layersSection.className = 'lp-section';

  const layersLabel = document.createElement('div');
  layersLabel.className = 'lp-label';
  layersLabel.textContent = 'Layers';
  layersSection.appendChild(layersLabel);

  const orderRow = document.createElement('div');
  orderRow.className = 'lp-btn-row';

  const sendToBackBtn  = mkBtn(IC_SEND_BACK,    'Send to back');
  const moveBackBtn    = mkBtn(IC_MOVE_BACK,    'Move back one');
  const moveForwardBtn = mkBtn(IC_MOVE_FORWARD, 'Move forward one');
  const bringToFrontBtn= mkBtn(IC_BRING_FRONT,  'Bring to front');

  sendToBackBtn.addEventListener('click', () => {
    const ids = [...history.present.selectedIds];
    if (ids.length) history.dispatch({ type: 'REORDER_ELEMENTS', ids, targetIndex: 0 });
  });

  moveBackBtn.addEventListener('click', () => {
    const scene = history.present;
    const ids = [...scene.selectedIds];
    if (!ids.length) return;
    const idx = scene.elements.findIndex((el) => el.id === ids[0]);
    if (idx > 0) history.dispatch({ type: 'REORDER_ELEMENTS', ids, targetIndex: idx - 1 });
  });

  moveForwardBtn.addEventListener('click', () => {
    const scene = history.present;
    const ids = [...scene.selectedIds];
    if (!ids.length) return;
    const idx = scene.elements.findIndex((el) => el.id === ids[0]);
    if (idx < scene.elements.length - 1) {
      history.dispatch({ type: 'REORDER_ELEMENTS', ids, targetIndex: idx + 2 });
    }
  });

  bringToFrontBtn.addEventListener('click', () => {
    const scene = history.present;
    const ids = [...scene.selectedIds];
    if (ids.length) history.dispatch({ type: 'REORDER_ELEMENTS', ids, targetIndex: scene.elements.length });
  });

  orderRow.append(sendToBackBtn, moveBackBtn, moveForwardBtn, bringToFrontBtn);
  layersSection.appendChild(orderRow);

  // ── Actions section ─────────────────────────────────────────────────
  const actionsSection = document.createElement('div');
  actionsSection.className = 'lp-section';

  const actionsLabel = document.createElement('div');
  actionsLabel.className = 'lp-label';
  actionsLabel.textContent = 'Actions';
  actionsSection.appendChild(actionsLabel);

  const actionsRow = document.createElement('div');
  actionsRow.className = 'lp-btn-row';

  const visibilityBtn = mkBtn(IC_EYE, 'Toggle visibility');
  visibilityBtn.addEventListener('click', () => {
    const ids = [...history.present.selectedIds];
    for (const id of ids) history.dispatch({ type: 'TOGGLE_ELEMENT_VISIBILITY', id });
  });

  const duplicateBtn = mkBtn(IC_DUPLICATE, 'Duplicate');
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

  actionsRow.append(visibilityBtn, duplicateBtn);
  actionsSection.appendChild(actionsRow);

  panel.append(layersSection, actionsSection);

  // ── Sync button states ───────────────────────────────────────────────
  function sync(): void {
    const scene = history.present;
    const hasSelection = scene.selectedIds.size > 0;
    const ids = [...scene.selectedIds];
    const idx = ids.length === 1
      ? scene.elements.findIndex((el) => el.id === ids[0])
      : -1;
    const total = scene.elements.length;

    sendToBackBtn.disabled   = !hasSelection || idx === 0;
    moveBackBtn.disabled     = !hasSelection || idx <= 0;
    moveForwardBtn.disabled  = !hasSelection || idx >= total - 1;
    bringToFrontBtn.disabled = !hasSelection || idx === total - 1;
    visibilityBtn.disabled   = !hasSelection;
    duplicateBtn.disabled    = !hasSelection;

    // Update eye icon based on visibility state
    const firstId = ids[0];
    const firstEl = firstId ? scene.elements.find((el) => el.id === firstId) : undefined;
    visibilityBtn.innerHTML = (firstEl?.visible === false) ? IC_EYE_OFF : IC_EYE;
  }

  history.subscribe(sync);
  sync();

  return panel;
}

// ── Icons ──────────────────────────────────────────────────────────────────────

const IC_SEND_BACK = `<svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
  <line x1="3" y1="17" x2="17" y2="17"/>
  <path d="M10 13V5M6 9l4-4 4 4"/>
</svg>`;

const IC_MOVE_BACK = `<svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
  <path d="M10 14V6M6 10l4-4 4 4"/>
</svg>`;

const IC_MOVE_FORWARD = `<svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
  <path d="M10 6v8M6 10l4 4 4-4"/>
</svg>`;

const IC_BRING_FRONT = `<svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
  <line x1="3" y1="3" x2="17" y2="3"/>
  <path d="M10 7v8M6 11l4 4 4-4"/>
</svg>`;

const IC_EYE = `<svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
  <path d="M1 10s3-6 9-6 9 6 9 6-3 6-9 6-9-6-9-6z"/>
  <circle cx="10" cy="10" r="2.5"/>
</svg>`;

const IC_EYE_OFF = `<svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
  <path d="M3 3l14 14M8.5 8.6A2.5 2.5 0 0012.4 12M6.4 5.4C4 6.9 2 10 2 10s3 6 8 6c1.7 0 3.2-.6 4.5-1.5M10 4c5 0 8 6 8 6s-.8 1.5-2.2 3"/>
</svg>`;

const IC_DUPLICATE = `<svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
  <rect x="7" y="7" width="9" height="9" rx="1.5"/>
  <path d="M4 13V4h9"/>
</svg>`;

// ── Helper ─────────────────────────────────────────────────────────────────────

function mkBtn(icon: string, title: string): HTMLButtonElement {
  const b = document.createElement('button');
  b.className = 'lp-btn';
  b.title = title;
  b.innerHTML = icon;
  return b;
}
