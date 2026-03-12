import type { History } from '../engine/history';
import type { ActiveTool } from '../core/app_state';
import { exportPNG, exportSVG } from '../rendering/export';
import { fitToElements } from '../core/viewport';


// ── SVG icons ──────────────────────────────────────────────────────────────────
const IC = {
  select:    `<svg width="18" height="18" viewBox="0 0 20 20" fill="currentColor"><path d="M5.5 3v12.8l2.9-2.9 2.4 5.4 2.1-.95-2.4-5.4 3.8.001z"/></svg>`,
  rectangle: `<svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><rect x="3" y="5" width="14" height="10" rx="1.5"/></svg>`,
  ellipse:   `<svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8"><ellipse cx="10" cy="10" rx="7.5" ry="5.5"/></svg>`,
  line:      `<svg width="18" height="18" viewBox="0 0 20 20"><line x1="4" y1="16" x2="16" y2="4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`,
  arrow:     `<svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="16" x2="16" y2="4"/><path d="M9 4h7v7"/></svg>`,
  freehand:  `<svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M3 15c2-6 5-10 7-6s5 4 7-3"/></svg>`,
  text:      `<svg width="18" height="18" viewBox="0 0 20 20" fill="currentColor"><path d="M4 4h12v2.5H12v9.5H8V6.5H4z"/></svg>`,
  undo:      `<svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8h9a4 4 0 010 8H8"/><path d="M7 5L4 8l3 3"/></svg>`,
  redo:      `<svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M16 8H7a4 4 0 000 8h5"/><path d="M13 5l3 3-3 3"/></svg>`,
  export:    `<svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M10 3v9M7 9l3 3 3-3"/><path d="M4 14v1.5A1.5 1.5 0 005.5 17h9a1.5 1.5 0 001.5-1.5V14"/></svg>`,
  fit:       `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><circle cx="8" cy="8" r="2.5"/><path d="M1 5V2h3M12 2h3v3M15 11v3h-3M4 14H1v-3"/></svg>`,
  imgPNG:    `<svg width="18" height="18" viewBox="0 0 20 20" fill="none" style="flex-shrink:0"><rect x="2" y="3" width="16" height="14" rx="2" stroke="currentColor" stroke-width="1.5"/><circle cx="7" cy="8" r="1.5" fill="currentColor"/><path d="M2 14l4-4 3 3 3-3 4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  imgSVG:    `<svg width="18" height="18" viewBox="0 0 20 20" fill="none" style="flex-shrink:0"><circle cx="4" cy="10" r="2.5" stroke="currentColor" stroke-width="1.5"/><circle cx="16" cy="10" r="2.5" stroke="currentColor" stroke-width="1.5"/><path d="M6.5 10C8 5 12 5 13.5 10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`,
  layers:    `<svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M10 2L2 6l8 4 8-4z"/><path d="M2 10l8 4 8-4"/><path d="M2 14l8 4 8-4"/></svg>`,
  hamburger: `<svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><line x1="3" y1="6" x2="17" y2="6"/><line x1="3" y1="10" x2="17" y2="10"/><line x1="3" y1="14" x2="17" y2="14"/></svg>`,
  importImg: `<svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="16" height="14" rx="2"/><circle cx="7" cy="8" r="1.5"/><path d="M2 14l4-4 3 3 3-3 4 4"/><path d="M13 7l2-2 2 2M15 5v5"/></svg>`,
};

const TOOLS: { tool: ActiveTool; icon: string; label: string; key: string; num: string }[] = [
  { tool: 'select',    icon: IC.select,    label: 'Select',    key: 'V / 1', num: '1' },
  { tool: 'rectangle', icon: IC.rectangle, label: 'Rectangle', key: 'R / 2', num: '2' },
  { tool: 'ellipse',   icon: IC.ellipse,   label: 'Ellipse',   key: 'E / 3', num: '3' },
  { tool: 'line',      icon: IC.line,      label: 'Line',      key: 'L / 4', num: '4' },
  { tool: 'arrow',     icon: IC.arrow,     label: 'Arrow',     key: 'A / 5', num: '5' },
  { tool: 'freehand',  icon: IC.freehand,  label: 'Pen',       key: 'P / 6', num: '6' },
  { tool: 'text',      icon: IC.text,      label: 'Text',      key: 'T / 7', num: '7' },
];

export function initToolbar(container: HTMLElement, history: History): void {
  container.innerHTML = '';

  // ── Center-top: tool buttons pill ─────────────────────────────────────────
  const centerPill = div('tb-island tb-island-tools');
  const toolBtns = new Map<ActiveTool, HTMLButtonElement>();

  for (const t of TOOLS) {
    const b = document.createElement('button');
    b.className = 'tb-btn';
    b.title = `${t.label} (${t.key})`;
    b.innerHTML = `${t.icon}<span class="tb-btn-key">${t.num}</span>`;
    b.addEventListener('click', () => history.dispatch({ type: 'SET_TOOL', tool: t.tool }));
    toolBtns.set(t.tool, b);
    centerPill.appendChild(b);
  }

  // ── Bottom-left: undo/redo + zoom ─────────────────────────────────────────
  const bottomLeft = div('tb-island-bottomleft');

  // Undo / Redo
  const undoPill = div('tb-island tb-island-undo');
  const undoBtn = mkBtn(IC.undo, 'Undo (Ctrl+Z)');
  const redoBtn = mkBtn(IC.redo, 'Redo (Ctrl+Y)');
  undoBtn.addEventListener('click', () => history.undo());
  redoBtn.addEventListener('click', () => history.redo());
  undoPill.append(undoBtn, redoBtn);

  // Zoom
  const zoomPill = div('tb-island tb-island-zoom');
  const fitBtn   = mkBtn(IC.fit, 'Fit to content (F)');
  const minusBtn = mkBtn('−', 'Zoom out');
  const plusBtn  = mkBtn('+', 'Zoom in');
  minusBtn.style.fontSize = plusBtn.style.fontSize = '18px';
  const zoomLabel = document.createElement('button');
  zoomLabel.className = 'tb-btn tb-zoom-btn';
  zoomLabel.title = 'Reset zoom to 100% (Shift+0)';
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

  // ── Top-right: export dropdown + settings placeholder ─────────────────────
  const topRight = div('tb-island-topright');

  // Export dropdown
  const exportIsland = div('tb-island');
  exportIsland.style.position = 'relative';
  const exportTrigger = mkBtn(IC.export, 'Export');
  const exportPanel = document.createElement('div');
  exportPanel.style.cssText = [
    'position:absolute', 'right:0', 'top:calc(100% + 6px)',
    'background:rgba(26,26,40,0.98)', 'border:1px solid rgba(255,255,255,0.1)',
    'border-radius:10px', 'padding:4px', 'display:none',
    'flex-direction:column', 'gap:2px', 'min-width:148px',
    'box-shadow:0 4px 24px rgba(0,0,0,0.6)', 'z-index:1000',
    'backdrop-filter:blur(16px)',
  ].join(';');

  const askBackground = (): boolean => confirm('Include white background?');

  exportPanel.append(
    menuItem('Export PNG', IC.imgPNG, () => exportPNG(history.present, askBackground())),
    menuItem('Export SVG', IC.imgSVG, () => exportSVG(history.present, askBackground())),
  );

  let panelOpen = false;
  exportTrigger.addEventListener('click', (e) => {
    e.stopPropagation();
    panelOpen = !panelOpen;
    exportPanel.style.display = panelOpen ? 'flex' : 'none';
  });
  document.addEventListener('click', () => {
    if (panelOpen) { panelOpen = false; exportPanel.style.display = 'none'; }
  });
  exportIsland.append(exportTrigger, exportPanel);

  topRight.append(exportIsland);

  // Top-left: settings button injected by settings.ts
  const topLeft = div('tb-island-topleft');
  const tbLeft = div('tb-island tb-left');
  topLeft.append(tbLeft);

  container.append(centerPill, bottomLeft, topRight, topLeft);

  // ── Sync ──────────────────────────────────────────────────────────────────
  function sync(): void {
    const { activeTool } = history.present.appState;
    for (const [t, b] of toolBtns) b.classList.toggle('active', t === activeTool);
    undoBtn.disabled = !history.canUndo();
    redoBtn.disabled = !history.canRedo();
    zoomLabel.textContent = `${Math.round(history.present.viewport.zoom * 100)}%`;
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
