import type { History } from '../engine/history';
import type { ActiveTool } from '../core/app_state';
import { exportPNG, exportSVG } from '../rendering/export';
import { exportMarkasso, importMarkasso } from '../io/markasso';
import { fitToElements } from '../core/viewport';
import { t } from '../i18n';

// ── SVG icons ──────────────────────────────────────────────────────────────────
const IC = {
  lock:       `<svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="9" width="12" height="9" rx="2"/><path d="M7 9V6a3 3 0 016 0v3"/></svg>`,
  lockOpen:   `<svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="9" width="12" height="9" rx="2"/><path d="M7 9V6a3 3 0 016 0"/></svg>`,
  hand:       `<svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M7 11V5a1 1 0 011-1h0a1 1 0 011 1v5"/><path d="M9 11V4a1 1 0 011-1h0a1 1 0 011 1v7"/><path d="M11 11V3a1 1 0 011-1h0a1 1 0 011 1v8"/><path d="M13 11V5a1 1 0 011-1h0a1 1 0 011 1v6a5 5 0 01-5 5H9a5 5 0 01-5-5v-2a1 1 0 011-1h0a1 1 0 011 1v2"/></svg>`,
  select:    `<svg width="18" height="18" viewBox="0 0 20 20" fill="currentColor"><path d="M5.5 3v12.8l2.9-2.9 2.4 5.4 2.1-.95-2.4-5.4 3.8.001z"/></svg>`,
  rectangle: `<svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><rect x="3" y="5" width="14" height="10" rx="1.5"/></svg>`,
  ellipse:   `<svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8"><ellipse cx="10" cy="10" rx="7.5" ry="5.5"/></svg>`,
  line:      `<svg width="18" height="18" viewBox="0 0 20 20"><line x1="4" y1="16" x2="16" y2="4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`,
  arrow:     `<svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="16" x2="16" y2="4"/><path d="M9 4h7v7"/></svg>`,
  freehand:  `<svg width="18" height="18" aria-hidden="true" focusable="false" role="img" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><g stroke-width="1.25"><path clip-rule="evenodd" d="m7.643 15.69 7.774-7.773a2.357 2.357 0 1 0-3.334-3.334L4.31 12.357a3.333 3.333 0 0 0-.977 2.357v1.953h1.953c.884 0 1.732-.352 2.357-.977Z"></path><path d="m11.25 5.417 3.333 3.333"></path></g></svg>`,
  text:      `<svg width="18" height="18" viewBox="0 0 20 20" fill="currentColor"><path d="M4 4h12v2.5H12v9.5H8V6.5H4z"/></svg>`,
  undo:      `<svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8h9a4 4 0 010 8H8"/><path d="M7 5L4 8l3 3"/></svg>`,
  redo:      `<svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M16 8H7a4 4 0 000 8h5"/><path d="M13 5l3 3-3 3"/></svg>`,
  export:    `<svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M10 3v9M7 9l3 3 3-3"/><path d="M4 14v1.5A1.5 1.5 0 005.5 17h9a1.5 1.5 0 001.5-1.5V14"/></svg>`,
  import:    `<svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M2 7a2 2 0 012-2h3l2 2h5a2 2 0 012 2v5a2 2 0 01-2 2H4a2 2 0 01-2-2V7z"/></svg>`,
  fit:       `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><circle cx="8" cy="8" r="2.5"/><path d="M1 5V2h3M12 2h3v3M15 11v3h-3M4 14H1v-3"/></svg>`,
  imgPNG:    `<svg width="18" height="18" viewBox="0 0 20 20" fill="none" style="flex-shrink:0"><rect x="2" y="3" width="16" height="14" rx="2" stroke="currentColor" stroke-width="1.5"/><circle cx="7" cy="8" r="1.5" fill="currentColor"/><path d="M2 14l4-4 3 3 3-3 4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  imgSVG:    `<svg width="18" height="18" viewBox="0 0 20 20" fill="none" style="flex-shrink:0"><circle cx="4" cy="10" r="2.5" stroke="currentColor" stroke-width="1.5"/><circle cx="16" cy="10" r="2.5" stroke="currentColor" stroke-width="1.5"/><path d="M6.5 10C8 5 12 5 13.5 10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`,
  markasso:  `<svg width="18" height="18" viewBox="0 0 20 20" fill="none" style="flex-shrink:0"><rect x="3" y="2" width="14" height="16" rx="2" stroke="currentColor" stroke-width="1.5"/><path d="M7 7h6M7 10h6M7 13h4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`,
  layers:    `<svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M10 2L2 6l8 4 8-4z"/><path d="M2 10l8 4 8-4"/><path d="M2 14l8 4 8-4"/></svg>`,
  hamburger: `<svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><line x1="3" y1="6" x2="17" y2="6"/><line x1="3" y1="10" x2="17" y2="10"/><line x1="3" y1="14" x2="17" y2="14"/></svg>`,
  importImg: `<svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="16" height="14" rx="2"/><circle cx="7" cy="8" r="1.5"/><path d="M2 14l4-4 3 3 3-3 4 4"/><path d="M13 7l2-2 2 2M15 5v5"/></svg>`,
  eraser:    `<svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M3 17h14"/><path d="M5 17l-2-4 9-8 4 4-7 8H5z"/><path d="M12 5l4 4"/></svg>`,
  code:      `<svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M7 6L3 10l4 4"/><path d="M13 6l4 4-4 4"/></svg>`,
};

const TOOLS: { tool: ActiveTool; icon: string; label: string; key: string; num: string }[] = [
  { tool: 'hand',      icon: IC.hand,      label: t('hand'),      key: 'H / Space', num: '' },
  { tool: 'select',    icon: IC.select,    label: t('select'),    key: 'V / 1',     num: '1' },
  { tool: 'rectangle', icon: IC.rectangle, label: t('rectangle'), key: 'R / 2',     num: '2' },
  { tool: 'ellipse',   icon: IC.ellipse,   label: t('ellipse'),   key: 'E / 3',     num: '3' },
  { tool: 'line',      icon: IC.line,      label: t('line'),      key: 'L / 4',     num: '4' },
  { tool: 'arrow',     icon: IC.arrow,     label: t('arrow'),     key: 'A / 5',     num: '5' },
  { tool: 'freehand',  icon: IC.freehand,  label: t('pen'),       key: 'P / 6',     num: '6' },
  { tool: 'text',      icon: IC.text,      label: t('textTool'),  key: 'T / 7',     num: '7' },
  { tool: 'eraser',    icon: IC.eraser,    label: t('eraser'),    key: '0',          num: '0' },
];

export function initToolbar(container: HTMLElement, history: History): void {
  container.innerHTML = '';

  // ── Center-top: tool buttons pill ─────────────────────────────────────────
  const centerPill = div('tb-island tb-island-tools');
  centerPill.setAttribute('role', 'toolbar');
  centerPill.setAttribute('aria-label', 'Drawing tools');
  const toolBtns = new Map<ActiveTool, HTMLButtonElement>();

  // Lock button (first, no shortcut badge)
  const lockBtn = document.createElement('button');
  lockBtn.className = 'tb-btn';
  lockBtn.title = t('lockTool');
  lockBtn.setAttribute('aria-label', t('lockTool'));
  lockBtn.setAttribute('aria-pressed', 'false');
  lockBtn.innerHTML = IC.lockOpen;
  lockBtn.addEventListener('click', () => {
    const locked = history.present.appState.toolLocked;
    history.dispatch({ type: 'SET_TOOL_LOCK', locked: !locked });
  });
  centerPill.appendChild(lockBtn);

  // Separator after lock
  const lockSep = document.createElement('span');
  lockSep.className = 'tb-separator';
  centerPill.appendChild(lockSep);

  TOOLS.forEach((t) => {
    const b = document.createElement('button');
    b.className = 'tb-btn';
    b.title = `${t.label} (${t.key})`;
    b.setAttribute('aria-label', t.label);
    b.setAttribute('aria-pressed', 'false');
    b.innerHTML = `${t.icon}${t.num ? `<span class="tb-btn-key">${t.num}</span>` : ''}`;
    b.addEventListener('click', () => history.dispatch({ type: 'SET_TOOL', tool: t.tool }));
    toolBtns.set(t.tool, b);
    centerPill.appendChild(b);
  });

  // ── Bottom-left: undo/redo + zoom ─────────────────────────────────────────
  const bottomLeft = div('tb-island-bottomleft');

  // Undo / Redo
  const undoPill = div('tb-island tb-island-undo');
  undoPill.setAttribute('role', 'group');
  undoPill.setAttribute('aria-label', 'History');
  const undoBtn = mkBtn(IC.undo, t('undo'));
  const redoBtn = mkBtn(IC.redo, t('redo'));
  undoBtn.addEventListener('click', () => history.undo());
  redoBtn.addEventListener('click', () => history.redo());
  undoPill.append(undoBtn, redoBtn);

  // Zoom
  const zoomPill = div('tb-island tb-island-zoom');
  zoomPill.setAttribute('role', 'group');
  zoomPill.setAttribute('aria-label', 'Zoom');
  const fitBtn   = mkBtn(IC.fit, t('fitContent'));
  const minusBtn = mkBtn('−', t('zoomOut'));
  const plusBtn  = mkBtn('+', t('zoomIn'));
  minusBtn.style.fontSize = plusBtn.style.fontSize = '18px';
  const zoomLabel = document.createElement('button');
  zoomLabel.className = 'tb-btn tb-zoom-btn';
  zoomLabel.title = t('resetZoom');
  fitBtn.addEventListener('click', () => {
    const vp = fitToElements(history.present.elements, window.innerWidth, window.innerHeight);
    history.dispatch({ type: 'SET_VIEWPORT', offsetX: vp.offsetX, offsetY: vp.offsetY, zoom: vp.zoom });
  });
  minusBtn.addEventListener('click', () =>
    history.dispatch({ type: 'ZOOM_VIEWPORT', factor: 1 / 1.2, originX: window.innerWidth / 2, originY: window.innerHeight / 2 })
  );
  plusBtn.addEventListener('click', () =>
    history.dispatch({ type: 'ZOOM_VIEWPORT', factor: 1.2, originX: window.innerWidth / 2, originY: window.innerHeight / 2 })
  );
  zoomLabel.addEventListener('click', () => {
    const vp = history.present.viewport;
    const w = window.innerWidth, h = window.innerHeight;
    const worldCX = (w / 2 - vp.offsetX) / vp.zoom;
    const worldCY = (h / 2 - vp.offsetY) / vp.zoom;
    history.dispatch({ type: 'SET_VIEWPORT', zoom: 1, offsetX: w / 2 - worldCX, offsetY: h / 2 - worldCY });
  });
  zoomPill.append(fitBtn, minusBtn, zoomLabel, plusBtn);

  bottomLeft.append(undoPill, zoomPill);

  // ── Top-right: import + export dropdown ───────────────────────────────────
  const topRight = div('tb-island-topright');

  // Import .markasso
  const importIsland = div('tb-island');
  const importInput = document.createElement('input');
  importInput.type = 'file';
  importInput.accept = '.markasso,application/json';
  importInput.style.display = 'none';
  container.appendChild(importInput);
  importInput.addEventListener('change', () => {
    const file = importInput.files?.[0];
    if (file) importMarkasso(file, history);
    importInput.value = '';
  });
  const importTrigger = mkBtn(IC.import, t('openMarkasso'));
  importTrigger.addEventListener('click', () => importInput.click());
  importIsland.append(importTrigger);

  // Export dropdown
  const exportIsland = div('tb-island');
  exportIsland.style.position = 'relative';
  const exportTrigger = mkBtn(IC.export, t('export'));
  exportTrigger.setAttribute('aria-expanded', 'false');
  const exportPanel = document.createElement('div');
  exportPanel.setAttribute('role', 'menu');
  exportPanel.style.cssText = [
    'position:absolute', 'right:0', 'top:calc(100% + 6px)',
    'background:rgba(26,26,40,0.98)', 'border:1px solid rgba(255,255,255,0.1)',
    'border-radius:10px', 'padding:4px', 'display:none',
    'flex-direction:column', 'gap:2px', 'min-width:148px',
    'box-shadow:0 4px 24px rgba(0,0,0,0.6)', 'z-index:1000',
    'backdrop-filter:blur(16px)',
  ].join(';');

  const askBackground = (): boolean => confirm('Include white background?');

  const exportPNGItem      = menuItem(t('exportPNG'),      IC.imgPNG,   () => exportPNG(history.present, askBackground()));
  const exportSVGItem      = menuItem(t('exportSVG'),      IC.imgSVG,   () => exportSVG(history.present, askBackground()));
  const exportMarkassoItem = menuItem(t('saveMarkasso'),   IC.markasso, () => exportMarkasso(history.present));
  exportPanel.append(exportPNGItem, exportSVGItem, exportMarkassoItem);

  let panelOpen = false;
  exportTrigger.addEventListener('click', (e) => {
    e.stopPropagation();
    panelOpen = !panelOpen;
    exportPanel.style.display = panelOpen ? 'flex' : 'none';
    exportTrigger.setAttribute('aria-expanded', String(panelOpen));
    if (panelOpen) {
      exportPanel.querySelector<HTMLButtonElement>('button:not([disabled])')?.focus();
    }
  });
  exportIsland.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && panelOpen) {
      panelOpen = false;
      exportPanel.style.display = 'none';
      exportTrigger.setAttribute('aria-expanded', 'false');
      exportTrigger.focus();
    }
  });
  document.addEventListener('click', () => {
    if (panelOpen) {
      panelOpen = false;
      exportPanel.style.display = 'none';
      exportTrigger.setAttribute('aria-expanded', 'false');
    }
  });
  exportIsland.append(exportTrigger, exportPanel);

  topRight.append(importIsland, exportIsland);

  // Top-left: settings button injected by settings.ts
  const topLeft = div('tb-island-topleft');
  const tbLeft = div('tb-island tb-left');
  topLeft.append(tbLeft);

  container.append(centerPill, bottomLeft, topRight, topLeft);

  // ── Sync ──────────────────────────────────────────────────────────────────
  function sync(): void {
    const { activeTool, toolLocked } = history.present.appState;
    lockBtn.classList.toggle('active', toolLocked);
    lockBtn.setAttribute('aria-pressed', String(toolLocked));
    lockBtn.innerHTML = toolLocked ? IC.lock : IC.lockOpen;
    for (const [t, b] of toolBtns) {
      const isActive = t === activeTool;
      b.classList.toggle('active', isActive);
      b.setAttribute('aria-pressed', String(isActive));
    }
    undoBtn.disabled = !history.canUndo();
    redoBtn.disabled = !history.canRedo();
    zoomLabel.textContent = `${Math.round(history.present.viewport.zoom * 100)}%`;
    const hasElements = history.present.elements.length > 0;
    exportTrigger.disabled = !hasElements;
    exportPNGItem.disabled = !hasElements;
    exportSVGItem.disabled = !hasElements;
    exportMarkassoItem.disabled = !hasElements;
  }

  history.subscribe(sync);
  sync();
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function div(cls: string): HTMLElement {
  const e = document.createElement('div');
  e.className = cls;
  return e;
}

function mkBtn(icon: string, title: string): HTMLButtonElement {
  const b = document.createElement('button');
  b.className = 'tb-btn';
  b.title = title;
  b.innerHTML = icon;
  return b;
}

function menuItem(label: string, iconSvg: string, onClick: () => void): HTMLButtonElement {
  const item = document.createElement('button');
  item.setAttribute('role', 'menuitem');
  item.style.cssText = [
    'display:flex', 'align-items:center', 'gap:8px',
    'background:none', 'border:none', 'color:#d4d4e8',
    'cursor:pointer', 'padding:7px 10px', 'border-radius:6px',
    'font-size:13px', 'width:100%', 'text-align:left', 'white-space:nowrap',
  ].join(';');
  item.innerHTML = `${iconSvg}<span>${label}</span>`;
  item.addEventListener('mouseenter', () => { item.style.background = 'rgba(255,255,255,0.07)'; });
  item.addEventListener('mouseleave', () => { item.style.background = 'none'; });
  item.addEventListener('click', () => { item.closest('div')!.style.display = 'none'; onClick(); });
  return item;
}
