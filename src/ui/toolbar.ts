import type { History } from '../engine/history';
import type { ActiveTool } from '../core/app_state';
import { exportPNG, exportSVG, exportHTML } from '../rendering/export';
import { buildShareUrl } from '../io/share';
import { exportMarkasso, importMarkasso } from '../io/markasso';
import { importMermaid } from '../io/mermaid';
import { PRESETS } from '../io/presets';
import { fitToElements } from '../core/viewport';
import { t } from '../i18n';

// ── SVG icons ──────────────────────────────────────────────────────────────────
const IC = {
  lock:         `<svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12.5 3.75l-3.33 3.33-3.33 1.25-1.25 1.25 5.83 5.83 1.25-1.25 1.25-3.33 3.33-3.33z" fill="currentColor" stroke="none"/><line x1="7.5" y1="12.5" x2="3.75" y2="16.25"/><line x1="12.08" y1="3.33" x2="16.67" y2="7.92"/></svg>`,
  lockOpen:     `<svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12.5 3.75l-3.33 3.33-3.33 1.25-1.25 1.25 5.83 5.83 1.25-1.25 1.25-3.33 3.33-3.33z"/><line x1="7.5" y1="12.5" x2="3.75" y2="16.25"/><line x1="12.08" y1="3.33" x2="16.67" y2="7.92"/></svg>`,
  elemLocked:   `<svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="9" width="10" height="8" rx="1.5"/><path d="M7 9V6a3 3 0 0 1 6 0v3"/></svg>`,
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
  toolbox:   `<svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="6" height="6" rx="1.5"/><rect x="12" y="2" width="6" height="6" rx="1.5"/><rect x="2" y="12" width="6" height="6" rx="1.5"/><rect x="12" y="12" width="6" height="6" rx="1.5"/></svg>`,
  close:     `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="2" y1="2" x2="14" y2="14"/><line x1="14" y1="2" x2="2" y2="14"/></svg>`,
  sticky:    `<svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 3h12a1 1 0 011 1v9l-4 4H4a1 1 0 01-1-1V4a1 1 0 011-1z"/><path d="M13 13v3.5L17 13h-4z" fill="currentColor" stroke="none"/><line x1="6" y1="7" x2="14" y2="7"/><line x1="6" y1="10" x2="11" y2="10"/></svg>`,
  curve:     `<svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M3 16 Q10 2 17 16"/></svg>`,
  polygon:   `<svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M10 3l7 6.5-2.5 7h-9L3 9.5z"/></svg>`,
};

type ToolDef = { tool: ActiveTool; icon: string; label: string; key: string; num: string };

// Main toolbar buttons — sequential ordinal badges on the main row; eraser keeps its 0 shortcut badge.
const TOOLS: ToolDef[] = [
  { tool: 'hand',      icon: IC.hand,      label: t('hand'),      key: 'H / Space', num: '' },
  { tool: 'select',    icon: IC.select,    label: t('select'),    key: 'V / 1',     num: '1' },
  { tool: 'rectangle', icon: IC.rectangle, label: t('rectangle'), key: 'R / 2',     num: '2' },
  { tool: 'rombo',     icon: IC.rombo,     label: t('rhombus'),   key: 'D / 3',     num: '3' },
  { tool: 'ellipse',   icon: IC.ellipse,   label: t('ellipse'),   key: 'E / 4',     num: '4' },
  { tool: 'line',      icon: IC.line,      label: t('line'),      key: 'A / L / 5', num: '5' },
  { tool: 'freehand',  icon: IC.freehand,  label: t('pen'),       key: 'P / 6',     num: '6' },
  { tool: 'text',      icon: IC.text,      label: t('textTool'),  key: 'T / 7',     num: '7' },
  { tool: 'eraser',    icon: IC.eraser,    label: t('eraser'),    key: '0',         num: '0' },
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

  TOOLS.forEach((toolDef) => {
    if (toolDef.tool === 'eraser') {
      const sep = document.createElement('span');
      sep.className = 'tb-separator';
      centerPill.appendChild(sep);
    }
    const b = document.createElement('button');
    b.className = 'tb-btn';
    b.title = `${toolDef.label} (${toolDef.key})`;
    b.setAttribute('aria-label', toolDef.label);
    b.setAttribute('aria-pressed', 'false');
    b.innerHTML = `${toolDef.icon}${toolDef.num ? `<span class="tb-btn-key">${toolDef.num}</span>` : ''}`;
    b.addEventListener('click', () => history.dispatch({ type: 'SET_TOOL', tool: toolDef.tool }));
    toolBtns.set(toolDef.tool, b);
    centerPill.appendChild(b);
  });

  // Locked-elements indicator — shown when selection contains locked elements
  const lockedSep = document.createElement('span');
  lockedSep.className = 'tb-separator';
  lockedSep.style.display = 'none';
  const lockedIndicator = document.createElement('button');
  lockedIndicator.className = 'tb-btn tb-locked-indicator';
  lockedIndicator.innerHTML = IC.elemLocked;
  lockedIndicator.style.display = 'none';
  lockedIndicator.addEventListener('click', () => {
    const scene = history.present;
    const ids = [...scene.selectedIds].filter(id => scene.elements.find(el => el.id === id)?.locked);
    if (ids.length > 0) history.dispatch({ type: 'UNLOCK_ELEMENTS', ids });
  });
  centerPill.appendChild(lockedSep);
  centerPill.appendChild(lockedIndicator);

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
  const exportHTMLItem     = menuItem(t('exportHTML'),     IC.export,   () => exportHTML(history.present));
  const exportMarkassoItem = menuItem(t('saveMarkasso'),   IC.markasso, () => exportMarkasso(history.present));
  exportPanel.append(exportPNGItem, exportSVGItem, exportHTMLItem, exportMarkassoItem);

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

  // Share island (dropdown)
  const IC_SHARE = `<svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="15" cy="5" r="2"/><circle cx="5" cy="10" r="2"/><circle cx="15" cy="15" r="2"/><path d="M7 9l6-3M7 11l6 3"/></svg>`;
  const IC_LINK_SM  = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>`;
  const IC_LINKEDIN = `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>`;
  const IC_FACEBOOK = `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>`;
  const IC_INSTAGRAM = `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/></svg>`;
  const IC_REDDIT   = `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0zm5.01 4.744c.688 0 1.25.561 1.25 1.249a1.25 1.25 0 0 1-2.498.056l-2.597-.547-.8 3.747c1.824.07 3.48.632 4.674 1.488.308-.309.73-.491 1.207-.491.968 0 1.754.786 1.754 1.754 0 .716-.435 1.333-1.01 1.614a3.111 3.111 0 0 1 .042.52c0 2.694-3.13 4.87-7.004 4.87-3.874 0-7.004-2.176-7.004-4.87 0-.183.015-.366.043-.534A1.748 1.748 0 0 1 4.028 12c0-.968.786-1.754 1.754-1.754.463 0 .898.196 1.207.49 1.207-.883 2.878-1.43 4.744-1.487l.885-4.182a.342.342 0 0 1 .14-.197.35.35 0 0 1 .238-.042l2.906.617a1.214 1.214 0 0 1 1.108-.701zM9.25 12C8.561 12 8 12.562 8 13.25c0 .687.561 1.248 1.25 1.248.687 0 1.248-.561 1.248-1.249 0-.688-.561-1.249-1.249-1.249zm5.5 0c-.687 0-1.248.561-1.248 1.25 0 .687.561 1.248 1.249 1.248.688 0 1.249-.561 1.249-1.249 0-.687-.562-1.249-1.25-1.249zm-5.466 3.99a.327.327 0 0 0-.231.094.33.33 0 0 0 0 .463c.842.842 2.484.913 2.961.913.477 0 2.105-.056 2.961-.913a.361.361 0 0 0 .029-.463.33.33 0 0 0-.464 0c-.547.533-1.684.73-2.512.73-.828 0-1.979-.196-2.512-.73a.326.326 0 0 0-.232-.095z"/></svg>`;

  const shareIsland = div('tb-island');
  shareIsland.style.position = 'relative';
  const shareBtn = mkBtn(IC_SHARE, t('shareLink'));
  shareBtn.setAttribute('aria-expanded', 'false');

  const sharePanel = document.createElement('div');
  sharePanel.setAttribute('role', 'menu');
  sharePanel.style.cssText = [
    'position:absolute', 'right:0', 'top:calc(100% + 6px)',
    'background:rgba(26,26,40,0.98)', 'border:1px solid rgba(255,255,255,0.1)',
    'border-radius:10px', 'padding:4px', 'display:none',
    'flex-direction:column', 'gap:2px', 'min-width:196px',
    'box-shadow:0 4px 24px rgba(0,0,0,0.6)', 'z-index:1000',
    'backdrop-filter:blur(16px)',
  ].join(';');

  /** Copy text to clipboard reliably: modern API first, textarea fallback second. */
  function copyToClipboard(text: string): boolean {
    if (navigator.clipboard && document.hasFocus()) {
      navigator.clipboard.writeText(text).catch(() => { /* handled below */ });
    }
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.cssText = 'position:fixed;left:-9999px;top:-9999px;opacity:0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return ok;
    } catch {
      return false;
    }
  }

  /** Show a small toast below the button. */
  function showShareToast(success: boolean, url: string, okMsg?: string): void {
    const existing = document.getElementById('share-toast');
    if (existing) existing.remove();
    const toast = document.createElement('div');
    toast.id = 'share-toast';
    if (success) {
      toast.className = 'share-toast share-toast--ok';
      toast.textContent = okMsg ?? t('shareLinkCopied');
    } else {
      toast.className = 'share-toast share-toast--fallback';
      toast.innerHTML = `<span>${t('shareLink')}</span><input class="share-toast-input" readonly value="${url.replace(/"/g, '&quot;')}" />`;
      requestAnimationFrame(() => {
        const inp = toast.querySelector<HTMLInputElement>('.share-toast-input');
        inp?.select();
      });
    }
    document.body.appendChild(toast);
    if (success) setTimeout(() => toast.remove(), 3000);
    toast.addEventListener('click', (e) => { if (e.target === toast) toast.remove(); });
  }

  const shareCopyLinkItem = menuItem(t('shareCopyLink'), IC_LINK_SM, async () => {
    const url = await buildShareUrl(history.present.elements);
    const ok = copyToClipboard(url);
    showShareToast(ok, url);
  });
  const shareLinkedInItem = menuItem(t('shareLinkedIn'), IC_LINKEDIN, async () => {
    const url = await buildShareUrl(history.present.elements);
    window.open(`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`, '_blank', 'noopener');
  });
  const shareFacebookItem = menuItem(t('shareFacebook'), IC_FACEBOOK, async () => {
    const url = await buildShareUrl(history.present.elements);
    window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`, '_blank', 'noopener');
  });
  const shareInstagramItem = menuItem(t('shareInstagram'), IC_INSTAGRAM, async () => {
    const url = await buildShareUrl(history.present.elements);
    copyToClipboard(url);
    showShareToast(true, url, t('shareInstagramNote'));
  });
  const shareRedditItem = menuItem(t('shareReddit'), IC_REDDIT, async () => {
    const url = await buildShareUrl(history.present.elements);
    window.open(`https://www.reddit.com/submit?url=${encodeURIComponent(url)}&title=Check%20out%20my%20Markasso%20drawing`, '_blank', 'noopener');
  });
  sharePanel.append(shareCopyLinkItem, shareRedditItem, shareLinkedInItem, shareFacebookItem, shareInstagramItem);

  let sharePanelOpen = false;
  shareBtn.addEventListener('click', (e) => {
    if (history.present.elements.length === 0) return;
    e.stopPropagation();
    sharePanelOpen = !sharePanelOpen;
    sharePanel.style.display = sharePanelOpen ? 'flex' : 'none';
    shareBtn.setAttribute('aria-expanded', String(sharePanelOpen));
    if (sharePanelOpen) sharePanel.querySelector<HTMLButtonElement>('button')?.focus();
  });
  sharePanel.addEventListener('click', () => {
    sharePanelOpen = false;
    shareBtn.setAttribute('aria-expanded', 'false');
  });
  shareIsland.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && sharePanelOpen) {
      sharePanelOpen = false;
      sharePanel.style.display = 'none';
      shareBtn.setAttribute('aria-expanded', 'false');
      shareBtn.focus();
    }
  });
  document.addEventListener('click', () => {
    if (sharePanelOpen) {
      sharePanelOpen = false;
      sharePanel.style.display = 'none';
      shareBtn.setAttribute('aria-expanded', 'false');
    }
  });
  shareIsland.append(shareBtn, sharePanel);

  // Presets dropdown
  const presetsIsland = div('tb-island');
  presetsIsland.style.position = 'relative';
  const presetsTrigger = mkBtn(IC.toolbox, t('presets'));
  presetsTrigger.setAttribute('aria-expanded', 'false');
  const presetsPanel = document.createElement('div');
  presetsPanel.setAttribute('role', 'menu');
  presetsPanel.style.cssText = [
    'position:absolute', 'right:0', 'top:calc(100% + 6px)',
    'background:rgba(26,26,40,0.98)', 'border:1px solid rgba(255,255,255,0.1)',
    'border-radius:10px', 'padding:8px', 'display:none',
    'grid-template-columns:1fr 1fr', 'gap:6px', 'min-width:260px',
    'box-shadow:0 4px 24px rgba(0,0,0,0.6)', 'z-index:1000',
    'backdrop-filter:blur(16px)',
  ].join(';');

  for (const def of PRESETS) {
    const card = document.createElement('button');
    card.setAttribute('role', 'menuitem');
    card.style.cssText = [
      'display:flex', 'flex-direction:column', 'align-items:center', 'gap:6px',
      'padding:10px 8px', 'border-radius:8px', 'cursor:pointer',
      'background:rgba(255,255,255,0.04)', 'border:1px solid rgba(255,255,255,0.08)',
      'color:inherit', 'font:11px/1.2 inherit', 'text-align:center',
      'transition:background .1s,border-color .1s', 'white-space:nowrap',
    ].join(';');
    card.innerHTML = `${def.icon}<span>${t(def.labelKey)}</span>`;
    card.addEventListener('mouseenter', () => {
      card.style.background = 'rgba(255,255,255,0.09)';
      card.style.borderColor = 'var(--accent, #c42059)';
    });
    card.addEventListener('mouseleave', () => {
      card.style.background = 'rgba(255,255,255,0.04)';
      card.style.borderColor = 'rgba(255,255,255,0.08)';
    });
    card.addEventListener('click', () => {
      const vp = history.present.viewport;
      const cx = (window.innerWidth  / 2 - vp.offsetX) / vp.zoom;
      const cy = (window.innerHeight / 2 - vp.offsetY) / vp.zoom;
      const isDark = document.documentElement.getAttribute('data-theme') !== 'light';
      const elements = def.buildElements(cx, cy, isDark);
      history.dispatch({ type: 'CREATE_ELEMENTS', elements });
      history.dispatch({ type: 'GROUP_ELEMENTS', ids: elements.map((e) => e.id), groupId: crypto.randomUUID() });
      presetsPanelOpen = false;
      presetsPanel.style.display = 'none';
      presetsTrigger.setAttribute('aria-expanded', 'false');
    });
    presetsPanel.appendChild(card);
  }

  let presetsPanelOpen = false;
  presetsTrigger.addEventListener('click', (e) => {
    e.stopPropagation();
    presetsPanelOpen = !presetsPanelOpen;
    presetsPanel.style.display = presetsPanelOpen ? 'grid' : 'none';
    presetsTrigger.setAttribute('aria-expanded', String(presetsPanelOpen));
    if (presetsPanelOpen) presetsPanel.querySelector<HTMLButtonElement>('button')?.focus();
  });
  presetsIsland.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && presetsPanelOpen) {
      presetsPanelOpen = false;
      presetsPanel.style.display = 'none';
      presetsTrigger.setAttribute('aria-expanded', 'false');
      presetsTrigger.focus();
    }
  });
  document.addEventListener('click', () => {
    if (presetsPanelOpen) {
      presetsPanelOpen = false;
      presetsPanel.style.display = 'none';
      presetsTrigger.setAttribute('aria-expanded', 'false');
    }
  });
  presetsIsland.append(presetsTrigger, presetsPanel);

  topRight.append(importIsland, presetsIsland, exportIsland, shareIsland);

  // Top-left: settings button injected by settings.ts
  const topLeft = div('tb-island-topleft');
  const tbLeft = div('tb-island tb-left');
  topLeft.append(tbLeft);

  container.append(centerPill, bottomLeft, bottomRight, topRight, topLeft);

  // ── Mobile: tools FAB + popup ─────────────────────────────────────────────
  const toolsFab = document.createElement('button');
  toolsFab.id = 'mobile-tools-fab';
  toolsFab.innerHTML = IC.toolbox;

  const toolsPopup = document.createElement('div');
  toolsPopup.id = 'mobile-tools-popup';

  // Mobile tools mirror the desktop toolbar exactly.
  const mobileTools: ToolDef[] = [...TOOLS];

  for (const toolDef of mobileTools) {
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
    toolsFab.innerHTML = open ? IC.close : IC.toolbox;
  });

  document.addEventListener('pointerdown', (e) => {
    if (toolsPopup.classList.contains('open') && !toolsPopup.contains(e.target as Node) && e.target !== toolsFab) {
      toolsPopup.classList.remove('open');
      toolsFab.classList.remove('active');
      toolsFab.innerHTML = IC.toolbox;
    }
  }, { capture: true });

  container.append(toolsFab, toolsPopup);

  // ── Sync ──────────────────────────────────────────────────────────────────
  function sync(): void {
    const { activeTool, toolLocked } = history.present.appState;
    lockBtn.classList.toggle('active', toolLocked);
    lockBtn.setAttribute('aria-pressed', String(toolLocked));
    lockBtn.innerHTML = toolLocked ? IC.lock : IC.lockOpen;
    for (const [toolName, b] of toolBtns) {
      const isActive = toolName === activeTool;
      b.classList.toggle('active', isActive);
      b.setAttribute('aria-pressed', String(isActive));
    }
    toolsPopup.querySelectorAll<HTMLButtonElement>('.mobile-tools-popup-btn[data-tool]').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset['tool'] === activeTool);
    });
    mobileLockBtn.innerHTML = toolLocked ? IC.lock : IC.lockOpen;
    mobileLockBtn.classList.toggle('active', toolLocked);
    mobileLockBtn.setAttribute('aria-pressed', String(toolLocked));
    toolsFab.dataset['tool'] = activeTool;
    undoBtn.disabled = !history.canUndo();
    redoBtn.disabled = !history.canRedo();
    zoomLabel.textContent = `${Math.round(history.present.viewport.zoom * 100)}%`;
    const hasElements = history.present.elements.length > 0;
    exportTrigger.disabled = !hasElements;
    exportPNGItem.disabled = !hasElements;
    exportSVGItem.disabled = !hasElements;

    exportHTMLItem.disabled = !hasElements;
    exportMarkassoItem.disabled = !hasElements;
    shareBtn.disabled = !hasElements;

    // Locked-elements indicator
    const scene = history.present;
    const hasLockedSelected = scene.selectedIds.size > 0 &&
      [...scene.selectedIds].some(id => scene.elements.find(el => el.id === id)?.locked);
    lockedSep.style.display = hasLockedSelected ? '' : 'none';
    lockedIndicator.style.display = hasLockedSelected ? '' : 'none';
    if (hasLockedSelected) {
      const allLocked = [...scene.selectedIds].every(id => scene.elements.find(el => el.id === id)?.locked);
      lockedIndicator.title = allLocked ? t('unlockElements') : t('unlockElements');
    }
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
