import type { History } from '../engine/history';
import type { SelectTool } from '../tools/select_tool';
import { exportPNG, exportSVG, exportHTML } from '../rendering/export';
import { exportMarkasso } from '../io/markasso';
import { buildShareUrl } from '../io/share';
import { fitToElements } from '../core/viewport';
import { t } from '../i18n';

interface PaletteItem {
  id: string;
  label: string;
  hint?: string;           // keyboard shortcut badge
  category: 'tool' | 'action';
  icon: string;
  execute: () => void;
}

// ── Simple fuzzy match ──────────────────────────────────────────────────────
// Returns true if every character of `query` appears in `target` in order
// (case-insensitive), and a numeric score (higher = better).
function fuzzyMatch(query: string, target: string): { match: boolean; score: number } {
  if (!query) return { match: true, score: 0 };
  const q = query.toLowerCase();
  const s = target.toLowerCase();
  let qi = 0;
  let firstIdx = -1;
  let consecutive = 0;
  let lastIdx = -1;
  for (let i = 0; i < s.length && qi < q.length; i++) {
    if (s[i] === q[qi]) {
      if (firstIdx === -1) firstIdx = i;
      if (lastIdx === i - 1) consecutive++;
      lastIdx = i;
      qi++;
    }
  }
  if (qi < q.length) return { match: false, score: 0 };
  // Higher score = starts early + more consecutive
  const score = consecutive * 10 - firstIdx;
  return { match: true, score };
}

// Wrap matched characters in <mark> for display
function highlightMatch(query: string, label: string): string {
  if (!query) return escapeHtml(label);
  const q = query.toLowerCase();
  const chars = [...label];
  const lower = label.toLowerCase();
  let qi = 0;
  const result: string[] = [];
  for (let i = 0; i < chars.length; i++) {
    if (qi < q.length && lower[i] === q[qi]) {
      result.push(`<mark>${escapeHtml(chars[i]!)}</mark>`);
      qi++;
    } else {
      result.push(escapeHtml(chars[i]!));
    }
  }
  return result.join('');
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

const IC_TOOL   = `<svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><rect x="3" y="5" width="14" height="10" rx="1.5"/></svg>`;
const IC_ACTION = `<svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8h9a4 4 0 010 8H8"/><path d="M7 5L4 8l3 3"/></svg>`;

export function initCommandPalette(history: History, _selectTool: SelectTool): void {
  // ── DOM ──────────────────────────────────────────────────────────────────
  const overlay = document.createElement('div');
  overlay.id = 'cmd-palette-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', t('commandPalette'));
  overlay.style.display = 'none';
  document.body.appendChild(overlay);

  overlay.innerHTML = `
    <div class="cmd-card">
      <div class="cmd-input-row">
        <svg class="cmd-search-icon" width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="8.5" cy="8.5" r="5.5"/><line x1="13" y1="13" x2="17" y2="17"/></svg>
        <input class="cmd-input" id="cmd-input" type="text" placeholder="${t('cmdSearchPlaceholder')}" autocomplete="off" spellcheck="false" />
      </div>
      <div class="cmd-list-wrapper">
        <ul class="cmd-list" id="cmd-list" role="listbox"></ul>
      </div>
    </div>
  `;

  const input  = overlay.querySelector<HTMLInputElement>('#cmd-input')!;
  const list   = overlay.querySelector<HTMLUListElement>('#cmd-list')!;
  let activeIdx = -1;
  let visibleItems: PaletteItem[] = [];

  // ── Build item catalog ───────────────────────────────────────────────────
  function buildItems(): PaletteItem[] {
    const items: PaletteItem[] = [];

    // Tools
    const TOOL_DEFS: { id: string; label: string; hint: string; icon: string }[] = [
      { id: 'hand',      label: t('hand'),      hint: 'H',   icon: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M8 13v-7.5a1.5 1.5 0 013 0v6.5M11 5.5v-2a1.5 1.5 0 113 0v8.5M14 5.5a1.5 1.5 0 013 0v6.5M17 7.5a1.5 1.5 0 013 0v8.5a6 6 0 01-6 6h-2a6 6 0 01-5-2.7l-3.5-5.9a1.5 1.5 0 012.8-1l1.2 1.4"/></svg>` },
      { id: 'select',    label: t('select'),    hint: 'V',   icon: `<svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor"><path d="M5.5 3v12.8l2.9-2.9 2.4 5.4 2.1-.95-2.4-5.4 3.8.001z"/></svg>` },
      { id: 'rectangle', label: t('rectangle'), hint: 'R',   icon: `<svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><rect x="3" y="5" width="14" height="10" rx="1.5"/></svg>` },
      { id: 'ellipse',   label: t('ellipse'),   hint: 'E',   icon: `<svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8"><ellipse cx="10" cy="10" rx="7.5" ry="5.5"/></svg>` },
      { id: 'rombo',     label: t('rhombus'),   hint: 'D',   icon: `<svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M10 3l7 7-7 7-7-7z"/></svg>` },
      { id: 'arrow',     label: t('arrow'),     hint: 'A',   icon: `<svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="16" x2="16" y2="4"/><path d="M9 4h7v7"/></svg>` },
      { id: 'line',      label: t('line'),      hint: 'L',   icon: `<svg width="14" height="14" viewBox="0 0 20 20"><line x1="4" y1="16" x2="16" y2="4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>` },
      { id: 'freehand',  label: t('pen'),       hint: 'P',   icon: `<svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><g stroke-width="1.25"><path clip-rule="evenodd" d="m7.6 15.7 7.8-7.8a2.4 2.4 0 10-3.3-3.3L4.3 12.4a3.3 3.3 0 00-1 2.4v2h2a3.3 3.3 0 002.4-1z"/><path d="m11.3 5.4 3.3 3.3"/></g></svg>` },
      { id: 'text',      label: t('textTool'),  hint: 'T',   icon: `<svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor"><path d="M4 4h12v2.5H12v9.5H8V6.5H4z"/></svg>` },
      { id: 'sticky',    label: t('stickyNote').replace(/\s*\(.*\)/, ''), hint: 'N', icon: `<svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 3h12a1 1 0 011 1v9l-4 4H4a1 1 0 01-1-1V4a1 1 0 011-1z"/></svg>` },
      { id: 'eraser',    label: t('eraser'),    hint: '0',   icon: `<svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M3 17h14"/><path d="M5 17l-2-4 9-8 4 4-7 8H5z"/></svg>` },
    ];
    for (const td of TOOL_DEFS) {
      items.push({
        id: `tool:${td.id}`,
        label: td.label,
        hint: td.hint,
        category: 'tool',
        icon: td.icon,
        execute: () => history.dispatch({ type: 'SET_TOOL', tool: td.id as any }),
      });
    }

    // Actions
    items.push({
      id: 'action:undo',
      label: t('undoLabel'),
      hint: 'Ctrl+Z',
      category: 'action',
      icon: `<svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8h9a4 4 0 010 8H8"/><path d="M7 5L4 8l3 3"/></svg>`,
      execute: () => history.undo(),
    });
    items.push({
      id: 'action:redo',
      label: t('redoLabel'),
      hint: 'Ctrl+Y',
      category: 'action',
      icon: `<svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M16 8H7a4 4 0 000 8h5"/><path d="M13 5l3 3-3 3"/></svg>`,
      execute: () => history.redo(),
    });
    items.push({
      id: 'action:fit',
      label: t('fitToContent'),
      hint: 'F',
      category: 'action',
      icon: `<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><circle cx="8" cy="8" r="2.5"/><path d="M1 5V2h3M12 2h3v3M15 11v3h-3M4 14H1v-3"/></svg>`,
      execute: () => {
        const vp = fitToElements(history.present.elements, window.innerWidth, window.innerHeight);
        history.dispatch({ type: 'SET_VIEWPORT', offsetX: vp.offsetX, offsetY: vp.offsetY, zoom: vp.zoom });
      },
    });
    items.push({
      id: 'action:zoom-in',
      label: t('zoomIn'),
      category: 'action',
      icon: `<svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="9" cy="9" r="6"/><line x1="14" y1="14" x2="18" y2="18"/><line x1="9" y1="6" x2="9" y2="12"/><line x1="6" y1="9" x2="12" y2="9"/></svg>`,
      execute: () => history.dispatch({ type: 'ZOOM_VIEWPORT', factor: 1.2, originX: window.innerWidth / 2, originY: window.innerHeight / 2 }),
    });
    items.push({
      id: 'action:zoom-out',
      label: t('zoomOut'),
      category: 'action',
      icon: `<svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="9" cy="9" r="6"/><line x1="14" y1="14" x2="18" y2="18"/><line x1="6" y1="9" x2="12" y2="9"/></svg>`,
      execute: () => history.dispatch({ type: 'ZOOM_VIEWPORT', factor: 1 / 1.2, originX: window.innerWidth / 2, originY: window.innerHeight / 2 }),
    });
    items.push({
      id: 'action:zoom-reset',
      label: t('resetZoom100'),
      hint: 'Shift+0',
      category: 'action',
      icon: `<svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="9" cy="9" r="6"/><line x1="14" y1="14" x2="18" y2="18"/></svg>`,
      execute: () => {
        const vp = history.present.viewport;
        const w = window.innerWidth, h = window.innerHeight;
        const worldCX = (w / 2 - vp.offsetX) / vp.zoom;
        const worldCY = (h / 2 - vp.offsetY) / vp.zoom;
        history.dispatch({ type: 'SET_VIEWPORT', zoom: 1, offsetX: w / 2 - worldCX, offsetY: h / 2 - worldCY });
      },
    });
    items.push({
      id: 'action:toggle-grid',
      label: t('grid'),
      hint: 'G',
      category: 'action',
      icon: `<svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M2 7h16M2 13h16M7 2v16M13 2v16"/></svg>`,
      execute: () => history.dispatch({ type: 'TOGGLE_GRID' }),
    });
    items.push({
      id: 'action:select-all',
      label: `${t('select')} ${t('actions')}`,
      hint: 'Ctrl+A',
      category: 'action',
      icon: `<svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="14" height="14" rx="2" stroke-dasharray="3 2"/></svg>`,
      execute: () => {
        const ids = history.present.elements.map((el) => el.id);
        if (ids.length > 0) history.dispatch({ type: 'SELECT_ELEMENTS', ids });
      },
    });
    items.push({
      id: 'action:delete',
      label: t('delete'),
      hint: 'Del',
      category: 'action',
      icon: `<svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><polyline points="3,6 17,6"/><path d="M8 6V4h4v2"/><rect x="5" y="6" width="10" height="10" rx="1"/></svg>`,
      execute: () => {
        const scene = history.present;
        const ids = [...scene.selectedIds].filter((id) => {
          const el = scene.elements.find((e) => e.id === id);
          return el && !el.locked;
        });
        if (ids.length > 0) history.dispatch({ type: 'DELETE_ELEMENTS', ids });
      },
    });
    items.push({
      id: 'action:duplicate',
      label: t('duplicate'),
      hint: 'Ctrl+D',
      category: 'action',
      icon: `<svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="7" y="7" width="9" height="9" rx="1.5"/><path d="M13 7V5.5A1.5 1.5 0 0 0 11.5 4h-7A1.5 1.5 0 0 0 3 5.5v7A1.5 1.5 0 0 0 4.5 14H7"/></svg>`,
      execute: () => {
        const scene = history.present;
        const selectedEls = scene.elements.filter((el) => scene.selectedIds.has(el.id));
        const newIds: string[] = [];
        for (const el of selectedEls) {
          const newId = crypto.randomUUID();
          newIds.push(newId);
          history.dispatch({ type: 'CREATE_ELEMENT', element: { ...el, id: newId } });
          history.dispatch({ type: 'MOVE_ELEMENT', id: newId, dx: 20, dy: 20 });
        }
        if (newIds.length > 0) history.dispatch({ type: 'SELECT_ELEMENTS', ids: newIds });
      },
    });
    items.push({
      id: 'action:export-png',
      label: t('exportPNG'),
      category: 'action',
      icon: `<svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M10 3v9M7 9l3 3 3-3"/><path d="M4 14v1.5A1.5 1.5 0 005.5 17h9a1.5 1.5 0 001.5-1.5V14"/></svg>`,
      execute: () => exportPNG(history.present, false),
    });
    items.push({
      id: 'action:export-svg',
      label: t('exportSVG'),
      category: 'action',
      icon: `<svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M10 3v9M7 9l3 3 3-3"/><path d="M4 14v1.5A1.5 1.5 0 005.5 17h9a1.5 1.5 0 001.5-1.5V14"/></svg>`,
      execute: () => exportSVG(history.present, false),
    });
    items.push({
      id: 'action:export-html',
      label: t('exportHTML'),
      category: 'action',
      icon: `<svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M10 3v9M7 9l3 3 3-3"/><path d="M4 14v1.5A1.5 1.5 0 005.5 17h9a1.5 1.5 0 001.5-1.5V14"/></svg>`,
      execute: () => exportHTML(history.present),
    });
    items.push({
      id: 'action:save-markasso',
      label: t('saveMarkasso'),
      hint: 'Ctrl+S',
      category: 'action',
      icon: `<svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="2" width="14" height="16" rx="2"/><path d="M7 7h6M7 10h6M7 13h4"/></svg>`,
      execute: () => exportMarkasso(history.present),
    });
    items.push({
      id: 'action:share-link',
      label: t('shareLink'),
      category: 'action',
      icon: `<svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="15" cy="5" r="2"/><circle cx="5" cy="10" r="2"/><circle cx="15" cy="15" r="2"/><path d="M7 9l6-3M7 11l6 3"/></svg>`,
      execute: async () => {
        const url = await buildShareUrl(history.present.elements);
        try { await navigator.clipboard.writeText(url); } catch { prompt(t('shareLink'), url); }
      },
    });
    items.push({
      id: 'action:clear',
      label: t('clearCanvas'),
      category: 'action',
      icon: `<svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 17h14"/><path d="M5 17l-2-4 9-8 4 4-7 8H5z"/><path d="M12 5l4 4"/></svg>`,
      execute: () => {
        if (history.present.elements.length === 0) return;
        if (confirm('Clear the canvas?')) {
          const ids = history.present.elements.map((e) => e.id);
          history.dispatch({ type: 'DELETE_ELEMENTS', ids });
        }
      },
    });

    return items;
  }

  // ── Render list ──────────────────────────────────────────────────────────
  function renderList(query: string): void {
    const all = buildItems();
    const q = query.trim();

    let scored: { item: PaletteItem; score: number }[];
    if (!q) {
      scored = all.map((item) => ({ item, score: 0 }));
    } else {
      scored = all
        .map((item) => {
          const { match, score } = fuzzyMatch(q, item.label);
          return { item, score, match };
        })
        .filter((x) => x.match)
        .sort((a, b) => b.score - a.score);
    }

    visibleItems = scored.map((x) => x.item);
    list.innerHTML = '';
    activeIdx = -1;

    if (visibleItems.length === 0) {
      const empty = document.createElement('li');
      empty.className = 'cmd-empty';
      empty.textContent = t('cmdNoResults');
      list.appendChild(empty);
      return;
    }

    // Group by category when no query
    let lastCategory: string | null = null;
    for (let i = 0; i < visibleItems.length; i++) {
      const item = visibleItems[i]!;

      if (!q && item.category !== lastCategory) {
        lastCategory = item.category;
        const hdr = document.createElement('li');
        hdr.className = 'cmd-category-header';
        hdr.textContent = item.category === 'tool' ? t('cmdCategoryTools') : t('cmdCategoryActions');
        list.appendChild(hdr);
      }

      const li = document.createElement('li');
      li.className = 'cmd-item';
      li.setAttribute('role', 'option');
      li.dataset['index'] = String(i);

      const labelHtml = highlightMatch(q, item.label);
      const hintHtml = item.hint
        ? `<span class="cmd-hint">${escapeHtml(item.hint)}</span>`
        : '';

      li.innerHTML = `
        <span class="cmd-item-icon">${item.icon}</span>
        <span class="cmd-item-label">${labelHtml}</span>
        ${hintHtml}
      `;
      li.addEventListener('mouseenter', () => setActive(i, false));
      li.addEventListener('click', () => { executeItem(item); });
      list.appendChild(li);
    }

    if (visibleItems.length > 0) setActive(0, false);
  }

  function setActive(idx: number, scroll: boolean): void {
    list.querySelectorAll<HTMLElement>('.cmd-item').forEach((el) => el.classList.remove('active'));
    activeIdx = idx;
    if (idx < 0 || idx >= visibleItems.length) return;
    const el = list.querySelector<HTMLElement>(`.cmd-item[data-index="${idx}"]`);
    if (el) {
      el.classList.add('active');
      if (scroll) el.scrollIntoView({ block: 'nearest' });
    }
  }

  function executeItem(item: PaletteItem): void {
    closePalette();
    item.execute();
  }

  // ── Open / close ─────────────────────────────────────────────────────────
  function openPalette(): void {
    overlay.style.display = 'flex';
    input.value = '';
    renderList('');
    requestAnimationFrame(() => input.focus());
  }

  function closePalette(): void {
    overlay.style.display = 'none';
  }

  function isOpen(): boolean {
    return overlay.style.display !== 'none';
  }

  // ── Input events ──────────────────────────────────────────────────────────
  input.addEventListener('input', () => renderList(input.value));

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      closePalette();
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      const newIdx = Math.min(activeIdx + 1, visibleItems.length - 1);
      setActive(newIdx, true);
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      const newIdx = Math.max(activeIdx - 1, 0);
      setActive(newIdx, true);
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      const item = visibleItems[activeIdx];
      if (item) executeItem(item);
      return;
    }
    if (e.key === 'Tab') {
      e.preventDefault();
      const newIdx = e.shiftKey
        ? Math.max(activeIdx - 1, 0)
        : Math.min(activeIdx + 1, visibleItems.length - 1);
      setActive(newIdx, true);
    }
  });

  // Close on backdrop click
  overlay.addEventListener('pointerdown', (e) => {
    if (e.target === overlay) closePalette();
  });

  // ── Global Ctrl+K shortcut ────────────────────────────────────────────────
  window.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
      e.preventDefault();
      if (isOpen()) {
        closePalette();
      } else {
        openPalette();
      }
    }
    // Also close when Escape fires at window level while open
    if (e.key === 'Escape' && isOpen()) {
      closePalette();
    }
  });
}
