import type { History } from '../engine/history';
import type { Element } from '../elements/element';
import { openImageFilePicker } from './image_import';

export function initContextPanel(workspace: HTMLElement, history: History): void {
  const panel = document.createElement('div');
  panel.id = 'context-panel';
  workspace.appendChild(panel);

  // ── Color swatches ───────────────────────────────────────────────────
  const strokeSwatch = mkSwatch('Stroke / text color');
  const fillSwatch   = mkSwatch('Fill color');
  strokeSwatch.addEventListener('click', () => document.getElementById('props-panel')?.classList.toggle('open'));
  fillSwatch.addEventListener('click',   () => document.getElementById('props-panel')?.classList.toggle('open'));

  const colorGroup = document.createElement('div');
  colorGroup.className = 'ctx-group';
  colorGroup.append(strokeSwatch, fillSwatch);

  // ── Layer order ──────────────────────────────────────────────────────
  const sendBackBtn    = mkBtn(IC_SEND_BACK,    'Send to back',    () => {
    const ids = [...history.present.selectedIds];
    if (ids.length) history.dispatch({ type: 'REORDER_ELEMENTS', ids, targetIndex: 0 });
  });
  const moveBackBtn    = mkBtn(IC_MOVE_BACK,    'Move back one',   () => {
    const scene = history.present;
    const ids = [...scene.selectedIds];
    if (!ids.length) return;
    const idx = scene.elements.findIndex((el) => el.id === ids[0]);
    if (idx > 0) history.dispatch({ type: 'REORDER_ELEMENTS', ids, targetIndex: idx - 1 });
  });
  const moveForwardBtn = mkBtn(IC_MOVE_FORWARD, 'Move forward one',() => {
    const scene = history.present;
    const ids = [...scene.selectedIds];
    if (!ids.length) return;
    const idx = scene.elements.findIndex((el) => el.id === ids[0]);
    if (idx < scene.elements.length - 1) history.dispatch({ type: 'REORDER_ELEMENTS', ids, targetIndex: idx + 2 });
  });
  const bringFrontBtn  = mkBtn(IC_BRING_FRONT,  'Bring to front',  () => {
    const scene = history.present;
    const ids = [...scene.selectedIds];
    if (ids.length) history.dispatch({ type: 'REORDER_ELEMENTS', ids, targetIndex: scene.elements.length });
  });

  const orderGroup = document.createElement('div');
  orderGroup.className = 'ctx-group';
  orderGroup.append(sendBackBtn, moveBackBtn, moveForwardBtn, bringFrontBtn);

  // ── Element actions ──────────────────────────────────────────────────
  const propsBtn = mkBtn(IC_SLIDERS, 'Properties', () => {
    document.getElementById('props-panel')?.classList.toggle('open');
  });
  const duplicateBtn = mkBtn(IC_DUPLICATE, 'Duplicate', () => {
    const scene = history.present;
    const selected = [...scene.selectedIds]
      .map((id) => scene.elements.find((el) => el.id === id))
      .filter((el): el is Element => el !== undefined);
    for (const el of selected) {
      history.dispatch({ type: 'CREATE_ELEMENT', element: { ...el, id: crypto.randomUUID(), x: el.x + 16, y: el.y + 16 } });
    }
  });
  const deleteBtn = mkBtn(IC_TRASH, 'Delete', () => {
    const ids = [...history.present.selectedIds];
    if (ids.length) history.dispatch({ type: 'DELETE_ELEMENTS', ids });
  });
  deleteBtn.classList.add('ctx-danger');

  // Lock/Unlock toggle button
  const lockBtn = mkBtn(IC_LOCK, 'Lock', () => {
    const scene = history.present;
    const selected = [...scene.selectedIds]
      .map((id) => scene.elements.find((el) => el.id === id))
      .filter((el): el is Element => el !== undefined);
    const allLocked = selected.length > 0 && selected.every((el) => el.locked);
    const ids = [...scene.selectedIds];
    if (allLocked) {
      history.dispatch({ type: 'UNLOCK_ELEMENTS', ids });
    } else {
      history.dispatch({ type: 'LOCK_ELEMENTS', ids });
    }
  });

  // Group button
  const groupBtn = mkBtn(IC_GROUP, 'Group (Ctrl+G)', () => {
    const ids = [...history.present.selectedIds];
    if (ids.length > 1) {
      history.dispatch({ type: 'GROUP_ELEMENTS', ids, groupId: crypto.randomUUID() });
    }
  });

  // Ungroup button
  const ungroupBtn = mkBtn(IC_UNGROUP, 'Ungroup (Ctrl+Shift+G)', () => {
    const scene = history.present;
    const groupIds = new Set(
      [...scene.selectedIds]
        .map((id) => scene.elements.find((el) => el.id === id)?.groupId)
        .filter((gid): gid is string => gid !== undefined)
    );
    for (const groupId of groupIds) {
      history.dispatch({ type: 'UNGROUP_ELEMENTS', groupId });
    }
  });

  const actionGroup = document.createElement('div');
  actionGroup.className = 'ctx-group';
  actionGroup.append(propsBtn, duplicateBtn, lockBtn, groupBtn, ungroupBtn, deleteBtn);

  // ── App actions (always shown) ───────────────────────────────────────
  const importBtn = mkBtn(IC_IMPORT, 'Import image', () => {
    openImageFilePicker(workspace);
  });

  const appGroup = document.createElement('div');
  appGroup.className = 'ctx-group';
  appGroup.append(importBtn);

  panel.append(colorGroup, mkSep(), orderGroup, mkSep(), actionGroup, mkSep(), appGroup);

  // ── Sync: auto-open on selection, update swatches + button states ─────
  function sync(): void {
    const scene = history.present;
    const selected = [...scene.selectedIds]
      .map((id) => scene.elements.find((el) => el.id === id))
      .filter((el): el is Element => el !== undefined);

    const hasSelection = selected.length > 0;

    // Auto open/close based on selection
    if (hasSelection) {
      panel.classList.add('open');
    } else {
      panel.classList.remove('open');
    }

    const isImage = hasSelection && selected[0]!.type === 'image';
    const total   = scene.elements.length;
    const idx     = selected.length === 1
      ? scene.elements.findIndex((el) => el.id === selected[0]!.id)
      : -1;

    colorGroup.style.display = (hasSelection && !isImage) ? '' : 'none';
    orderGroup.style.display = hasSelection ? '' : 'none';
    actionGroup.style.display = hasSelection ? '' : 'none';

    // Hide the seps between hidden groups
    const seps = panel.querySelectorAll<HTMLElement>('.ctx-sep');
    seps[0]!.style.display = (hasSelection && !isImage) ? '' : 'none';
    seps[1]!.style.display = hasSelection ? '' : 'none';
    seps[2]!.style.display = hasSelection ? '' : 'none';

    // Update order button states
    sendBackBtn.disabled    = !hasSelection || idx <= 0;
    moveBackBtn.disabled    = !hasSelection || idx <= 0;
    moveForwardBtn.disabled = !hasSelection || idx >= total - 1;
    bringFrontBtn.disabled  = !hasSelection || idx >= total - 1;

    // Lock button: show when selection exists; update label
    lockBtn.style.display = hasSelection ? '' : 'none';
    if (hasSelection) {
      const allLocked = selected.every((el) => el.locked);
      lockBtn.title = allLocked ? 'Unlock' : 'Lock';
      lockBtn.innerHTML = allLocked ? IC_UNLOCK : IC_LOCK;
    }

    // Group button: show only when 2+ elements selected and not all grouped
    groupBtn.style.display = (selected.length >= 2) ? '' : 'none';

    // Ungroup button: show when selected elements have groupIds
    const hasGroups = selected.some((el) => el.groupId);
    ungroupBtn.style.display = (hasSelection && hasGroups) ? '' : 'none';

    // Update swatches
    if (hasSelection && !isImage) {
      const first = selected[0]!;
      applySwatchColor(strokeSwatch, first.strokeColor);
      applySwatchColor(fillSwatch,   first.fillColor);
    }
  }

  history.subscribe(sync);
  sync();
}

function applySwatchColor(btn: HTMLButtonElement, color: string): void {
  btn.style.background = '';
  btn.classList.toggle('ctx-swatch-transparent', color === 'transparent');
  if (color !== 'transparent') btn.style.background = color;
}

// ── Icons ──────────────────────────────────────────────────────────────────────

const IC_LOCK         = `<svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="9" width="10" height="8" rx="1.5"/><path d="M7 9V6a3 3 0 0 1 6 0v3"/></svg>`;
const IC_UNLOCK       = `<svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="9" width="10" height="8" rx="1.5"/><path d="M7 9V6a3 3 0 0 1 6 0"/></svg>`;
const IC_GROUP        = `<svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="6" height="6" rx="1"/><rect x="12" y="2" width="6" height="6" rx="1"/><rect x="2" y="12" width="6" height="6" rx="1"/><rect x="12" y="12" width="6" height="6" rx="1"/></svg>`;
const IC_UNGROUP      = `<svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="6" height="6" rx="1"/><rect x="12" y="2" width="6" height="6" rx="1"/><rect x="2" y="12" width="6" height="6" rx="1"/><rect x="12" y="12" width="6" height="6" rx="1"/><line x1="1" y1="1" x2="19" y2="19" stroke-width="2"/></svg>`;
const IC_SEND_BACK    = `<svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><line x1="3" y1="17" x2="17" y2="17"/><path d="M10 13V5M6 9l4-4 4 4"/></svg>`;
const IC_MOVE_BACK    = `<svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M10 14V6M6 10l4-4 4 4"/></svg>`;
const IC_MOVE_FORWARD = `<svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M10 6v8M6 10l4 4 4-4"/></svg>`;
const IC_BRING_FRONT  = `<svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><line x1="3" y1="3" x2="17" y2="3"/><path d="M10 7v8M6 11l4 4 4-4"/></svg>`;
const IC_SLIDERS      = `<svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><line x1="3" y1="5" x2="17" y2="5"/><line x1="3" y1="10" x2="17" y2="10"/><line x1="3" y1="15" x2="17" y2="15"/><circle cx="7" cy="5" r="2" fill="var(--bg-island)"/><circle cx="13" cy="10" r="2" fill="var(--bg-island)"/><circle cx="8" cy="15" r="2" fill="var(--bg-island)"/></svg>`;
const IC_DUPLICATE    = `<svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="7" y="7" width="9" height="9" rx="1.5"/><path d="M4 13V4h9"/></svg>`;
const IC_TRASH        = `<svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6h12M8 6V4h4v2M7 9v6M10 9v6M13 9v6M5 6l1 10h8l1-10"/></svg>`;
const IC_IMPORT = `<svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="16" height="14" rx="2"/><circle cx="7" cy="8" r="1.5"/><path d="M2 14l4-4 3 3 3-3 4 4"/></svg>`;

// ── Helpers ───────────────────────────────────────────────────────────────────

function mkBtn(icon: string, title: string, onClick: () => void): HTMLButtonElement {
  const b = document.createElement('button');
  b.className = 'ctx-btn';
  b.title = title;
  b.innerHTML = icon;
  b.addEventListener('click', onClick);
  return b;
}

function mkSwatch(title: string): HTMLButtonElement {
  const b = document.createElement('button');
  b.className = 'ctx-swatch';
  b.title = title;
  return b;
}

function mkSep(): HTMLElement {
  const s = document.createElement('div');
  s.className = 'ctx-sep';
  return s;
}
