import type { History } from '../engine/history';
import type { GridType } from '../core/app_state';
import { fitToElements } from '../core/viewport';
import { exportPNG, exportSVG } from '../rendering/export';
import { exportMarkasso, importMarkasso } from '../io/markasso';
import { t, setLocale, getLocale, LOCALES, type Locale } from '../i18n';
import pkg from '../../package.json';

// ── Theme ─────────────────────────────────────────────────────────────────
export type ThemeMode = 'light' | 'dark' | 'device';

const THEME_KEY = 'markasso-theme';

export function getThemeMode(): ThemeMode {
  const s = localStorage.getItem(THEME_KEY);
  return s === 'light' || s === 'dark' || s === 'device' ? s : 'dark';
}

export function applyTheme(mode: ThemeMode): void {
  localStorage.setItem(THEME_KEY, mode);
  const resolved = mode === 'device'
    ? (window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark')
    : mode;
  document.documentElement.setAttribute('data-theme', resolved);
}

// Apply at module load to avoid flash of wrong theme
applyTheme(getThemeMode());

export interface UISettings {
  bgColor: string;
}

const STORAGE_KEY = 'markasso-ui-settings';

function isResolvedLight(): boolean {
  return document.documentElement.getAttribute('data-theme') === 'light';
}

export function loadSettings(): UISettings {
  const defaultBg = isResolvedLight() ? '#ffffff' : '#141414';
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { bgColor: defaultBg, ...(JSON.parse(raw) as Partial<UISettings>) };
  } catch { /* ignore */ }
  return { bgColor: defaultBg };
}

export function saveSettings(s: UISettings): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
}

export function applySettings(_appEl: HTMLElement, s: UISettings): void {
  document.documentElement.style.setProperty('--canvas-bg', s.bgColor);
}

const GRID_TYPES: { type: GridType; label: string; desc: string }[] = [
  { type: 'dot',  label: '•', desc: t('dotGrid') },
  { type: 'line', label: '≡', desc: t('lineGrid') },
  { type: 'mm',   label: '▦', desc: t('graphPaper') },
];

const DARK_BG_COLORS  = ['#141414', '#1a1a2e', '#0d1117', '#1e1e1e', '#12100e', '#0f1923'];
const LIGHT_BG_COLORS = ['#ffffff', '#fef5ef', '#fde8d8', '#f8dfd4', '#f5d5c8', '#f0cfc0'];

function svg(inner: string, size = 16): string {
  return `<svg width="${size}" height="${size}" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`;
}
function p(d: string): string { return `<path d="${d}"/>`; }

const ICONS = {
  hamburger: svg(p('M3 5h14M3 10h14M3 15h14'), 18),
  open:    svg(p('M2 9a2 2 0 012-2h4l2-2h6a2 2 0 012 2v7a2 2 0 01-2 2H4a2 2 0 01-2-2z')),
  save:    svg(p('M10 3v8M7 8l3 3 3-3M4 15v1a1 1 0 001 1h10a1 1 0 001-1v-1')),
  png:     svg(`<rect x="3" y="3" width="14" height="14" rx="2"/>${p('M3 13l4-4 3 3 2-2 5 5')}<circle cx="8" cy="8" r="1.5" fill="currentColor" stroke="none"/>`),
  svg:     svg(p('M6 7l-4 3 4 3M14 7l4 3-4 3M11 5l-2 10')),
  trash:   svg(p('M4 6h12M9 3h2M16 6l-1 11H5L4 6M9 10v4M11 10v4')),
  prefs:   svg(p('M3 5h14M3 10h14M3 15h14M7 3v4M13 8v4M10 13v4')),
  chevron: svg(p('M8 5l5 5-5 5')),
  guide:   svg(p('M10 2a8 8 0 100 16A8 8 0 0010 2zM10 7v4M10 13h.01')),
  about:   svg(p('M3 4a1 1 0 011-1h12a1 1 0 011 1v12a1 1 0 01-1 1H4a1 1 0 01-1-1zM10 9v5M10 6.5h.01')),
  coffee:  svg(p('M6 2v3M10 2v3M14 2v3M4 7h12l-1.5 9a2 2 0 01-2 1.5h-5a2 2 0 01-2-1.5zM16 9h2a2 2 0 010 4h-2')),
  lang:    svg(p('M10 2a8 8 0 100 16A8 8 0 0010 2zM2 10h16M10 2c-2 4-2 10 0 16M10 2c2 4 2 10 0 16')),
  sun:     svg(`<circle cx="10" cy="10" r="3"/>${p('M10 2v2M10 16v2M2 10h2M16 10h2M4.22 4.22l1.41 1.41M13.37 13.37l1.41 1.41M4.22 15.78l1.41-1.41M13.37 6.63l1.41-1.41')}`),
  moon:    svg(p('M15 10a6 6 0 01-6 6 6 6 0 010-12c.34 0 .67.03 1 .08A5 5 0 1014.92 9c.05.33.08.66.08 1z')),
  device:  svg(`<rect x="2" y="3" width="16" height="11" rx="2"/>${p('M7 18h6M10 14v4')}`),
};

export function initSettings(
  appEl: HTMLElement,
  toolbarEl: HTMLElement,
  history: History,
): void {
  let current = loadSettings();
  applySettings(appEl, current);

  // ── Menu button ─────────────────────────────────────────────────────────
  const menuBtn = document.createElement('button');
  menuBtn.className = 'tb-btn';
  menuBtn.title = 'Menu';
  menuBtn.innerHTML = ICONS.hamburger;
  const leftSection = toolbarEl.querySelector<HTMLElement>('.tb-left');
  (leftSection ?? toolbarEl).appendChild(menuBtn);

  // ── File input (hidden) ─────────────────────────────────────────────────
  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = '.markasso,application/json';
  fileInput.style.display = 'none';
  document.body.appendChild(fileInput);
  fileInput.addEventListener('change', () => {
    const f = fileInput.files?.[0];
    if (f) importMarkasso(f, history);
    fileInput.value = '';
    close();
  });

  // ── Panel ────────────────────────────────────────────────────────────────
  const panel = document.createElement('div');
  panel.className = 'settings-panel';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-modal', 'true');
  panel.setAttribute('aria-label', 'Menu');
  panel.setAttribute('aria-hidden', 'true');
  document.body.appendChild(panel);

  panel.innerHTML = `
    <div class="menu-body">
      <ul>
        <li>
          <button class="menu-item" id="menu-open">
            ${ICONS.open}<span class="menu-item-label">${t('menuOpen')}</span>
          </button>
        </li>
        <li>
          <button class="menu-item" id="menu-save">
            ${ICONS.save}<span class="menu-item-label">${t('menuSave')}</span>
          </button>
        </li>
        <li>
          <button class="menu-item" id="menu-export-png">
            ${ICONS.png}<span class="menu-item-label">${t('exportPNG')}</span>
          </button>
        </li>
        <li>
          <button class="menu-item" id="menu-export-svg">
            ${ICONS.svg}<span class="menu-item-label">${t('exportSVG')}</span>
          </button>
        </li>
      </ul>
      
      <div class="menu-divider"></div>

      <button class="menu-item" id="menu-guide">
        ${ICONS.guide}<span class="menu-item-label">${t('guide')}</span>
      </button>

      <div class="menu-divider"></div>

      <button class="menu-item menu-item--prefs" id="menu-prefs-toggle" aria-expanded="false">
        ${ICONS.prefs}
        <span class="menu-item-label">${t('preferences')}</span>
        <span class="menu-arrow">${ICONS.chevron}</span>
      </button>
      <div class="menu-prefs" id="menu-prefs-body" aria-hidden="true">
        <div class="pref-check-row">
          <label class="pref-check-label">
            <input type="checkbox" id="sp-grid-visible" />
            ${t('grid')}
          </label>
          <div class="pref-grid-types">
            ${GRID_TYPES.map((g) =>
              `<button class="sp-grid-btn" data-grid="${g.type}" title="${g.desc}">${g.label}</button>`
            ).join('')}
          </div>
        </div>
        <button class="pref-btn" id="sp-fit-to-content">${t('fitToContent')}</button>
        <button class="pref-btn" id="sp-reset-zoom">${t('resetZoom100')}</button>
      </div>

      <div class="menu-divider"></div>

      <button class="menu-item menu-item--danger" id="menu-clear">
        ${ICONS.trash}<span class="menu-item-label">${t('clearCanvas')}</span>
      </button>

      <div class="menu-divider"></div>

      <div class="menu-section-label">${t('canvasBg')}</div>
      <div class="menu-bg-swatches" id="menu-bg-swatches" role="group" aria-label="${t('canvasBg')}"></div>

      <div class="menu-divider"></div>

      <div class="menu-section-label">${t('theme')}</div>
      <div class="menu-theme-toggle" role="group" aria-label="${t('theme')}">
        <button class="menu-theme-btn" data-mode="light"  title="${t('themeLight')}"  aria-pressed="false">${ICONS.sun}${t('themeLight')}</button>
        <button class="menu-theme-btn" data-mode="dark"   title="${t('themeDark')}"   aria-pressed="false">${ICONS.moon}${t('themeDark')}</button>
        <button class="menu-theme-btn" data-mode="device" title="${t('themeDevice')}" aria-pressed="false">${ICONS.device}${t('themeDevice')}</button>
      </div>
     <div class="menu-divider"></div>
     <div class="flex-col">
       <div class="menu-section-label">${t('language')}</div>
       <div class="sp-lang-wrapper menu-theme-toggle ">
            <select class="sp-lang-select" id="sp-lang-select">
              ${(Object.entries(LOCALES) as [Locale, string][]).map(([code, name]) =>
        `<option value="${code}"${getLocale() === code ? ' selected' : ''}>${name}</option>`
      ).join('')}
            </select>
        </div>
        </div>

      <div class="menu-divider"></div>

      <button class="menu-item" id="menu-about">
        ${ICONS.about}<span class="menu-item-label">${t('menuAbout')}</span>
      </button>
    </div>
  `;

  // ── About modal ──────────────────────────────────────────────────────────
  const aboutModal = document.createElement('div');
  aboutModal.className = 'about-modal';
  aboutModal.setAttribute('role', 'dialog');
  aboutModal.setAttribute('aria-modal', 'true');
  aboutModal.setAttribute('aria-label', 'About Markasso');
  aboutModal.setAttribute('aria-hidden', 'true');
  aboutModal.innerHTML = `
    <div class="about-modal-box">
      <img class="about-modal-logo" width="64" height="64" src="markasso-logo-icon.svg" alt="Markasso"/>
      <h2 class="about-modal-name">Markasso</h2>
      <p class="about-modal-desc">${t('aboutDescription')}</p>
      <p class="about-modal-author">by <strong>alBz</strong></p>
      <a class="about-modal-coffee" href="https://buymeacoffee.com/albz" target="_blank" rel="noopener noreferrer">
        ${ICONS.coffee} Buy me a coffee
      </a>
      <span class="about-modal-version">v${pkg.version}</span>
    </div>
  `;
  document.body.appendChild(aboutModal);

  function openAbout(): void {
    aboutModal.classList.add('open');
    aboutModal.setAttribute('aria-hidden', 'false');
  }
  function closeAbout(): void {
    aboutModal.classList.remove('open');
    aboutModal.setAttribute('aria-hidden', 'true');
  }

  aboutModal.addEventListener('click', (e) => {
    if (e.target === aboutModal) closeAbout();
  });
  aboutModal.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeAbout();
  });

  // ── Panel state ──────────────────────────────────────────────────────────
  let prefsOpen = false;

  function open(): void {
    panel.classList.add('open');
    panel.setAttribute('aria-hidden', 'false');
    positionPanel();
    syncPanel();
  }
  function close(): void {
    panel.classList.remove('open');
    panel.setAttribute('aria-hidden', 'true');
  }
  function positionPanel(): void {
    const r = menuBtn.getBoundingClientRect();
    panel.style.top  = `${r.bottom + 10}px`;
    panel.style.left = `${r.left}px`;
  }
  function syncPanel(): void {
    const gridVis = panel.querySelector<HTMLInputElement>('#sp-grid-visible')!;
    gridVis.checked = history.present.appState.gridVisible;

    panel.querySelectorAll<HTMLButtonElement>('.sp-grid-btn').forEach((b) => {
      const isActive = b.dataset['grid'] === history.present.appState.gridType;
      b.classList.toggle('active', isActive);
      b.setAttribute('aria-pressed', String(isActive));
    });

    panel.querySelectorAll<HTMLButtonElement>('.sp-preset').forEach((b) => {
      b.classList.toggle('active', b.dataset['color'] === current.bgColor);
    });

    const hasElements = history.present.elements.length > 0;
    panel.querySelector<HTMLButtonElement>('#menu-save')!.disabled        = !hasElements;
    panel.querySelector<HTMLButtonElement>('#menu-export-png')!.disabled  = !hasElements;
    panel.querySelector<HTMLButtonElement>('#menu-export-svg')!.disabled  = !hasElements;
    panel.querySelector<HTMLButtonElement>('#menu-clear')!.disabled       = !hasElements;

    const prefsBody   = panel.querySelector<HTMLElement>('#menu-prefs-body')!;
    const prefsToggle = panel.querySelector<HTMLButtonElement>('#menu-prefs-toggle')!;
    prefsBody.setAttribute('aria-hidden', prefsOpen ? 'false' : 'true');
    prefsToggle.classList.toggle('prefs-open', prefsOpen);
    prefsToggle.setAttribute('aria-expanded', String(prefsOpen));

    const curMode = getThemeMode();
    panel.querySelectorAll<HTMLButtonElement>('.menu-theme-btn').forEach((b) => {
      const isActive = b.dataset['mode'] === curMode;
      b.classList.toggle('active', isActive);
      b.setAttribute('aria-pressed', String(isActive));
    });
  }

  // ── Keyboard: close on Escape ────────────────────────────────────────────
  panel.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') close();
  });

  // ── Toggle ───────────────────────────────────────────────────────────────
  menuBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    panel.classList.contains('open') ? close() : open();
  });
  document.addEventListener('click', (e) => {
    if (!panel.contains(e.target as Node) && e.target !== menuBtn) close();
  });

  // ── File actions ─────────────────────────────────────────────────────────
  panel.querySelector<HTMLButtonElement>('#menu-open')!.addEventListener('click', () => {
    fileInput.click();
  });
  panel.querySelector<HTMLButtonElement>('#menu-save')!.addEventListener('click', () => {
    exportMarkasso(history.present);
    close();
  });
  panel.querySelector<HTMLButtonElement>('#menu-export-png')!.addEventListener('click', () => {
    exportPNG(history.present, true);
    close();
  });
  panel.querySelector<HTMLButtonElement>('#menu-export-svg')!.addEventListener('click', () => {
    exportSVG(history.present, true);
    close();
  });
  panel.querySelector<HTMLButtonElement>('#menu-guide')!.addEventListener('click', () => {
    window.open('https://github.com/AlbertoBarrago/Markasso/blob/main/MANUAL.md', '_blank');
    close();
  });
  panel.querySelector<HTMLButtonElement>('#menu-about')!.addEventListener('click', () => {
    close();
    openAbout();
  });
  panel.querySelector<HTMLButtonElement>('#menu-clear')!.addEventListener('click', () => {
    if (confirm('Clear the canvas? This cannot be undone.')) {
      history.dispatch({ type: 'LOAD_SCENE', elements: [], viewport: history.present.viewport });
      close();
    }
  });

  // ── Preferences ──────────────────────────────────────────────────────────
  panel.querySelector<HTMLButtonElement>('#menu-prefs-toggle')!.addEventListener('click', () => {
    prefsOpen = !prefsOpen;
    syncPanel();
  });
  panel.querySelector<HTMLInputElement>('#sp-grid-visible')!.addEventListener('change', () => {
    history.dispatch({ type: 'TOGGLE_GRID' });
  });
  panel.querySelectorAll<HTMLButtonElement>('.sp-grid-btn').forEach((b) => {
    b.addEventListener('click', () => {
      history.dispatch({ type: 'SET_GRID_TYPE', gridType: b.dataset['grid'] as GridType });
      if (!history.present.appState.gridVisible) {
        history.dispatch({ type: 'TOGGLE_GRID' });
      }
      syncPanel();
    });
  });
  panel.querySelector<HTMLButtonElement>('#sp-fit-to-content')!.addEventListener('click', () => {
    const vp = fitToElements(history.present.elements, window.innerWidth, window.innerHeight);
    history.dispatch({ type: 'SET_VIEWPORT', offsetX: vp.offsetX, offsetY: vp.offsetY, zoom: vp.zoom });
    close();
  });
  panel.querySelector<HTMLButtonElement>('#sp-reset-zoom')!.addEventListener('click', () => {
    history.dispatch({ type: 'SET_VIEWPORT', offsetX: 0, offsetY: 0, zoom: 1 });
    close();
  });

  // ── Background swatches ──────────────────────────────────────────────────
  function renderBgSwatches(): void {
    const container = panel.querySelector<HTMLElement>('#menu-bg-swatches')!;
    const colors = isResolvedLight() ? LIGHT_BG_COLORS : DARK_BG_COLORS;
    container.innerHTML = colors.map((c) =>
      `<button class="sp-preset" data-color="${c}" style="background:${c}" title="${c}"></button>`
    ).join('');
    container.querySelectorAll<HTMLButtonElement>('.sp-preset').forEach((b) => {
      b.classList.toggle('active', b.dataset['color'] === current.bgColor);
      b.addEventListener('click', () => {
        current = { ...current, bgColor: b.dataset['color']! };
        saveSettings(current);
        applySettings(appEl, current);
        syncPanel();
      });
    });
  }

  renderBgSwatches();

  // ── Language selector ────────────────────────────────────────────────────
  panel.querySelector<HTMLSelectElement>('#sp-lang-select')!.addEventListener('change', (e) => {
    setLocale((e.target as HTMLSelectElement).value as Locale);
  });

  // ── Theme toggle ─────────────────────────────────────────────────────────
  panel.querySelectorAll<HTMLButtonElement>('.menu-theme-btn').forEach((b) => {
    b.addEventListener('click', () => {
      applyTheme(b.dataset['mode'] as ThemeMode);
      current = { ...current, bgColor: isResolvedLight() ? LIGHT_BG_COLORS[0]! : DARK_BG_COLORS[0]! };
      saveSettings(current);
      applySettings(appEl, current);
      renderBgSwatches();
      syncPanel();
    });
  });

  // Re-apply when system preference changes (for device mode)
  window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', (e) => {
    if (getThemeMode() === 'device') {
      applyTheme('device');
      current = { ...current, bgColor: e.matches ? LIGHT_BG_COLORS[0]! : DARK_BG_COLORS[0]! };
      saveSettings(current);
      applySettings(appEl, current);
      renderBgSwatches();
      syncPanel();
    }
  });

  history.subscribe(syncPanel);
}
