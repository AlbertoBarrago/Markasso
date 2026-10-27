import type { ActiveTool } from '../core/app_state';
import { fitToElements } from '../core/viewport';
import type { History } from '../engine/history';
import { t } from '../i18n';
import { importMermaidText } from '../io/mermaid';
import { PRESETS } from '../io/presets';
import {
  buildLiveRoomUrl,
  generateRoomId,
  getStoredName,
  joinLiveSession,
  onLivePeers,
  setLiveName,
} from '../io/realtime';
import { toggleLibrary } from './library_panel';
import { onLiveHide, onLiveReveal, setLiveUI } from './live_name';
import { initPeopleList } from './people_list';
import {
  copyToClipboard,
  showLiveStatusToast,
  showShareToast,
} from './share_actions';
import { initToolbarDrag } from './toolbar_drag';
import { initTooltips } from './tooltip';

// ── SVG icons ──────────────────────────────────────────────────────────────────
const IC = {
  dragHandle: `<svg class="drag-handle" aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M10 13a1 1 0 100-2 1 1 0 000 2zm-4 0a1 1 0 100-2 1 1 0 000 2zm1-5a1 1 0 11-2 0 1 1 0 012 0zm3 1a1 1 0 100-2 1 1 0 000 2zm1-5a1 1 0 11-2 0 1 1 0 012 0zM6 5a1 1 0 100-2 1 1 0 000 2z"></path></svg>`,
  lock: `<svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12.5 3.75l-3.33 3.33-3.33 1.25-1.25 1.25 5.83 5.83 1.25-1.25 1.25-3.33 3.33-3.33z" fill="currentColor" stroke="none"/><line x1="7.5" y1="12.5" x2="3.75" y2="16.25"/><line x1="12.08" y1="3.33" x2="16.67" y2="7.92"/></svg>`,
  lockOpen: `<svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12.5 3.75l-3.33 3.33-3.33 1.25-1.25 1.25 5.83 5.83 1.25-1.25 1.25-3.33 3.33-3.33z"/><line x1="7.5" y1="12.5" x2="3.75" y2="16.25"/><line x1="12.08" y1="3.33" x2="16.67" y2="7.92"/></svg>`,
  elemLocked: `<svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="9" width="10" height="8" rx="1.5"/><path d="M7 9V6a3 3 0 0 1 6 0v3"/></svg>`,
  hand: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M8 13v-7.5a1.5 1.5 0 0 1 3 0v6.5"/><path d="M11 5.5v-2a1.5 1.5 0 1 1 3 0v8.5"/><path d="M14 5.5a1.5 1.5 0 0 1 3 0v6.5"/><path d="M17 7.5a1.5 1.5 0 0 1 3 0v8.5a6 6 0 0 1 -6 6h-2h.208a6 6 0 0 1 -5.012 -2.7a69.74 69.74 0 0 1 -.196 -.3c-.312 -.479 -1.407 -2.388 -3.286 -5.728a1.5 1.5 0 0 1 .536 -2.022a1.867 1.867 0 0 1 2.28 .28l1.47 1.47"/></svg>`,
  select: `<svg width="18" height="18" viewBox="0 0 20 20" fill="currentColor"><path d="M5.5 3v12.8l2.9-2.9 2.4 5.4 2.1-.95-2.4-5.4 3.8.001z"/></svg>`,
  rectangle: `<svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><rect x="3" y="5" width="14" height="10" rx="1.5"/></svg>`,
  ellipse: `<svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8"><ellipse cx="10" cy="10" rx="7.5" ry="5.5"/></svg>`,
  arrow: `<svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="16" x2="16" y2="4"/><path d="M9 4h7v7"/></svg>`,
  rombo: `<svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M10 3l7 7-7 7-7-7z"/></svg>`,
  freehand: `<svg width="18" height="18" aria-hidden="true" focusable="false" role="img" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.55" stroke-linecap="round" stroke-linejoin="round"><path d="M12.8 3.4l3.8 3.8-7.9 7.9-3.8-3.8z"/><path d="M4.9 11.3c-1.2 1-1.8 2.2-1.8 3.6 0 1.2-.4 2-1.1 2.7 2 .2 4.3-.2 5.8-1.7l.9-.8"/><path d="M11.6 4.6l3.8 3.8"/></svg>`,
  text: `<svg width="18" height="18" viewBox="0 0 20 20" fill="currentColor"><path d="M4 4h12v2.5H12v9.5H8V6.5H4z"/></svg>`,
  undo: `<svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8h9a4 4 0 010 8H8"/><path d="M7 5L4 8l3 3"/></svg>`,
  redo: `<svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M16 8H7a4 4 0 000 8h5"/><path d="M13 5l3 3-3 3"/></svg>`,
  fit: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><circle cx="8" cy="8" r="2.5"/><path d="M1 5V2h3M12 2h3v3M15 11v3h-3M4 14H1v-3"/></svg>`,
  layers: `<svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M10 2L2 6l8 4 8-4z"/><path d="M2 10l8 4 8-4"/><path d="M2 14l8 4 8-4"/></svg>`,
  hamburger: `<svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><line x1="3" y1="6" x2="17" y2="6"/><line x1="3" y1="10" x2="17" y2="10"/><line x1="3" y1="14" x2="17" y2="14"/></svg>`,
  importImg: `<svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="16" height="14" rx="2"/><circle cx="7" cy="8" r="1.5"/><path d="M2 14l4-4 3 3 3-3 4 4"/><path d="M13 7l2-2 2 2M15 5v5"/></svg>`,
  eraser: `<svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M3 17h14"/><path d="M5 17l-2-4 9-8 4 4-7 8H5z"/><path d="M12 5l4 4"/></svg>`,
  library: `<svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3.5" width="3.5" height="13" rx="0.8"/><rect x="8" y="3.5" width="3.5" height="13" rx="0.8"/><path d="M13.2 4.6l3.2-.9 3 11.6-3.2.9z"/></svg>`,
  toolbox: `<svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="6" height="6" rx="1.5"/><rect x="12" y="2" width="6" height="6" rx="1.5"/><rect x="2" y="12" width="6" height="6" rx="1.5"/><rect x="12" y="12" width="6" height="6" rx="1.5"/></svg>`,
  close: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="2" y1="2" x2="14" y2="14"/><line x1="14" y1="2" x2="2" y2="14"/></svg>`,
  sticky: `<svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 3h12a1 1 0 011 1v9l-4 4H4a1 1 0 01-1-1V4a1 1 0 011-1z"/><path d="M13 13v3.5L17 13h-4z" fill="currentColor" stroke="none"/><line x1="6" y1="7" x2="14" y2="7"/><line x1="6" y1="10" x2="11" y2="10"/></svg>`,
  curve: `<svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M3 16 Q10 2 17 16"/></svg>`,
  polygon: `<svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M10 3l7 6.5-2.5 7h-9L3 9.5z"/></svg>`,
};

type ToolDef = {
  tool: ActiveTool;
  icon: string;
  label: string;
  key: string;
  num: string;
};

// Main toolbar buttons — sequential ordinal badges on the main row; eraser keeps its 0 shortcut badge.
const TOOLS: ToolDef[] = [
  { tool: 'hand', icon: IC.hand, label: t('hand'), key: 'H / Space', num: '' },
  {
    tool: 'select',
    icon: IC.select,
    label: t('select'),
    key: 'V / 1',
    num: '1',
  },
  {
    tool: 'rectangle',
    icon: IC.rectangle,
    label: t('rectangle'),
    key: 'R / 2',
    num: '2',
  },
  {
    tool: 'rombo',
    icon: IC.rombo,
    label: t('rhombus'),
    key: 'D / 3',
    num: '3',
  },
  {
    tool: 'ellipse',
    icon: IC.ellipse,
    label: t('ellipse'),
    key: 'E / 4',
    num: '4',
  },
  {
    tool: 'line',
    icon: IC.arrow,
    label: `${t('arrow')} / ${t('line')}`,
    key: 'A / L / 5',
    num: '5',
  },
  {
    tool: 'freehand',
    icon: IC.freehand,
    label: t('pen'),
    key: 'P / 6',
    num: '6',
  },
  { tool: 'text', icon: IC.text, label: t('textTool'), key: 'T / 7', num: '7' },
  {
    tool: 'sticky',
    icon: IC.sticky,
    label: t('stickyNote').replace(/\s*\(N\)$/, ''),
    key: 'N',
    num: 'N',
  },
  { tool: 'eraser', icon: IC.eraser, label: t('eraser'), key: '0', num: '0' },
];

export function initToolbar(
  container: HTMLElement,
  history: History,
  openImagePicker: () => void,
): void {
  container.innerHTML = '';

  // ── Center-bottom: tool buttons pill ──────────────────────────────────────
  const centerPill = div('tb-island tb-island-tools');
  centerPill.setAttribute('role', 'toolbar');
  centerPill.setAttribute('aria-label', 'Drawing tools');
  const toolBtns = new Map<ActiveTool, HTMLButtonElement>();

  // Drag handle: docks the toolbar; double-click resets to bottom-center
  const dragHandle = mkBtn(IC.dragHandle, t('moveToolbarHint'));
  dragHandle.classList.add('tb-drag-handle');
  dragHandle.setAttribute('aria-label', t('moveToolbar'));
  dragHandle.setAttribute('aria-pressed', 'false');
  centerPill.appendChild(dragHandle);

  // Separator after the drag handle
  const dragSep = document.createElement('span');
  dragSep.className = 'tb-separator';
  centerPill.appendChild(dragSep);

  // Lock button (no shortcut badge)
  const lockBtn = document.createElement('button');
  lockBtn.className = 'tb-btn';
  lockBtn.title = t('lockTool');
  lockBtn.setAttribute('aria-label', t('lockTool'));
  lockBtn.setAttribute('aria-pressed', 'false');
  lockBtn.innerHTML = IC.lockOpen;
  const toggleToolLock = (): void => {
    const locked = history.present.appState.toolLocked;
    history.dispatch({ type: 'SET_TOOL_LOCK', locked: !locked });
  };
  lockBtn.addEventListener('click', toggleToolLock);
  centerPill.appendChild(lockBtn);

  // Separator after lock
  const lockSep = document.createElement('span');
  lockSep.className = 'tb-separator';
  centerPill.appendChild(lockSep);

  const toolBtnHTML = (toolDef: ToolDef): string =>
    `${toolDef.icon}${toolDef.num ? `<span class="tb-btn-key">${toolDef.num}</span>` : ''}`;

  for (const toolDef of TOOLS) {
    const b = mkBtn(toolBtnHTML(toolDef), `${toolDef.label} (${toolDef.key})`);
    b.setAttribute('aria-label', toolDef.label);
    b.setAttribute('aria-pressed', 'false');
    b.dataset.tool = toolDef.tool;
    b.addEventListener('click', () => {
      setMoreOpen(false);
      history.dispatch({ type: 'SET_TOOL', tool: toolDef.tool });
    });
    toolBtns.set(toolDef.tool, b);
    centerPill.appendChild(b);
  }

  const moreGroup = div('tb-tool-group tb-more-group');
  const moreToggle = mkBtn('⋯', t('moreTools'));
  moreToggle.id = 'tb-more-tools';
  moreToggle.setAttribute('aria-haspopup', 'menu');
  moreToggle.setAttribute('aria-expanded', 'false');
  const morePanel = div('tb-tool-group-panel tb-more-panel');
  morePanel.id = 'tb-more-panel';
  morePanel.setAttribute('role', 'menu');
  morePanel.setAttribute('aria-labelledby', moreToggle.id);
  moreToggle.setAttribute('aria-controls', morePanel.id);
  const moreRoot = div('tb-more-root');
  moreRoot.setAttribute('role', 'group');
  morePanel.appendChild(moreRoot);
  const presetList = div('tb-preset-list');
  presetList.setAttribute('role', 'group');
  presetList.setAttribute('aria-label', t('presets'));
  presetList.hidden = true;
  morePanel.appendChild(presetList);
  const overflowTools = new Map<ActiveTool, HTMLButtonElement>();
  function addMoreItem(
    icon: string,
    label: string,
    run: () => void,
    shortcut = '',
  ): HTMLButtonElement {
    const b = document.createElement('button');
    b.className = 'menu-item';
    b.setAttribute('role', 'menuitem');
    b.tabIndex = -1;
    if (shortcut)
      b.setAttribute('aria-keyshortcuts', shortcut.replace(/\s*\/\s*/g, ' '));
    b.innerHTML = `${icon}<span class="menu-item-label">${label}</span>${shortcut ? `<kbd class="menu-item-kbd">${shortcut}</kbd>` : ''}`;
    b.addEventListener('click', () => {
      if (b.getAttribute('aria-disabled') === 'true') return;
      setMoreOpen(false);
      focusMoreTrigger();
      run();
    });
    moreRoot.appendChild(b);
    return b;
  }
  const secondaryTools: ActiveTool[] = ['freehand', 'text', 'sticky', 'eraser'];
  for (const tool of TOOLS.filter((d) => secondaryTools.includes(d.tool))) {
    const b = addMoreItem(
      tool.icon,
      tool.label,
      () => history.dispatch({ type: 'SET_TOOL', tool: tool.tool }),
      tool.key,
    );
    b.hidden = true;
    overflowTools.set(tool.tool, b);
  }
  const moreDivider = div('menu-divider');
  moreDivider.setAttribute('role', 'separator');
  moreRoot.appendChild(moreDivider);
  const presetToggle = addMoreItem(IC.toolbox, t('presets'), openPresets);
  presetToggle.id = 'tb-presets';
  presetToggle.setAttribute('aria-controls', 'tb-preset-list');
  presetToggle.setAttribute('aria-expanded', 'false');
  presetList.id = 'tb-preset-list';
  function openPresets(): void {
    setMoreOpen(true);
    moreRoot.hidden = true;
    presetList.hidden = false;
    presetToggle.setAttribute('aria-expanded', 'true');
    positionMorePanel();
    menuItems()[0]?.focus();
  }
  function closePresets(): void {
    moreRoot.hidden = false;
    presetList.hidden = true;
    presetToggle.setAttribute('aria-expanded', 'false');
  }
  const backToTools = addMoreItem('←', t('moreTools'), () => {
    setMoreOpen(true);
    presetToggle.focus();
  });
  presetList.appendChild(backToTools);
  for (const def of PRESETS) {
    const button = addMoreItem(def.icon, t(def.labelKey), () => {
      const vp = history.present.viewport;
      const cx = (window.innerWidth / 2 - vp.offsetX) / vp.zoom;
      const cy = (window.innerHeight / 2 - vp.offsetY) / vp.zoom;
      const elements = def.buildElements(
        cx,
        cy,
        document.documentElement.getAttribute('data-theme') !== 'light',
      );
      history.dispatch({ type: 'CREATE_ELEMENTS', elements });
      history.dispatch({
        type: 'GROUP_ELEMENTS',
        ids: elements.map((e) => e.id),
        groupId: crypto.randomUUID(),
      });
    });
    button.dataset.preset = def.id;
    presetList.appendChild(button);
  }
  addMoreItem(IC.library, t('library'), () => toggleLibrary(), 'I');
  const mermaidIcon =
    '<svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="1" y="1" width="7" height="5" rx="1"/><rect x="12" y="14" width="7" height="5" rx="1"/><path d="M4.5 6v4h11v4M14 16l1.5-2 1.5 2"/></svg>';
  addMoreItem(mermaidIcon, t('importMermaid'), showMermaidDialog);
  addMoreItem(IC.importImg, t('insertImage'), openImagePicker);
  const liveDivider = div('menu-divider');
  liveDivider.setAttribute('role', 'separator');
  moreRoot.appendChild(liveDivider);
  const liveIcon =
    '<svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="10" cy="10" r="2"/><path d="M6.5 6.5a5 5 0 000 7M13.5 6.5a5 5 0 010 7M4 4a8.5 8.5 0 000 12M16 4a8.5 8.5 0 010 12"/></svg>';
  const liveAction = addMoreItem(liveIcon, t('startLiveSession'), () => {
    void startLiveSession();
  });
  liveAction.id = 'tb-start-live';
  onLiveReveal(() => liveAction.setAttribute('aria-disabled', 'true'));
  onLiveHide(() => liveAction.removeAttribute('aria-disabled'));
  async function startLiveSession(): Promise<void> {
    liveAction.setAttribute('aria-disabled', 'true');
    const roomId = generateRoomId();
    const url = buildLiveRoomUrl(roomId);
    const copied = await copyToClipboard(url);
    showShareToast(copied, url, t('shareLiveCopied'));
    joinLiveSession(history, {
      roomId,
      name: getStoredName() || 'You',
      seedElements: history.present.elements,
      onStatus: (connected) => {
        setLiveUI(connected);
        showLiveStatusToast(connected);
      },
    });
  }

  const menuItems = (): HTMLButtonElement[] =>
    [
      ...morePanel.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'),
    ].filter((b) => !b.closest('[hidden]'));
  function focusMoreTrigger(): void {
    if (!window.matchMedia('(pointer: coarse)').matches) moreToggle.focus();
    else document.getElementById('mobile-tools-fab')?.focus();
  }
  function positionMorePanel(): void {
    const anchor = window.matchMedia('(pointer: coarse)').matches
      ? document.getElementById('mobile-tools-fab')
      : moreToggle;
    if (!anchor) return;
    const r = anchor.getBoundingClientRect();
    const below = r.top < window.innerHeight / 2;
    const room = below ? window.innerHeight - r.bottom - 16 : r.top - 16;
    morePanel.style.maxHeight = `${Math.max(80, room)}px`;
    const height = morePanel.offsetHeight;
    morePanel.style.left = `${Math.max(8, Math.min(r.right - morePanel.offsetWidth, window.innerWidth - morePanel.offsetWidth - 8))}px`;
    morePanel.style.top = `${Math.max(8, Math.min(below ? r.bottom + 8 : r.top - height - 8, window.innerHeight - height - 8))}px`;
  }
  function setMoreOpen(open: boolean, focus = false): void {
    if (!open) closePresets();
    morePanel.classList.toggle('open', open);
    moreToggle.setAttribute('aria-expanded', String(open));
    moreToggle.classList.toggle('open', open);
    if (open) {
      const popup = document.getElementById('mobile-tools-popup');
      if (popup) {
        popup.classList.remove('open');
        popup.hidden = true;
      }
      const fab = document.getElementById('mobile-tools-fab');
      if (fab) {
        fab.classList.remove('active');
        fab.innerHTML = IC.toolbox;
      }
      positionMorePanel();
      if (focus) menuItems()[0]?.focus();
    }
  }
  moreToggle.addEventListener('click', () =>
    setMoreOpen(!morePanel.classList.contains('open'), true),
  );
  moreToggle.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    e.stopPropagation();
    setMoreOpen(true);
    const items = menuItems();
    (e.key === 'ArrowDown' ? items[0] : items.at(-1))?.focus();
  });
  morePanel.addEventListener('keydown', (e) => {
    const items = menuItems();
    const index = items.indexOf(document.activeElement as HTMLButtonElement);
    if (!presetList.hidden && (e.key === 'Escape' || e.key === 'ArrowLeft')) {
      e.preventDefault();
      e.stopPropagation();
      closePresets();
      positionMorePanel();
      presetToggle.focus();
      return;
    }
    if (e.key === 'ArrowRight' && document.activeElement === presetToggle) {
      e.preventDefault();
      e.stopPropagation();
      openPresets();
      return;
    }
    let next: number | undefined;
    if (e.key === 'ArrowDown') next = (index + 1) % items.length;
    else if (e.key === 'ArrowUp')
      next = (index - 1 + items.length) % items.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = items.length - 1;
    else if (e.key === 'Escape' || e.key === 'Tab') {
      setMoreOpen(false);
      focusMoreTrigger();
      e.stopPropagation();
      if (e.key === 'Escape') e.preventDefault();
      return;
    }
    if (
      next === undefined &&
      e.key.length === 1 &&
      !e.ctrlKey &&
      !e.metaKey &&
      !e.altKey
    ) {
      for (let step = 1; step <= items.length; step++) {
        const candidate = (index + step) % items.length;
        if (
          items[candidate]?.textContent
            ?.trim()
            .toLocaleLowerCase()
            .startsWith(e.key.toLocaleLowerCase())
        ) {
          next = candidate;
          break;
        }
      }
    }
    if (next !== undefined) {
      e.preventDefault();
      e.stopPropagation();
      items[next]?.focus();
    }
  });
  document.addEventListener(
    'pointerdown',
    (e) => {
      if (
        !moreGroup.contains(e.target as Node) &&
        !morePanel.contains(e.target as Node)
      )
        setMoreOpen(false);
    },
    { capture: true },
  );
  moreGroup.append(moreToggle);
  container.appendChild(morePanel);
  centerPill.appendChild(moreGroup);

  // Locked-elements indicator — shown when selection contains locked elements
  const lockedSep = document.createElement('span');
  lockedSep.className = 'tb-separator';
  lockedSep.style.display = 'none';
  const lockedIndicator = document.createElement('button');
  lockedIndicator.className = 'tb-btn tb-locked-indicator';
  lockedIndicator.title = t('unlockElements');
  lockedIndicator.setAttribute('aria-label', t('unlockElements'));
  lockedIndicator.innerHTML = IC.elemLocked;
  lockedIndicator.style.display = 'none';
  lockedIndicator.addEventListener('click', () => {
    const scene = history.present;
    const ids = [...scene.selectedIds].filter(
      (id) => scene.elements.find((el) => el.id === id)?.locked,
    );
    if (ids.length > 0) history.dispatch({ type: 'UNLOCK_ELEMENTS', ids });
  });
  centerPill.appendChild(lockedSep);
  centerPill.appendChild(lockedIndicator);

  const fitContent = (): void => {
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
  };
  const resetZoom = (): void => {
    const vp = history.present.viewport;
    const w = window.innerWidth,
      h = window.innerHeight;
    const worldCX = (w / 2 - vp.offsetX) / vp.zoom;
    const worldCY = (h / 2 - vp.offsetY) / vp.zoom;
    history.dispatch({
      type: 'SET_VIEWPORT',
      zoom: 1,
      offsetX: w / 2 - worldCX,
      offsetY: h / 2 - worldCY,
    });
  };
  // ── Top-right: live name and people ──────────────────────────────────────────
  const topRight = div('tb-island-topright');

  // Mermaid dialog
  const mermaidDialog = document.createElement('div');
  mermaidDialog.id = 'mermaid-dialog';
  mermaidDialog.style.cssText = [
    'position:fixed',
    'inset:0',
    'z-index:2000',
    'display:none',
    'align-items:center',
    'justify-content:center',
    'background:rgba(0,0,0,0.55)',
    'backdrop-filter:blur(4px)',
  ].join(';');

  const mermaidBox = document.createElement('div');
  mermaidBox.style.cssText = [
    'background:rgba(22,22,34,0.98)',
    'border:1px solid rgba(255,255,255,0.12)',
    'border-radius:12px',
    'padding:20px',
    'display:flex',
    'flex-direction:column',
    'gap:12px',
    'width:420px',
    'max-width:calc(100vw - 32px)',
    'box-shadow:0 8px 40px rgba(0,0,0,0.7)',
  ].join(';');

  const mermaidHeader = document.createElement('div');
  mermaidHeader.style.cssText =
    'display:flex;align-items:center;justify-content:space-between;gap:8px';

  const mermaidTitle = document.createElement('h3');
  mermaidTitle.style.cssText =
    'margin:0;font-size:14px;font-weight:600;color:#e2e2ef';
  mermaidTitle.textContent = t('mermaidDialogTitle');

  const mermaidFileInput = document.createElement('input');
  mermaidFileInput.type = 'file';
  mermaidFileInput.accept = '.mmd,.mermaid,text/plain';
  mermaidFileInput.style.display = 'none';
  container.appendChild(mermaidFileInput);

  const mermaidLoadBtn = document.createElement('button');
  mermaidLoadBtn.style.cssText = [
    'background:none',
    'border:none',
    'color:rgba(255,255,255,0.4)',
    'font-size:12px',
    'cursor:pointer',
    'padding:2px 4px',
    'border-radius:4px',
    'white-space:nowrap',
  ].join(';');
  mermaidLoadBtn.textContent = t('mermaidLoadFile');
  mermaidLoadBtn.addEventListener('mouseenter', () => {
    mermaidLoadBtn.style.color = 'rgba(255,255,255,0.7)';
  });
  mermaidLoadBtn.addEventListener('mouseleave', () => {
    mermaidLoadBtn.style.color = 'rgba(255,255,255,0.4)';
  });
  mermaidLoadBtn.addEventListener('click', () => mermaidFileInput.click());

  mermaidFileInput.addEventListener('change', () => {
    const file = mermaidFileInput.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      if (text) mermaidTextarea.value = text;
    };
    reader.readAsText(file);
    mermaidFileInput.value = '';
  });

  mermaidHeader.append(mermaidTitle, mermaidLoadBtn);

  const mermaidTextarea = document.createElement('textarea');
  mermaidTextarea.style.cssText = [
    'width:100%',
    'height:240px',
    'resize:vertical',
    'background:rgba(0,0,0,0.3)',
    'border:1px solid rgba(255,255,255,0.1)',
    'border-radius:8px',
    'color:#e2e2ef',
    'font:13px/1.5 "Fira Code","Cascadia Code","JetBrains Mono",monospace',
    'padding:10px 12px',
    'box-sizing:border-box',
    'outline:none',
  ].join(';');
  mermaidTextarea.placeholder = [
    'flowchart TD',
    '  A[Start] --> B{Decision}',
    '  B -->|Yes| C[Done]',
    '  B -->|No| A',
  ].join('\n');
  mermaidTextarea.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      void doInsert();
    }
    if (e.key === 'Escape') hideMermaidDialog();
  });

  const mermaidActions = document.createElement('div');
  mermaidActions.style.cssText =
    'display:flex;justify-content:flex-end;gap:8px';

  const mermaidCancelBtn = document.createElement('button');
  mermaidCancelBtn.style.cssText = [
    'background:rgba(255,255,255,0.07)',
    'border:1px solid rgba(255,255,255,0.1)',
    'border-radius:7px',
    'color:#e2e2ef',
    'font-size:13px',
    'padding:7px 16px',
    'cursor:pointer',
  ].join(';');
  mermaidCancelBtn.textContent = t('mermaidCancel');
  mermaidCancelBtn.addEventListener('click', hideMermaidDialog);

  const mermaidInsertBtn = document.createElement('button');
  mermaidInsertBtn.style.cssText = [
    'background:#c42059',
    'border:none',
    'border-radius:7px',
    'color:#fff',
    'font-size:13px',
    'font-weight:600',
    'padding:7px 20px',
    'cursor:pointer',
  ].join(';');
  mermaidInsertBtn.textContent = t('mermaidInsert');
  mermaidInsertBtn.addEventListener('click', () => void doInsert());

  mermaidActions.append(mermaidCancelBtn, mermaidInsertBtn);
  mermaidBox.append(mermaidHeader, mermaidTextarea, mermaidActions);
  mermaidDialog.appendChild(mermaidBox);
  mermaidDialog.addEventListener('click', (e) => {
    if (e.target === mermaidDialog) hideMermaidDialog();
  });
  document.body.appendChild(mermaidDialog);

  function showMermaidDialog(): void {
    mermaidTextarea.value = '';
    mermaidDialog.style.display = 'flex';
    requestAnimationFrame(() => mermaidTextarea.focus());
  }

  function hideMermaidDialog(): void {
    mermaidDialog.style.display = 'none';
  }

  /**
   * The first import lazy-loads the Mermaid engine, so the dialog stays open
   * (button disabled) until it resolves. On a parse error it stays open too,
   * letting the user fix the source instead of retyping it.
   */
  async function doInsert(): Promise<void> {
    const code = mermaidTextarea.value.trim();
    if (!code || mermaidInsertBtn.disabled) return;
    mermaidInsertBtn.disabled = true;
    mermaidInsertBtn.textContent = `${t('mermaidInsert')}…`;
    try {
      if (await importMermaidText(code, history)) hideMermaidDialog();
    } finally {
      mermaidInsertBtn.disabled = false;
      mermaidInsertBtn.textContent = t('mermaidInsert');
    }
  }

  // Editable "your name" chip, shown while a live session is active so any
  // participant (creator or link-joiner) can set/change their own name.
  const nameChip = document.createElement('button');
  nameChip.type = 'button';
  nameChip.className = 'tb-name-chip';
  nameChip.style.display = 'none';
  nameChip.title = t('liveName');
  nameChip.setAttribute('aria-label', t('liveName'));
  // The chip stays top-right on its own island while sharing lives in the
  // main menu (settings.ts).
  const nameIsland = div('tb-island tb-live-name-island');
  nameIsland.style.display = 'none';
  const showNameChip = (): void => {
    nameIsland.style.display = '';
    nameChip.style.display = '';
    nameChip.textContent = getStoredName() || 'You';
  };
  const hideNameChip = (): void => {
    nameIsland.style.display = 'none';
    nameChip.style.display = 'none';
  };
  onLiveReveal(showNameChip);
  onLiveHide(hideNameChip);
  nameChip.addEventListener('click', () => {
    const input = document.createElement('input');
    input.type = 'text';
    input.maxLength = 24;
    input.value = getStoredName();
    input.setAttribute('aria-label', t('liveName'));
    input.style.cssText = [
      'background:rgba(255,255,255,0.06)',
      'border:1px solid rgba(255,255,255,0.2)',
      'border-radius:6px',
      'color:#e7e7f2',
      'padding:4px 8px',
      'font-size:12px',
      'font-family:inherit',
      'outline:none',
      'width:110px',
    ].join(';');
    nameChip.replaceWith(input);
    input.focus();
    input.select();
    let done = false;
    const restore = (): void => {
      input.replaceWith(nameChip);
      showNameChip();
    };
    const commit = (): void => {
      if (done) return;
      done = true;
      const val = input.value.trim();
      if (val) setLiveName(val);
      restore();
    };
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') commit();
      else if (e.key === 'Escape') {
        done = true;
        restore();
      }
    });
    input.addEventListener('blur', commit);
  });

  nameIsland.append(nameChip);

  // ── Live participants (people list) ────────────────────────────────────────
  const peopleIcon = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.8-3.2 3.4-5 6.5-5s5.7 1.8 6.5 5"/><circle cx="17" cy="9.5" r="2.5"/><path d="M16 15.2c2 .3 3.7 1.5 4.5 3.6"/></svg>`;
  const peopleIsland = div('tb-island tb-people-island');
  peopleIsland.style.position = 'relative';
  peopleIsland.style.display = 'none';
  const peopleTrigger = mkBtn(peopleIcon, t('people'));
  const peoplePanel = document.createElement('div');
  peoplePanel.setAttribute('role', 'menu');
  peoplePanel.style.cssText = [
    'position:absolute',
    'right:0',
    'top:calc(100% + 6px)',
    'background:rgba(26,26,40,0.98)',
    'border:1px solid rgba(255,255,255,0.1)',
    'border-radius:10px',
    'padding:8px',
    'display:none',
    'flex-direction:column',
    'gap:4px',
    'min-width:200px',
    'max-height:320px',
    'overflow-y:auto',
    'box-shadow:0 4px 24px rgba(0,0,0,0.6)',
    'z-index:1000',
    'backdrop-filter:blur(16px)',
  ].join(';');
  initPeopleList(peoplePanel);
  // Show the people button only while a live session is connected AND there is
  // at least one other participant — otherwise it's just an empty dot. Hide the
  // whole island so no empty box lingers in the toolbar.
  onLivePeers((others) => {
    peopleIsland.style.display = others.length > 0 ? '' : 'none';
  });
  onLiveHide(() => {
    peopleIsland.style.display = 'none';
  });
  let peoplePanelOpen = false;
  peopleTrigger.addEventListener('click', (e) => {
    e.stopPropagation();
    peoplePanelOpen = !peoplePanelOpen;
    peoplePanel.style.display = peoplePanelOpen ? 'flex' : 'none';
  });
  document.addEventListener('click', () => {
    if (peoplePanelOpen) {
      peoplePanelOpen = false;
      peoplePanel.style.display = 'none';
    }
  });
  peopleIsland.append(peopleTrigger, peoplePanel);

  topRight.append(peopleIsland, nameIsland);

  // Top-left: menu button (settings.ts) | coffee (star_cta.ts)
  const topLeft = div('tb-island-topleft');
  const tbLeft = div('tb-island tb-left');
  topLeft.append(tbLeft);

  function updateToolsLayout(): void {
    setMoreOpen(false);
    for (const tool of secondaryTools) toolBtns.get(tool)!.hidden = false;
    for (const tool of [...secondaryTools].reverse()) {
      if (centerPill.offsetWidth <= window.innerWidth - 32) break;
      toolBtns.get(tool)!.hidden = true;
    }
    for (const [tool, button] of overflowTools)
      button.hidden = !toolBtns.get(tool)!.hidden;
    moreDivider.hidden = [...overflowTools.values()].every((b) => b.hidden);
  }
  container.append(centerPill, topRight, topLeft);
  updateToolsLayout();
  window.addEventListener('resize', updateToolsLayout);
  initTooltips(centerPill);
  // Optional standalone controls share the same actions as the toolbar.
  const zoomControls = div('tb-island');
  zoomControls.id = 'zoom-controls';
  zoomControls.setAttribute('role', 'group');
  zoomControls.setAttribute('aria-label', t('zoomPanel'));
  const standaloneFit = mkBtn(IC.fit, t('fitContent'));
  const standaloneMinus = mkBtn('−', t('zoomOut'));
  const standaloneZoom = mkBtn('', t('resetZoom100'));
  standaloneZoom.classList.add('tb-zoom-btn');
  const standalonePlus = mkBtn('+', t('zoomIn'));
  standaloneFit.addEventListener('click', fitContent);
  standaloneMinus.addEventListener('click', () => zoomOut(history));
  standaloneZoom.addEventListener('click', resetZoom);
  standalonePlus.addEventListener('click', () => zoomIn(history));
  zoomControls.append(
    standaloneFit,
    standaloneMinus,
    standaloneZoom,
    standalonePlus,
  );
  const historyControls = div('tb-island');
  historyControls.id = 'history-controls';
  historyControls.setAttribute('role', 'group');
  historyControls.setAttribute('aria-label', t('showHistoryControls'));
  const standaloneUndo = mkBtn(IC.undo, t('undo'));
  const standaloneRedo = mkBtn(IC.redo, t('redo'));
  standaloneUndo.addEventListener('click', () => history.undo());
  standaloneRedo.addEventListener('click', () => history.redo());
  historyControls.append(standaloneUndo, standaloneRedo);
  container.append(zoomControls, historyControls);
  initTooltips(zoomControls);
  initTooltips(historyControls);
  initToolbarDrag(centerPill, dragHandle);

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
    b.dataset.tool = toolDef.tool;
    b.addEventListener('click', () => {
      history.dispatch({ type: 'SET_TOOL', tool: toolDef.tool });
      toolsPopup.classList.remove('open');
      toolsFab.classList.remove('active');
    });
    toolsPopup.appendChild(b);
  }

  const touch = window.matchMedia('(pointer: coarse)');
  function placeMoreTrigger(): void {
    moreToggle.classList.toggle('mobile-tools-popup-btn', touch.matches);
    if (touch.matches) toolsPopup.appendChild(moreGroup);
    else centerPill.insertBefore(moreGroup, lockedSep);
    setMoreOpen(false);
    updateToolsLayout();
  }
  placeMoreTrigger();
  touch.addEventListener('change', placeMoreTrigger);

  // Lock button row at the bottom of the popup
  const lockRowSep = document.createElement('div');
  lockRowSep.className = 'mobile-tools-popup-sep';
  const lockRowEl = document.createElement('div');
  lockRowEl.className = 'mobile-tools-popup-lock-row';
  const mobileLockBtn = document.createElement('button');
  mobileLockBtn.className = 'mobile-tools-popup-btn';
  mobileLockBtn.title = t('lockTool');
  mobileLockBtn.setAttribute('aria-label', t('lockTool'));
  mobileLockBtn.innerHTML = IC.lockOpen;
  mobileLockBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleToolLock();
  });
  lockRowEl.appendChild(mobileLockBtn);
  toolsPopup.appendChild(lockRowSep);
  toolsPopup.appendChild(lockRowEl);

  toolsFab.addEventListener('click', () => {
    setMoreOpen(false);
    toolsPopup.hidden = false;
    const open = toolsPopup.classList.toggle('open');
    toolsFab.classList.toggle('active', open);
    toolsFab.innerHTML = open ? IC.close : IC.toolbox;
  });

  document.addEventListener(
    'pointerdown',
    (e) => {
      if (
        toolsPopup.classList.contains('open') &&
        !toolsPopup.contains(e.target as Node) &&
        e.target !== toolsFab
      ) {
        toolsPopup.classList.remove('open');
        toolsFab.classList.remove('active');
        toolsFab.innerHTML = IC.toolbox;
      }
    },
    { capture: true },
  );

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
    for (const [tool, button] of overflowTools)
      button.classList.toggle('active', tool === activeTool);
    moreToggle.classList.toggle(
      'active',
      toolBtns.get(activeTool)?.hidden === true,
    );
    toolsPopup
      .querySelectorAll<HTMLButtonElement>('.mobile-tools-popup-btn[data-tool]')
      .forEach((btn) => {
        btn.classList.toggle('active', btn.dataset.tool === activeTool);
      });
    mobileLockBtn.innerHTML = toolLocked ? IC.lock : IC.lockOpen;
    mobileLockBtn.classList.toggle('active', toolLocked);
    mobileLockBtn.setAttribute('aria-pressed', String(toolLocked));
    toolsFab.dataset.tool = activeTool;
    standaloneUndo.disabled = !history.canUndo();
    standaloneRedo.disabled = !history.canRedo();
    const zoomText = `${Math.round(history.present.viewport.zoom * 100)}%`;
    standaloneZoom.textContent = zoomText;
    // Locked-elements indicator
    const scene = history.present;
    const hasLockedSelected =
      scene.selectedIds.size > 0 &&
      [...scene.selectedIds].some(
        (id) => scene.elements.find((el) => el.id === id)?.locked,
      );
    const indicatorWasVisible = lockedIndicator.style.display !== 'none';
    lockedSep.style.display = hasLockedSelected ? '' : 'none';
    lockedIndicator.style.display = hasLockedSelected ? '' : 'none';
    if (indicatorWasVisible !== hasLockedSelected) updateToolsLayout();
  }

  history.subscribe(sync);
  sync();
}

// ── Helpers ───────────────────────────────────────────────────────────────────
// Zoom around the viewport center: the toolbar buttons and Ctrl+Plus/Minus.
export function zoomIn(history: History): void {
  zoomByFactor(history, 1.2);
}

export function zoomOut(history: History): void {
  zoomByFactor(history, 1 / 1.2);
}

function zoomByFactor(history: History, factor: number): void {
  history.dispatch({
    type: 'ZOOM_VIEWPORT',
    factor,
    originX: window.innerWidth / 2,
    originY: window.innerHeight / 2,
  });
}

function div(cls: string): HTMLElement {
  const e = document.createElement('div');
  e.className = cls;
  return e;
}

function mkBtn(icon: string, title: string): HTMLButtonElement {
  const b = document.createElement('button');
  b.className = 'tb-btn';
  b.title = title;
  b.setAttribute('aria-label', title);
  b.innerHTML = icon;
  return b;
}
