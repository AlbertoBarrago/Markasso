import type { History } from '../engine/history';
import type { Element } from '../elements/element';
import { getElementBounds } from '../rendering/draw_selection';
import { t } from '../i18n';

const TYPE_ICONS: Record<string, string> = {
  rectangle: `<svg width="13" height="13" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><rect x="3" y="5" width="14" height="10" rx="1.5"/></svg>`,
  ellipse:   `<svg width="13" height="13" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8"><ellipse cx="10" cy="10" rx="7.5" ry="5.5"/></svg>`,
  rhombus:   `<svg width="13" height="13" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M10 3l7 7-7 7-7-7z"/></svg>`,
  line:      `<svg width="13" height="13" viewBox="0 0 20 20"><line x1="4" y1="16" x2="16" y2="4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`,
  arrow:     `<svg width="13" height="13" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="16" x2="16" y2="4"/><path d="M9 4h7v7"/></svg>`,
  freehand:  `<svg width="13" height="13" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><g stroke-width="1.25"><path clip-rule="evenodd" d="m7.6 15.7 7.8-7.8a2.4 2.4 0 10-3.3-3.3L4.3 12.4a3.3 3.3 0 00-1 2.4v2h2a3.3 3.3 0 002.4-1z"/></g></svg>`,
  text:      `<svg width="13" height="13" viewBox="0 0 20 20" fill="currentColor"><path d="M4 4h12v2.5H12v9.5H8V6.5H4z"/></svg>`,
  image:     `<svg width="13" height="13" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="16" height="14" rx="2"/><circle cx="7" cy="8" r="1.5"/><path d="M2 14l4-4 3 3 3-3 4 4"/></svg>`,
};

function getElementLabel(el: Element): string {
  if (el.type === 'text') return el.content.slice(0, 60) || `(${t('text')})`;
  if (el.type === 'image') return `image`;
  const label = ('label' in el && el.label) ? el.label : '';
  const typeName = t(el.type === 'rhombus' ? 'rhombus' : el.type) || el.type;
  return label ? `${typeName}: ${label}` : typeName;
}

function matchesQuery(el: Element, q: string): boolean {
  if (!q) return true;
  const lower = q.toLowerCase();
  const typeName = (t(el.type === 'rhombus' ? 'rhombus' : el.type) || el.type).toLowerCase();
  if (typeName.includes(lower)) return true;
  if (el.type === 'text' && el.content.toLowerCase().includes(lower)) return true;
  if ('label' in el && el.label && el.label.toLowerCase().includes(lower)) return true;
  if (el.strokeColor.toLowerCase().includes(lower)) return true;
  if (el.fillColor.toLowerCase().includes(lower)) return true;
  return false;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function initElementSearch(workspace: HTMLElement, history: History): void {
  if (window.matchMedia('(pointer: coarse)').matches) return;

  // ── DOM ──────────────────────────────────────────────────────────────────
  const overlay = document.createElement('div');
  overlay.id = 'el-search-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', t('elementSearch'));
  overlay.style.display = 'none';
  document.body.appendChild(overlay);

  overlay.innerHTML = `
    <div class="el-search-card">
      <div class="el-search-input-row">
        <svg class="el-search-icon" width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="8.5" cy="8.5" r="5.5"/><line x1="13" y1="13" x2="17" y2="17"/></svg>
        <input class="el-search-input" id="el-search-input" type="text" placeholder="${t('elementSearchPlaceholder')}" autocomplete="off" spellcheck="false" />
        <span class="el-search-count" id="el-search-count"></span>
      </div>
      <div class="el-search-list-wrapper">
        <ul class="el-search-list" id="el-search-list" role="listbox"></ul>
      </div>
    </div>
  `;

  const input   = overlay.querySelector<HTMLInputElement>('#el-search-input')!;
  const list    = overlay.querySelector<HTMLUListElement>('#el-search-list')!;
  const countEl = overlay.querySelector<HTMLElement>('#el-search-count')!;
  let activeIdx = -1;
  let visibleEls: Element[] = [];

  // ── Render ────────────────────────────────────────────────────────────────
  function renderList(): void {
    const scene  = history.present;
    const q      = input.value.trim();
    // Reverse so newest elements appear first
    const all    = [...scene.elements].reverse();
    visibleEls   = all.filter((el) => matchesQuery(el, q));
    activeIdx    = -1;
    list.innerHTML = '';

    countEl.textContent = String(visibleEls.length);

    if (visibleEls.length === 0) {
      const empty = document.createElement('li');
      empty.className = 'el-search-empty';
      empty.textContent = t('elementSearchNoResults');
      list.appendChild(empty);
      return;
    }

    for (let i = 0; i < visibleEls.length; i++) {
      const el = visibleEls[i]!;
      const li = document.createElement('li');
      li.className = 'el-search-item';
      li.setAttribute('role', 'option');
      li.dataset['index'] = String(i);

      const isSelected = scene.selectedIds.has(el.id);
      if (isSelected) li.classList.add('selected');

      const icon = TYPE_ICONS[el.type] ?? '';
      const label = escapeHtml(getElementLabel(el));

      const fillColor = el.fillColor !== 'transparent' ? el.fillColor : el.strokeColor;
      const colorSwatch = `<span class="el-search-swatch" style="background:${escapeHtml(fillColor)}"></span>`;

      li.innerHTML = `
        <span class="el-search-item-icon">${icon}</span>
        <span class="el-search-item-label">${label}</span>
        ${colorSwatch}
      `;
      li.addEventListener('mouseenter', () => setActive(i, false));
      li.addEventListener('click', () => selectElement(el));
      list.appendChild(li);
    }

    setActive(0, false);
  }

  function setActive(idx: number, scroll: boolean): void {
    list.querySelectorAll<HTMLElement>('.el-search-item').forEach((el) => el.classList.remove('active'));
    activeIdx = idx;
    if (idx < 0 || idx >= visibleEls.length) return;
    const el = list.querySelector<HTMLElement>(`.el-search-item[data-index="${idx}"]`);
    if (el) {
      el.classList.add('active');
      if (scroll) el.scrollIntoView({ block: 'nearest' });
    }
  }

  function selectElement(el: Element): void {
    history.dispatch({ type: 'SELECT_ELEMENTS', ids: [el.id] });
    // Zoom / pan to show the element
    const b = getElementBounds(el);
    const padding = 80;
    const zoomX = (window.innerWidth  - padding * 2) / Math.max(1, b.w);
    const zoomY = (window.innerHeight - padding * 2) / Math.max(1, b.h);
    const zoom  = Math.min(4, Math.max(0.1, Math.min(zoomX, zoomY)));
    const offsetX = window.innerWidth  / 2 - (b.x + b.w / 2) * zoom;
    const offsetY = window.innerHeight / 2 - (b.y + b.h / 2) * zoom;
    history.dispatch({ type: 'SET_VIEWPORT', zoom, offsetX, offsetY });
    closeSearch();
  }

  // ── Open / close ──────────────────────────────────────────────────────────
  function openSearch(): void {
    overlay.style.display = 'flex';
    input.value = '';
    renderList();
    requestAnimationFrame(() => input.focus());
  }

  function closeSearch(): void {
    overlay.style.display = 'none';
  }

  function isOpen(): boolean {
    return overlay.style.display !== 'none';
  }

  // ── Events ────────────────────────────────────────────────────────────────
  input.addEventListener('input', renderList);

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { e.stopPropagation(); closeSearch(); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(Math.min(activeIdx + 1, visibleEls.length - 1), true); return; }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setActive(Math.max(activeIdx - 1, 0), true); return; }
    if (e.key === 'Enter') {
      e.preventDefault();
      const el = visibleEls[activeIdx];
      if (el) selectElement(el);
      return;
    }
    if (e.key === 'Tab') {
      e.preventDefault();
      const newIdx = e.shiftKey ? Math.max(activeIdx - 1, 0) : Math.min(activeIdx + 1, visibleEls.length - 1);
      setActive(newIdx, true);
    }
  });

  overlay.addEventListener('pointerdown', (e) => {
    if (e.target === overlay) closeSearch();
  });

  // Re-render if scene changes while open (elements may have been added/removed)
  history.subscribe(() => { if (isOpen()) renderList(); });

  // ── Global shortcut ───────────────────────────────────────────────────────
  window.addEventListener('keydown', (e) => {
    const target = e.target as HTMLElement;
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;
    if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
      e.preventDefault();
      if (isOpen()) { closeSearch(); } else { openSearch(); }
    }
    if (e.key === 'Escape' && isOpen()) closeSearch();
  });
}
