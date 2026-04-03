import type { History } from '../engine/history';
import type { ActiveTool } from '../core/app_state';
import { exportPNG, exportSVG } from '../rendering/export';
import { exportMarkasso, importMarkasso } from '../io/markasso';
import { importMermaid } from '../io/mermaid';
import { fitToElements } from '../core/viewport';
import { t } from '../i18n';

// ── SVG icons ──────────────────────────────────────────────────────────────────
const IC = {
  lock:       `<svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="9" width="12" height="9" rx="2"/><path d="M7 9V6a3 3 0 016 0v3"/></svg>`,
  lockOpen:   `<svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="9" width="12" height="9" rx="2"/><path d="M7 9V6a3 3 0 016 0"/></svg>`,
  hand:       `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M8 13v-7.5a1.5 1.5 0 0 1 3 0v6.5"/><path d="M11 5.5v-2a1.5 1.5 0 1 1 3 0v8.5"/><path d="M14 5.5a1.5 1.5 0 0 1 3 0v6.5"/><path d="M17 7.5a1.5 1.5 0 0 1 3 0v8.5a6 6 0 0 1 -6 6h-2h.208a6 6 0 0 1 -5.012 -2.7a69.74 69.74 0 0 1 -.196 -.3c-.312 -.479 -1.407 -2.388 -3.286 -5.728a1.5 1.5 0 0 1 .536 -2.022a1.867 1.867 0 0 1 2.28 .28l1.47 1.47"/></svg>`,
  select:    `<svg width="18" height="18" viewBox="0 0 20 20" fill="currentColor"><path d="M5.5 3v12.8l2.9-2.9 2.4 5.4 2.1-.95-2.4-5.4 3.8.001z"/></svg>`,
  rectangle: `<svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><rect x="3" y="5" width="14" height="10" rx="1.5"/></svg>`,
  ellipse:   `<svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8"><ellipse cx="10" cy="10" rx="7.5" ry="5.5"/></svg>`,
  line:      `<svg width="18" height="18" viewBox="0 0 20 20"><line x1="4" y1="16" x2="16" y2="4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`,
  arrow:     `<svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="16" x2="16" y2="4"/><path d="M9 4h7v7"/></svg>`,
  rombo:     `<svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M10 3l7 7-7 7-7-7z"/></svg>`,
  freehand:  `<svg width="18" height="18" aria-hidden="true" focusable="false" role="img" viewBox="0 0 20 20" class="" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><g stroke-width="1.25"><path clip-rule="evenodd" d="m7.643 15.69 7.774-7.773a2.357 2.357 0 1 0-3.334-3.334L4.31 12.357a3.333 3.333 0 0 0-.977 2.357v1.953h1.953c.884 0 1.732-.352 2.357-.977Z"></path><path d="m11.25 5.417 3.333 3.333"></path></g></svg>`,
  text:      `<svg width="18" height="18" viewBox="0 0 20 20" fill="currentColor"><path d="M4 4h12v2.5H12v9.5H8V6.5H4z"/></svg>`,
  undo:      `<svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8h9a4 4 0 010 8H8"/><path d="M7 5L4 8l3 3"/></svg>`,
  redo:      `<svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M16 8H7a4 4 0 000 8h5"/><path d="M13 5l3 3-3 3"/></svg>`,
  export:    `<svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M10 3v9M7 9l3 3 3-3"/><path d="M4 14v1.5A1.5 1.5 0 005.5 17h9a1.5 1.5 0 001.5-1.5V14"/></svg>`,
  import:    `<svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M2 7a2 2 0 012-2h3l2 2h5a2 2 0 012 2v5a2 2 0 01-2 2H4a2 2 0 01-2-2V7z"/></svg>`,
  fit:       `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><circle cx="8" cy="8" r="2.5"/><path d="M1 5V2h3M12 2h3v3M15 11v3h-3M4 14H1v-3"/></svg>`,
  imgPNG:    `<svg width="18" height="18" viewBox="0 0 20 20" fill="none" style="flex-shrink:0"><rect x="2" y="3" width="16" height="14" rx="2" stroke="currentColor" stroke-width="1.5"/><circle cx="7" cy="8" r="1.5" fill="currentColor"/><path d="M2 14l4-4 3 3 3-3 4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  imgSVG:    `<svg width="18" height="18" viewBox="0 0 20 20" fill="none" style="flex-shrink:0"><circle cx="4" cy="10" r="2.5" stroke="currentColor" stroke-width="1.5"/><circle cx="16" cy="10" r="2.5" stroke="currentColor" stroke-width="1.5"/><path d="M6.5 10C8 5 12 5 13.5 10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`,
  markasso:  `<svg width="18" height="18" viewBox="0 0 20 20" fill="none" style="flex-shrink:0"><rect x="3" y="2" width="14" height="16" rx="2" stroke="currentColor" stroke-width="1.5"/><path d="M7 7h6M7 10h6M7 13h4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`,
  mermaid:   `<svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="1" width="7" height="5" rx="1"/><rect x="12" y="14" width="7" height="5" rx="1"/><path d="M4.5 6v4h11v4"/><path d="M14 16l1.5-2 1.5 2"/></svg>`,
  layers:    `<svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M10 2L2 6l8 4 8-4z"/><path d="M2 10l8 4 8-4"/><path d="M2 14l8 4 8-4"/></svg>`,
  hamburger: `<svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><line x1="3" y1="6" x2="17" y2="6"/><line x1="3" y1="10" x2="17" y2="10"/><line x1="3" y1="14" x2="17" y2="14"/></svg>`,
  importImg: `<svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="16" height="14" rx="2"/><circle cx="7" cy="8" r="1.5"/><path d="M2 14l4-4 3 3 3-3 4 4"/><path d="M13 7l2-2 2 2M15 5v5"/></svg>`,
  eraser:    `<svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M3 17h14"/><path d="M5 17l-2-4 9-8 4 4-7 8H5z"/><path d="M12 5l4 4"/></svg>`,
  tap:       `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z"/></svg>`,
};

const TOOLS: { tool: ActiveTool; icon: string; label: string; key: string; num: string }[] = [
  { tool: 'hand',      icon: IC.hand,      label: t('hand'),      key: 'H / Space', num: '' },
  { tool: 'select',    icon: IC.select,    label: t('select'),    key: 'V / 1',     num: '1' },
  { tool: 'rectangle', icon: IC.rectangle, label: t('rectangle'), key: 'R / 2',     num: '2' },
  { tool: 'ellipse',   icon: IC.ellipse,   label: t('ellipse'),   key: 'E / 3',     num: '3' },
  { tool: 'rombo',     icon: IC.rombo,     label: t('rhombus'),   key: 'D / 4',     num: '4' },
  { tool: 'arrow',     icon: IC.arrow,     label: t('arrow'),     key: 'A / 5',     num: '5' },
  { tool: 'line',      icon: IC.line,      label: t('line'),      key: 'L / 6',     num: '6' },
  { tool: 'freehand',  icon: IC.freehand,  label: t('pen'),       key: 'P / 7',     num: '7' },
  { tool: 'text',      icon: IC.text,      label: t('textTool'),  key: 'T / 8',     num: '8' },
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
    if (t.tool === 'eraser') {
      const sep = document.createElement('span');
      sep.className = 'tb-separator';
      centerPill.appendChild(sep);
    }
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

  // ── Bottom-right: undo/redo ────────────────────────────────────────────────
  const bottomRight = div('tb-island-bottomright');

  const undoPill = div('tb-island tb-island-undo');
  undoPill.setAttribute('role', 'group');
  undoPill.setAttribute('aria-label', 'History');
  const undoBtn = mkBtn(IC.undo, t('undo'));
  const redoBtn = mkBtn(IC.redo, t('redo'));
  undoBtn.addEventListener('click', () => history.undo());
  redoBtn.addEventListener('click', () => history.redo());
  undoPill.append(undoBtn, redoBtn);
  bottomRight.append(undoPill);

  // ── Bottom-left: zoom ──────────────────────────────────────────────────────
  const bottomLeft = div('tb-island-bottomleft');

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

  bottomLeft.append(zoomPill);

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

  // Import .mmd (Mermaid)
  const mermaidInput = document.createElement('input');
  mermaidInput.type = 'file';
  mermaidInput.accept = '.mmd,.mermaid,text/plain';
  mermaidInput.style.display = 'none';
  container.appendChild(mermaidInput);
  mermaidInput.addEventListener('change', () => {
    const file = mermaidInput.files?.[0];
    if (file) importMermaid(file, history);
    mermaidInput.value = '';
  });
  const mermaidTrigger = mkBtn(IC.mermaid, t('importMermaid'));
  mermaidTrigger.addEventListener('click', () => mermaidInput.click());

  importIsland.append(importTrigger, mermaidTrigger);

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

  container.append(centerPill, bottomLeft, bottomRight, topRight, topLeft);

  // ── Mobile: tools FAB + popup ─────────────────────────────────────────────
  const toolsFab = document.createElement('button');
  toolsFab.id = 'mobile-tools-fab';
  toolsFab.innerHTML = IC.tap;

  const toolsPopup = document.createElement('div');
  toolsPopup.id = 'mobile-tools-popup';

  for (const toolDef of TOOLS) {
    const b = document.createElement('button');
    b.className = 'mobile-tools-popup-btn';
    b.title = toolDef.label;
    b.innerHTML = toolDef.icon;
    b.dataset['tool'] = toolDef.tool;
    b.addEventListener('click', () => {
      history.dispatch({ type: 'SET_TOOL', tool: toolDef.tool });
      toolsPopup.classList.remove('open');
      toolsFab.classList.remove('active');
    });
    toolsPopup.appendChild(b);
  }

  // Lock button row at the bottom of the popup
  const lockRowSep = document.createElement('div');
  lockRowSep.className = 'mobile-tools-popup-sep';
  const lockRowEl = document.createElement('div');
  lockRowEl.className = 'mobile-tools-popup-lock-row';
  const mobileLockBtn = document.createElement('button');
  mobileLockBtn.className = 'mobile-tools-popup-btn';
  mobileLockBtn.title = t('lockTool');
  mobileLockBtn.innerHTML = IC.lockOpen;
  mobileLockBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const locked = history.present.appState.toolLocked;
    history.dispatch({ type: 'SET_TOOL_LOCK', locked: !locked });
  });
  lockRowEl.appendChild(mobileLockBtn);
  toolsPopup.appendChild(lockRowSep);
  toolsPopup.appendChild(lockRowEl);

  toolsFab.addEventListener('click', () => {
    const open = toolsPopup.classList.toggle('open');
    toolsFab.classList.toggle('active', open);
  });

  document.addEventListener('pointerdown', (e) => {
    if (toolsPopup.classList.contains('open') && !toolsPopup.contains(e.target as Node) && e.target !== toolsFab) {
      toolsPopup.classList.remove('open');
      toolsFab.classList.remove('active');
    }
  }, { capture: true });

  container.append(toolsFab, toolsPopup);

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
    toolsPopup.querySelectorAll<HTMLButtonElement>('.mobile-tools-popup-btn[data-tool]').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset['tool'] === activeTool);
    });
    mobileLockBtn.innerHTML = toolLocked ? IC.lock : IC.lockOpen;
    mobileLockBtn.classList.toggle('active', toolLocked);
    mobileLockBtn.setAttribute('aria-pressed', String(toolLocked));
    toolsFab.innerHTML = (TOOLS.find(td => td.tool === activeTool)?.icon ?? IC.tap);
    toolsFab.dataset['tool'] = activeTool;
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
