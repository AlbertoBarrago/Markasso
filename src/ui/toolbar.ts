import type { History } from '../engine/history';
import type { ActiveTool } from '../core/app_state';

const TOOLS: { tool: ActiveTool; icon: string; label: string; key: string }[] = [
  { tool: 'select',    icon: '↖', label: 'Select',    key: 'V' },
  { tool: 'rectangle', icon: '▭', label: 'Rectangle', key: 'R' },
  { tool: 'ellipse',   icon: '⬭', label: 'Ellipse',   key: 'E' },
  { tool: 'line',      icon: '╱', label: 'Line',       key: 'L' },
  { tool: 'arrow',     icon: '→', label: 'Arrow',      key: 'A' },
  { tool: 'freehand',  icon: '✏', label: 'Pen',        key: 'P' },
  { tool: 'text',      icon: 'T', label: 'Text',       key: 'T' },
];

export function initToolbar(container: HTMLElement, history: History): void {
  container.innerHTML = '';

  // ── Tool buttons ─────────────────────────────────────────────────────────
  const toolBtns = new Map<ActiveTool, HTMLButtonElement>();
  const toolGroup = el('div', 'tb-group');
  for (const t of TOOLS) {
    const btn = btn_(t.icon, `${t.label} (${t.key})`);
    btn.addEventListener('click', () => history.dispatch({ type: 'SET_TOOL', tool: t.tool }));
    toolBtns.set(t.tool, btn);
    toolGroup.appendChild(btn);
  }

  // ── Undo / Redo ───────────────────────────────────────────────────────────
  const undoBtn = btn_('↩', 'Undo (Ctrl+Z)');
  const redoBtn = btn_('↪', 'Redo (Ctrl+Y / Ctrl+Shift+Z)');
  undoBtn.addEventListener('click', () => history.undo());
  redoBtn.addEventListener('click', () => history.redo());
  const histGroup = el('div', 'tb-group');
  histGroup.append(undoBtn, redoBtn);

  // ── Zoom display ─────────────────────────────────────────────────────────
  const zoomLabel = el('span', 'tb-zoom');
  zoomLabel.title = 'Ctrl+scroll to zoom • scroll to pan';

  container.append(
    toolGroup,
    sep(),
    histGroup,
    // zoom pushed to right via flex gap in CSS
    zoomLabel,
  );

  // ── Update ────────────────────────────────────────────────────────────────
  function sync(): void {
    const { activeTool } = history.present.appState;
    for (const [t, b] of toolBtns) b.classList.toggle('active', t === activeTool);
    undoBtn.disabled = !history.canUndo();
    redoBtn.disabled = !history.canRedo();
    const pct = Math.round(history.present.viewport.zoom * 100);
    zoomLabel.textContent = `${pct}%`;
  }

  history.subscribe(sync);
  sync();
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function el(tag: string, cls: string): HTMLElement {
  const e = document.createElement(tag);
  e.className = cls;
  return e;
}

function btn_(icon: string, title: string): HTMLButtonElement {
  const b    = document.createElement('button');
  b.className = 'tb-btn';
  b.title     = title;
  b.textContent = icon;
  return b;
}

function sep(): HTMLElement {
  return el('div', 'tb-sep');
}
