import pkg from '../../package.json';
import type { GridType } from '../core/app_state';
import { fitToElements } from '../core/viewport';
import type { History } from '../engine/history';
import { getLocale, LOCALES, type Locale, setLocale, t } from '../i18n';
import { exportMarkasso, importMarkasso } from '../io/markasso';
import { PRESETS } from '../io/presets';
import {
  buildLiveRoomUrl,
  generateRoomId,
  getStoredName,
  joinLiveSession,
} from '../io/realtime';
import { buildShareUrl } from '../io/share';
import { exportHTML, exportPNG, exportSVG } from '../rendering/export';
import { invalidateThemeCache } from '../rendering/theme_cache';
import { toggleLibrary } from './library_panel';
import { setLiveUI } from './live_name';
import {
  copyToClipboard,
  showLiveStatusToast,
  showShareToast,
} from './share_actions';

// ── Theme ─────────────────────────────────────────────────────────────────
export type ThemeMode = 'light' | 'dark' | 'device';

const THEME_KEY = 'markasso-theme';

export function getThemeMode(): ThemeMode {
  const s = localStorage.getItem(THEME_KEY);
  return s === 'light' || s === 'dark' || s === 'device' ? s : 'dark';
}

export function applyTheme(mode: ThemeMode): void {
  localStorage.setItem(THEME_KEY, mode);
  const resolved =
    mode === 'device'
      ? window.matchMedia('(prefers-color-scheme: light)').matches
        ? 'light'
        : 'dark'
      : mode;
  document.documentElement.setAttribute('data-theme', resolved);
  invalidateThemeCache();
}

// Apply at module load to avoid flash of wrong theme
applyTheme(getThemeMode());

export interface UISettings {
  bgColor: string;
  showMinimap: boolean;
}

const STORAGE_KEY = 'markasso-ui-settings';

function isResolvedLight(): boolean {
  return document.documentElement.getAttribute('data-theme') === 'light';
}

export function loadSettings(): UISettings {
  const defaultBg = isResolvedLight() ? '#ffffff' : '#080808';
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw)
      return {
        bgColor: defaultBg,
        showMinimap: true,
        ...(JSON.parse(raw) as Partial<UISettings>),
      };
  } catch {
    /* ignore */
  }
  return { bgColor: defaultBg, showMinimap: true };
}

export function saveSettings(s: UISettings): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
}

export function applySettings(appEl: HTMLElement, s: UISettings): void {
  document.documentElement.style.setProperty('--canvas-bg', s.bgColor);
  // The renderer caches the canvas background; invalidate it so a background
  // color change is reflected on the next frame.
  invalidateThemeCache();
  appEl.classList.toggle('minimap-hidden', !s.showMinimap);
}

const GRID_TYPES: { type: GridType; label: string; desc: string }[] = [
  { type: 'dot', label: '•', desc: t('dotGrid') },
  { type: 'line', label: '≡', desc: t('lineGrid') },
  { type: 'mm', label: '▦', desc: t('graphPaper') },
];

const DARK_BG_COLORS = [
  '#141414',
  '#1a1a2e',
  '#0d1117',
  '#1e1e1e',
  '#12100e',
  '#0f1923',
];
const LIGHT_BG_COLORS = [
  '#ffffff',
  '#fef5ef',
  '#fde8d8',
  '#f8dfd4',
  '#f5d5c8',
  '#f0cfc0',
];
const LIGHT_STROKE_COLOR = '#000000';
const DARK_STROKE_COLOR = '#e2e2ef';

function svg(inner: string, size = 16): string {
  return `<svg width="${size}" height="${size}" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`;
}
function p(d: string): string {
  return `<path d="${d}"/>`;
}

const ICONS = {
  gear: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M10.33 4.32c.43-1.76 2.93-1.76 3.35 0a1.72 1.72 0 0 0 2.57 1.07c1.54-.94 3.31.83 2.37 2.37a1.72 1.72 0 0 0 1.06 2.57c1.76.43 1.76 2.93 0 3.35a1.72 1.72 0 0 0-1.07 2.57c.94 1.54-.83 3.31-2.37 2.37a1.72 1.72 0 0 0-2.57 1.06c-.43 1.76-2.93 1.76-3.35 0a1.72 1.72 0 0 0-2.57-1.07c-1.54.94-3.31-.83-2.37-2.37a1.72 1.72 0 0 0-1.06-2.57c-1.76-.43-1.76-2.93 0-3.35a1.72 1.72 0 0 0 1.07-2.57c-.94-1.54.83-3.31 2.37-2.37 1 .61 2.3.07 2.57-1.06z"/><circle cx="12" cy="12" r="3"/></svg>`,
  open: svg(
    p('M2 9a2 2 0 012-2h4l2-2h6a2 2 0 012 2v7a2 2 0 01-2 2H4a2 2 0 01-2-2z'),
  ),
  save: svg(p('M10 3v8M7 8l3 3 3-3M4 15v1a1 1 0 001 1h10a1 1 0 001-1v-1')),
  export: svg(p('M10 13V3M7 6l3-3 3 3M4 15v1a1 1 0 001 1h10a1 1 0 001-1v-1')),
  png: svg(
    `<rect x="3" y="3" width="14" height="14" rx="2"/>${p('M3 13l4-4 3 3 2-2 5 5')}<circle cx="8" cy="8" r="1.5" fill="currentColor" stroke="none"/>`,
  ),
  svg: svg(p('M6 7l-4 3 4 3M14 7l4 3-4 3M11 5l-2 10')),
  html: svg(
    `<rect x="2" y="3" width="16" height="14" rx="2"/>${p('M2 7h16M8 10l-2 2 2 2M12 10l2 2-2 2')}`,
  ),
  share: svg(
    `<circle cx="15" cy="5" r="2"/><circle cx="5" cy="10" r="2"/><circle cx="15" cy="15" r="2"/>${p('M7 9l6-3M7 11l6 3')}`,
  ),
  live: svg(
    `<circle cx="10" cy="10" r="2"/>${p('M6.5 6.5a5 5 0 000 7M13.5 6.5a5 5 0 010 7M4 4a8.5 8.5 0 000 12M16 4a8.5 8.5 0 010 12')}`,
  ),
  link: svg(
    p(
      'M8.5 11.5a3.5 3.5 0 005 0l2.5-2.5a3.5 3.5 0 00-5-5l-1 1M11.5 8.5a3.5 3.5 0 00-5 0L4 11a3.5 3.5 0 005 5l1-1',
    ),
  ),
  x: `<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>`,
  reddit: `<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0zm5.01 4.744c.688 0 1.25.561 1.25 1.249a1.25 1.25 0 0 1-2.498.056l-2.597-.547-.8 3.747c1.824.07 3.48.632 4.674 1.488.308-.309.73-.491 1.207-.491.968 0 1.754.786 1.754 1.754 0 .716-.435 1.333-1.01 1.614a3.111 3.111 0 0 1 .042.52c0 2.694-3.13 4.87-7.004 4.87-3.874 0-7.004-2.176-7.004-4.87 0-.183.015-.366.043-.534A1.748 1.748 0 0 1 4.028 12c0-.968.786-1.754 1.754-1.754.463 0 .898.196 1.207.49 1.207-.883 2.878-1.43 4.744-1.487l.885-4.182a.342.342 0 0 1 .14-.197.35.35 0 0 1 .238-.042l2.906.617a1.214 1.214 0 0 1 1.108-.701zM9.25 12C8.561 12 8 12.562 8 13.25c0 .687.561 1.248 1.25 1.248.687 0 1.248-.561 1.248-1.249 0-.688-.561-1.249-1.249-1.249zm5.5 0c-.687 0-1.248.561-1.248 1.25 0 .687.561 1.248 1.249 1.248.688 0 1.249-.561 1.249-1.249 0-.687-.562-1.249-1.25-1.249zm-5.466 3.99a.327.327 0 0 0-.231.094.33.33 0 0 0 0 .463c.842.842 2.484.913 2.961.913.477 0 2.105-.056 2.961-.913a.361.361 0 0 0 .029-.463.33.33 0 0 0-.464 0c-.547.533-1.684.73-2.512.73-.828 0-1.979-.196-2.512-.73a.326.326 0 0 0-.232-.095z"/></svg>`,
  bluesky: `<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 10.8c-1.087-2.114-4.046-6.053-6.798-7.995C2.566.944 1.561 1.266.902 1.565.139 1.912 0 3.083 0 3.75c0 .667.365 5.46.6 6.256.771 2.627 3.516 3.516 6.056 3.216-3.86.57-7.286 1.996-2.79 7.03 4.958 5.4 6.79-1.157 7.734-4.4.944 3.243 2.077 9.573 7.634 4.4 4.22-4.4 1.07-6.46-2.79-7.03 2.54.3 5.285-.59 6.056-3.216.235-.796.6-5.59.6-6.256 0-.667-.14-1.838-.902-2.185-.66-.3-2.164-.621-4.998 1.62-2.752 2.05-5.71 5.98-6.798 8.14z"/></svg>`,
  mermaid: svg(
    `<rect x="1" y="1" width="7" height="5" rx="1"/><rect x="12" y="14" width="7" height="5" rx="1"/>${p('M4.5 6v4h11v4M14 16l1.5-2 1.5 2')}`,
  ),
  presets: svg(
    `<rect x="2" y="2" width="6" height="6" rx="1.5"/><rect x="12" y="2" width="6" height="6" rx="1.5"/><rect x="2" y="12" width="6" height="6" rx="1.5"/><rect x="12" y="12" width="6" height="6" rx="1.5"/>`,
  ),
  library: svg(
    `<rect x="3" y="3.5" width="3.5" height="13" rx="0.8"/><rect x="8" y="3.5" width="3.5" height="13" rx="0.8"/>${p('M13.2 4.6l3.2-.9 3 11.6-3.2.9z')}`,
  ),
  trash: svg(p('M4 6h12M9 3h2M16 6l-1 11H5L4 6M9 10v4M11 10v4')),
  prefs: svg(p('M3 5h14M3 10h14M3 15h14M7 3v4M13 8v4M10 13v4')),
  chevron: svg(p('M8 5l5 5-5 5')),
  check: svg(p('M4 10.5l4 4 8-9')),
  fit: svg(
    p(
      'M3 7V4a1 1 0 011-1h3M13 3h3a1 1 0 011 1v3M17 13v3a1 1 0 01-1 1h-3M7 17H4a1 1 0 01-1-1v-3',
    ),
  ),
  zoomReset: svg(`<circle cx="9" cy="9" r="5.5"/>${p('M13 13l4 4M7 9h4')}`),
  guide: svg(p('M10 2a8 8 0 100 16A8 8 0 0010 2zM10 7v4M10 13h.01')),
  report: svg(
    p(
      'M10 3v3M6 4l1.5 2M14 4l-1.5 2M4 12a6 6 0 0112 0M5 9h10M4 12v2a1 1 0 001 1h10a1 1 0 001-1v-2M8 17h4',
    ),
  ),
  // Outline mark on a 24-unit grid, matching the stroke style of the others.
  github: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 00-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0020 4.77 5.07 5.07 0 0019.91 1S18.73.65 16 2.48a13.38 13.38 0 00-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 005 4.77a5.44 5.44 0 00-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 009 18.13V22"/></svg>`,
  about: svg(
    p(
      'M3 4a1 1 0 011-1h12a1 1 0 011 1v12a1 1 0 01-1 1H4a1 1 0 01-1-1zM10 9v5M10 6.5h.01',
    ),
  ),
  coffee: svg(
    p(
      'M6 2v3M10 2v3M14 2v3M4 7h12l-1.5 9a2 2 0 01-2 1.5h-5a2 2 0 01-2-1.5zM16 9h2a2 2 0 010 4h-2',
    ),
  ),
  lang: svg(
    p(
      'M10 2a8 8 0 100 16A8 8 0 0010 2zM2 10h16M10 2c-2 4-2 10 0 16M10 2c2 4 2 10 0 16',
    ),
  ),
  sun: svg(
    `<circle cx="10" cy="10" r="3"/>${p('M10 2v2M10 16v2M2 10h2M16 10h2M4.22 4.22l1.41 1.41M13.37 13.37l1.41 1.41M4.22 15.78l1.41-1.41M13.37 6.63l1.41-1.41')}`,
  ),
  moon: svg(
    p(
      'M15 10a6 6 0 01-6 6 6 6 0 010-12c.34 0 .67.03 1 .08A5 5 0 1014.92 9c.05.33.08.66.08 1z',
    ),
  ),
  device: svg(
    `<rect x="2" y="3" width="16" height="11" rx="2"/>${p('M7 18h6M10 14v4')}`,
  ),
};

export function initSettings(
  appEl: HTMLElement,
  toolbarEl: HTMLElement,
  history: History,
  openReportForm: () => void,
  openGuide: () => void,
  openMermaidDialog: () => void,
  openSupport: () => void,
): void {
  let current = loadSettings();
  applySettings(appEl, current);

  // ── Menu button ─────────────────────────────────────────────────────────
  // A menu button and a menu whose submenus open on the right, following the
  // WAI-ARIA APG menu pattern:
  // https://www.w3.org/WAI/ARIA/apg/patterns/menubar/examples/menubar-navigation/
  const menuBtn = document.createElement('button');
  menuBtn.className = 'tb-btn';
  menuBtn.id = 'menu-btn';
  menuBtn.title = 'Menu';
  menuBtn.setAttribute('aria-label', 'Menu');
  menuBtn.setAttribute('aria-haspopup', 'true');
  menuBtn.setAttribute('aria-expanded', 'false');
  menuBtn.setAttribute('aria-controls', 'menu-list');
  menuBtn.innerHTML = ICONS.gear;
  const leftSection = toolbarEl.querySelector<HTMLElement>('.tb-left');
  (leftSection ?? toolbarEl).prepend(menuBtn);

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
  panel.setAttribute('aria-hidden', 'true');
  document.body.appendChild(panel);

  const item = (
    id: string,
    icon: string,
    label: string,
    cls = '',
    hint = '',
  ): string =>
    `<li role="none"><button class="menu-item ${cls}" role="menuitem" tabindex="-1" id="${id}">${icon}<span class="menu-item-label">${label}</span>${hint}</button></li>`;
  const checkMark = `<span class="menu-check" aria-hidden="true">${ICONS.check}</span>`;
  const checkItem = (
    role: 'menuitemcheckbox' | 'menuitemradio',
    attrs: string,
    label: string,
    hint = '',
  ): string =>
    `<li role="none"><button class="menu-item" role="${role}" tabindex="-1" aria-checked="false" ${attrs}>${checkMark}<span class="menu-item-label">${label}</span>${hint}</button></li>`;
  const parentItem = (
    id: string,
    icon: string,
    label: string,
    items: string,
    hint = '',
  ): string =>
    `<li role="none">
      <button class="menu-item" role="menuitem" tabindex="-1" id="${id}" aria-haspopup="true" aria-expanded="false" aria-controls="${id}-sub">
        ${icon}<span class="menu-item-label">${label}</span>${hint}<span class="menu-arrow" aria-hidden="true">${ICONS.chevron}</span>
      </button>
      <ul class="menu-sub" role="menu" id="${id}-sub" aria-label="${label}" hidden>${items}</ul>
    </li>`;
  const separator = '<li role="separator" class="menu-divider"></li>';
  const hint = (text: string): string =>
    `<span class="menu-item-hint" aria-hidden="true">${text}</span>`;
  // Shown only; the item exposes the shortcut through aria-keyshortcuts.
  const kbd = (key: string): string =>
    `<kbd class="menu-item-kbd" aria-hidden="true">${key}</kbd>`;

  panel.innerHTML = `
    <ul class="menu-body" role="menu" id="menu-list" aria-labelledby="menu-btn">
      ${item('menu-open', ICONS.open, t('menuOpen'))}
      ${item('menu-save', ICONS.save, t('menuSave'))}
      ${parentItem(
        'menu-export',
        ICONS.export,
        t('export'),
        item('menu-export-png', ICONS.png, t('exportPNG')) +
          item('menu-export-svg', ICONS.svg, t('exportSVG')) +
          item('menu-export-html', ICONS.html, t('exportHTML')),
      )}
      ${parentItem(
        'menu-share',
        ICONS.share,
        t('shareLink'),
        item('menu-share-live', ICONS.live, t('shareGoLive')) +
          separator +
          item('menu-share-copy', ICONS.link, t('shareCopyLink')) +
          item('menu-share-x', ICONS.x, t('shareX')) +
          item('menu-share-reddit', ICONS.reddit, t('shareReddit')) +
          item('menu-share-bluesky', ICONS.bluesky, t('shareBluesky')),
        '<span class="menu-item-hint" id="menu-share-peers"></span>',
      )}
      ${item('menu-import-mermaid', ICONS.mermaid, t('importMermaid'))}
      ${separator}
      ${parentItem(
        'menu-presets',
        ICONS.presets,
        t('presets'),
        PRESETS.map((def) =>
          item(`menu-preset-${def.id}`, def.icon, t(def.labelKey)),
        ).join(''),
      )}
      ${item('menu-library', ICONS.library, t('library'), '', kbd('I'))}
      ${separator}
      ${item('menu-clear', ICONS.trash, t('clearCanvas'), 'menu-item--danger')}
      ${separator}
      ${parentItem(
        'menu-prefs',
        ICONS.prefs,
        t('preferences'),
        checkItem('menuitemcheckbox', 'id="sp-grid-visible"', t('grid')) +
          `<li role="none"><ul role="group" aria-label="${t('grid')}">${GRID_TYPES.map(
            (g) =>
              checkItem(
                'menuitemradio',
                `data-grid="${g.type}"`,
                g.desc,
                hint(g.label),
              ),
          ).join('')}</ul></li>` +
          separator +
          checkItem(
            'menuitemcheckbox',
            'id="sp-minimap-visible"',
            t('showMinimap'),
          ) +
          separator +
          item('sp-fit-to-content', ICONS.fit, t('fitToContent')) +
          item('sp-reset-zoom', ICONS.zoomReset, t('resetZoom100')),
      )}
      ${parentItem(
        'menu-lang',
        ICONS.lang,
        t('language'),
        (Object.entries(LOCALES) as [Locale, string][])
          .map(([code, name]) =>
            checkItem('menuitemradio', `data-locale="${code}"`, name),
          )
          .join(''),
        hint(LOCALES[getLocale()]),
      )}
      ${separator}
      ${item('menu-guide', ICONS.guide, t('guide'))}
      ${item('menu-report', ICONS.report, t('reportProblem'))}
      ${separator}
      <li role="none" class="menu-section-label" id="menu-bg-label" aria-hidden="true">${t('canvasBg')}</li>
      <li role="none">
        <ul class="menu-bg-swatches" id="menu-bg-swatches" role="group" aria-labelledby="menu-bg-label"></ul>
      </li>
      ${separator}
      <li role="none" class="menu-section-label" id="menu-theme-label" aria-hidden="true">${t('theme')}</li>
      <li role="none">
        <ul class="menu-theme-toggle" role="group" aria-labelledby="menu-theme-label">
          <li role="none"><button class="menu-theme-btn" role="menuitemradio" tabindex="-1" aria-checked="false" data-mode="light">${ICONS.sun}${t('themeLight')}</button></li>
          <li role="none"><button class="menu-theme-btn" role="menuitemradio" tabindex="-1" aria-checked="false" data-mode="dark">${ICONS.moon}${t('themeDark')}</button></li>
          <li role="none"><button class="menu-theme-btn" role="menuitemradio" tabindex="-1" aria-checked="false" data-mode="device">${ICONS.device}${t('themeDevice')}</button></li>
        </ul>
      </li>
    </ul>
    <div class="menu-footer">
      <button class="menu-footer-link menu-footer-coffee" id="menu-coffee">${ICONS.coffee} Buy me a coffee</button>
      <a class="menu-footer-link" id="menu-github" href="https://github.com/AlbertoBarrago/Markasso" target="_blank" rel="noopener noreferrer" title="GitHub" aria-label="GitHub, v${pkg.version}">
        ${ICONS.github}
        <span class="menu-version">v${pkg.version}</span>
      </a>
    </div>
  `;

  // ── Menu navigation ──────────────────────────────────────────────────────
  const mainMenu = panel.querySelector<HTMLElement>('#menu-list')!;
  const ITEM =
    '[role="menuitem"], [role="menuitemcheckbox"], [role="menuitemradio"]';
  /** The items of `menu` itself, not those of its submenus. */
  const itemsOf = (menu: HTMLElement): HTMLElement[] =>
    [...menu.querySelectorAll<HTMLElement>(ITEM)].filter(
      (el) => el.closest('[role="menu"]') === menu,
    );
  const focusAt = (items: HTMLElement[], index: number): void => {
    items[(index + items.length) % items.length]?.focus();
  };
  const isDisabled = (el: Element): boolean =>
    el.getAttribute('aria-disabled') === 'true';
  const submenuOf = (parent: Element): HTMLElement =>
    document.getElementById(parent.getAttribute('aria-controls')!)!;

  let openParent: HTMLElement | null = null;
  /** The item Tab left for the footer; Shift+Tab returns to it. */
  let lastItem: HTMLElement | null = null;
  // The footer controls (GitHub, coffee) sit outside the menu: Tab moves
  // between them natively, and leaving them either way ends at the menu.
  const footerControls = [
    ...panel.querySelectorAll<HTMLElement>('.menu-footer-link'),
  ];
  for (const [i, el] of footerControls.entries()) {
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        close();
      } else if (e.key === 'Tab' && e.shiftKey && i === 0) {
        e.preventDefault();
        (lastItem ?? itemsOf(mainMenu)[0])?.focus();
      } else if (
        e.key === 'Tab' &&
        !e.shiftKey &&
        i === footerControls.length - 1
      ) {
        close();
      }
    });
  }

  function closeSubmenu(): void {
    if (!openParent) return;
    openParent.setAttribute('aria-expanded', 'false');
    submenuOf(openParent).hidden = true;
    openParent = null;
  }
  function openSubmenu(parent: HTMLElement, focus?: 'first' | 'last'): void {
    if (isDisabled(parent)) return;
    const sub = submenuOf(parent);
    if (openParent !== parent) {
      closeSubmenu();
      parent.setAttribute('aria-expanded', 'true');
      sub.hidden = false;
      openParent = parent;
      positionSubmenu(parent, sub);
    }
    if (focus) focusAt(itemsOf(sub), focus === 'first' ? 0 : -1);
  }
  /**
   * Submenus are absolutely positioned against the panel, so they escape the
   * scrolling list and sit on its right, top-aligned with their item. Where
   * the viewport is too narrow (phones) they overlap the panel instead.
   */
  function positionSubmenu(parent: HTMLElement, sub: HTMLElement): void {
    const pr = panel.getBoundingClientRect();
    const ir = parent.getBoundingClientRect();
    const left = Math.min(
      pr.right + 6,
      window.innerWidth - sub.offsetWidth - 8,
    );
    const top = Math.max(
      8,
      Math.min(ir.top - 5, window.innerHeight - sub.offsetHeight - 8),
    );
    sub.style.left = `${left - pr.left - panel.clientLeft}px`;
    sub.style.top = `${top - pr.top - panel.clientTop}px`;
  }

  /** Typeahead: focus the next item whose label starts with `ch`. */
  function focusByChar(items: HTMLElement[], from: number, ch: string): void {
    for (let k = 1; k <= items.length; k++) {
      const el = items[(from + k) % items.length]!;
      const label = (
        el.textContent?.trim() || el.getAttribute('aria-label')
      )?.toLowerCase();
      if (label?.startsWith(ch)) {
        el.focus();
        return;
      }
    }
  }

  panel.addEventListener('keydown', (e) => {
    const target = (e.target as Element).closest<HTMLElement>(ITEM);
    if (!target) return;
    const menu = target.closest<HTMLElement>('[role="menu"]')!;
    const items = itemsOf(menu);
    const i = items.indexOf(target);
    const parent =
      menu === mainMenu
        ? null
        : mainMenu.querySelector<HTMLElement>(`[aria-controls="${menu.id}"]`);
    switch (e.key) {
      case 'ArrowDown':
        focusAt(items, i + 1);
        break;
      case 'ArrowUp':
        focusAt(items, i - 1);
        break;
      case 'Home':
      case 'PageUp':
        focusAt(items, 0);
        break;
      case 'End':
      case 'PageDown':
        focusAt(items, -1);
        break;
      case 'ArrowRight':
        if (target.getAttribute('aria-haspopup') !== 'true') return;
        openSubmenu(target, 'first');
        break;
      case 'ArrowLeft':
        if (!parent) return;
        closeSubmenu();
        parent.focus();
        break;
      case 'Escape':
        if (parent) {
          closeSubmenu();
          parent.focus();
        } else {
          close();
        }
        break;
      case 'Tab':
        // Tab reaches the footer controls, outside the menu.
        if (!e.shiftKey) {
          lastItem = target;
          footerControls[0]?.focus();
          break;
        }
        // Shift+Tab closes and hands focus back to the menu button; the
        // browser then moves it on from there.
        close();
        return;
      case ' ':
        // Buttons activate on Space natively, links don't.
        if (!(target instanceof HTMLAnchorElement)) return;
        target.click();
        break;
      default:
        if (e.key.length !== 1 || e.ctrlKey || e.metaKey || e.altKey) return;
        focusByChar(items, i, e.key.toLowerCase());
    }
    e.preventDefault();
    e.stopPropagation();
  });

  // Enter, Space and clicks open a submenu; from the keyboard (detail 0) its
  // first item takes focus.
  for (const parent of mainMenu.querySelectorAll<HTMLElement>(
    '[aria-haspopup="true"]',
  )) {
    parent.addEventListener('click', (e) =>
      openSubmenu(parent, e.detail === 0 ? 'first' : undefined),
    );
  }
  // With a mouse, hovering an item of the menu opens its submenu or closes
  // the one that is open.
  mainMenu.addEventListener('pointerover', (e) => {
    if (e.pointerType !== 'mouse') return;
    const el = (e.target as Element).closest<HTMLElement>(ITEM);
    if (!el || el.closest('[role="menu"]') !== mainMenu) return;
    if (el.getAttribute('aria-haspopup') === 'true') openSubmenu(el);
    else closeSubmenu();
  });
  mainMenu.addEventListener('scroll', () => {
    if (openParent) positionSubmenu(openParent, submenuOf(openParent));
  });

  // ── Panel state ──────────────────────────────────────────────────────────
  function open(focus: 'first' | 'last'): void {
    panel.classList.add('open');
    panel.setAttribute('aria-hidden', 'false');
    menuBtn.setAttribute('aria-expanded', 'true');
    positionPanel();
    syncPanel();
    focusAt(itemsOf(mainMenu), focus === 'first' ? 0 : -1);
  }
  function close(): void {
    if (!panel.classList.contains('open')) return;
    closeSubmenu();
    panel.classList.remove('open');
    panel.setAttribute('aria-hidden', 'true');
    menuBtn.setAttribute('aria-expanded', 'false');
    if (panel.contains(document.activeElement)) menuBtn.focus();
  }
  function positionPanel(): void {
    const r = menuBtn.getBoundingClientRect();
    const top = r.bottom + 10;
    panel.style.top = `${top}px`;
    panel.style.left = `${r.left}px`;
    // Cap the panel so it never extends past the viewport bottom — without
    // this, entries beyond the visible area were unreachable on short mobile
    // screens (the list scrolls inside it).
    panel.style.maxHeight = `${Math.max(160, window.innerHeight - top - 12)}px`;
  }
  function setChecked(el: Element, checked: boolean): void {
    el.setAttribute('aria-checked', String(checked));
  }
  function syncPanel(): void {
    const { gridVisible, gridType } = history.present.appState;
    setChecked(panel.querySelector('#sp-grid-visible')!, gridVisible);
    setChecked(
      panel.querySelector('#sp-minimap-visible')!,
      current.showMinimap,
    );
    panel.querySelectorAll<HTMLElement>('[data-grid]').forEach((b) => {
      setChecked(b, b.dataset.grid === gridType);
    });
    panel.querySelectorAll<HTMLElement>('[data-locale]').forEach((b) => {
      setChecked(b, b.dataset.locale === getLocale());
    });
    panel.querySelectorAll<HTMLElement>('.sp-preset').forEach((b) => {
      const isActive = b.dataset.color === current.bgColor;
      b.classList.toggle('active', isActive);
      setChecked(b, isActive);
    });

    const hasElements = history.present.elements.length > 0;
    for (const id of [
      '#menu-save',
      '#menu-export',
      '#menu-share',
      '#menu-clear',
    ]) {
      const el = panel.querySelector(id)!;
      if (hasElements) el.removeAttribute('aria-disabled');
      else el.setAttribute('aria-disabled', 'true');
    }
    if (
      !hasElements &&
      (openParent?.id === 'menu-export' || openParent?.id === 'menu-share')
    ) {
      closeSubmenu();
    }

    const curMode = getThemeMode();
    panel.querySelectorAll<HTMLElement>('.menu-theme-btn').forEach((b) => {
      const isActive = b.dataset.mode === curMode;
      b.classList.toggle('active', isActive);
      setChecked(b, isActive);
    });
  }

  // ── Toggle ───────────────────────────────────────────────────────────────
  menuBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    panel.classList.contains('open') ? close() : open('first');
  });
  menuBtn.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    e.stopPropagation();
    open(e.key === 'ArrowDown' ? 'first' : 'last');
  });
  document.addEventListener('click', (e) => {
    if (!panel.contains(e.target as Node) && e.target !== menuBtn) close();
  });
  window.addEventListener('resize', close);

  /** Runs `run` when the item is activated, then closes the menu. */
  function onActivate(selector: string, run: () => unknown): void {
    const el = panel.querySelector<HTMLElement>(selector)!;
    el.addEventListener('click', () => {
      if (isDisabled(el)) return;
      run();
      close();
    });
  }

  // ── File actions ─────────────────────────────────────────────────────────
  onActivate('#menu-open', () => fileInput.click());
  onActivate('#menu-save', () => exportMarkasso(history.present));
  const askBackground = (): boolean => confirm('Include white background?');
  onActivate('#menu-export-png', () =>
    exportPNG(history.present, askBackground()),
  );
  onActivate('#menu-export-svg', () =>
    exportSVG(history.present, askBackground()),
  );
  onActivate('#menu-export-html', () => exportHTML(history.present));

  // ── Share ────────────────────────────────────────────────────────────────
  // A menu holds only menu items, so the live session uses the stored name;
  // the name chip in the top-right island edits it once live.
  const shareLive = panel.querySelector<HTMLElement>('#menu-share-live')!;
  const sharePeers = panel.querySelector<HTMLElement>('#menu-share-peers')!;
  onActivate('#menu-share-live', async () => {
    const roomId = generateRoomId();
    const url = buildLiveRoomUrl(roomId);
    const ok = await copyToClipboard(url);
    showShareToast(ok, url, t('shareLiveCopied'));
    joinLiveSession(history, {
      roomId,
      name: getStoredName() || 'You',
      seedElements: history.present.elements,
      onPeers: (peers) => {
        sharePeers.textContent =
          peers.length > 0
            ? t('livePeers').replace('{{count}}', String(peers.length))
            : '';
      },
      onStatus: (connected) => {
        setLiveUI(connected);
        if (connected) shareLive.setAttribute('aria-disabled', 'true');
        else {
          shareLive.removeAttribute('aria-disabled');
          sharePeers.textContent = '';
        }
        showLiveStatusToast(connected);
      },
    });
  });
  onActivate('#menu-share-copy', async () => {
    const url = await buildShareUrl(history.present.elements);
    const ok = await copyToClipboard(url);
    showShareToast(ok, url);
  });
  const shareTo = (intent: (url: string) => string) => async () => {
    const url = await buildShareUrl(history.present.elements);
    window.open(intent(url), '_blank', 'noopener');
  };
  onActivate(
    '#menu-share-x',
    shareTo(
      (url) =>
        `https://twitter.com/intent/tweet?url=${encodeURIComponent(url)}&text=${encodeURIComponent('Check out my Markasso drawing')}`,
    ),
  );
  onActivate(
    '#menu-share-reddit',
    shareTo(
      (url) =>
        `https://www.reddit.com/submit?url=${encodeURIComponent(url)}&title=Check%20out%20my%20Markasso%20drawing`,
    ),
  );
  onActivate(
    '#menu-share-bluesky',
    shareTo(
      (url) =>
        `https://bsky.app/intent/compose?text=${encodeURIComponent(`Check out my Markasso drawing: ${url}`)}`,
    ),
  );

  onActivate('#menu-import-mermaid', openMermaidDialog);
  for (const def of PRESETS) {
    onActivate(`#menu-preset-${def.id}`, () => {
      // Built at the center of the viewport and grouped.
      const vp = history.present.viewport;
      const cx = (window.innerWidth / 2 - vp.offsetX) / vp.zoom;
      const cy = (window.innerHeight / 2 - vp.offsetY) / vp.zoom;
      const elements = def.buildElements(cx, cy, !isResolvedLight());
      history.dispatch({ type: 'CREATE_ELEMENTS', elements });
      history.dispatch({
        type: 'GROUP_ELEMENTS',
        ids: elements.map((e) => e.id),
        groupId: crypto.randomUUID(),
      });
    });
  }
  panel.querySelector('#menu-library')!.setAttribute('aria-keyshortcuts', 'I');
  onActivate('#menu-library', () => toggleLibrary());
  onActivate('#menu-guide', openGuide);
  onActivate('#menu-report', openReportForm);
  // The link opens itself; this only closes the menu.
  onActivate('#menu-github', () => {});
  onActivate('#menu-coffee', openSupport);
  panel
    .querySelector<HTMLElement>('#menu-clear')!
    .addEventListener('click', (e) => {
      if (isDisabled(e.currentTarget as Element)) return;
      if (confirm('Clear the canvas? This cannot be undone.')) {
        history.dispatch({
          type: 'LOAD_SCENE',
          elements: [],
          viewport: history.present.viewport,
        });
        close();
      }
    });

  // ── Preferences ──────────────────────────────────────────────────────────
  // Checkbox and radio items keep the menu open, so several can be changed.
  panel
    .querySelector<HTMLElement>('#sp-grid-visible')!
    .addEventListener('click', () => {
      history.dispatch({ type: 'TOGGLE_GRID' });
    });
  panel
    .querySelector<HTMLElement>('#sp-minimap-visible')!
    .addEventListener('click', () => {
      current = { ...current, showMinimap: !current.showMinimap };
      saveSettings(current);
      applySettings(appEl, current);
      syncPanel();
    });
  panel.querySelectorAll<HTMLElement>('[data-grid]').forEach((b) => {
    b.addEventListener('click', () => {
      history.dispatch({
        type: 'SET_GRID_TYPE',
        gridType: b.dataset.grid as GridType,
      });
      if (!history.present.appState.gridVisible) {
        history.dispatch({ type: 'TOGGLE_GRID' });
      }
      syncPanel();
    });
  });
  onActivate('#sp-fit-to-content', () => {
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
  });
  onActivate('#sp-reset-zoom', () => {
    history.dispatch({
      type: 'SET_VIEWPORT',
      offsetX: 0,
      offsetY: 0,
      zoom: 1,
    });
  });

  // ── Background swatches ──────────────────────────────────────────────────
  function renderBgSwatches(): void {
    const container = panel.querySelector<HTMLElement>('#menu-bg-swatches')!;
    const colors = isResolvedLight() ? LIGHT_BG_COLORS : DARK_BG_COLORS;
    container.innerHTML = colors
      .map(
        (c) =>
          `<li role="none"><button class="sp-preset" role="menuitemradio" tabindex="-1" aria-checked="false" aria-label="${c}" data-color="${c}" style="background:${c}" title="${c}"></button></li>`,
      )
      .join('');
    container.querySelectorAll<HTMLButtonElement>('.sp-preset').forEach((b) => {
      b.addEventListener('click', () => {
        current = { ...current, bgColor: b.dataset.color! };
        saveSettings(current);
        applySettings(appEl, current);
        syncPanel();
      });
    });
    syncPanel();
  }

  renderBgSwatches();

  // Keep default drawing color high-contrast for the active theme.
  history.dispatch({
    type: 'SET_STROKE_COLOR',
    color: isResolvedLight() ? LIGHT_STROKE_COLOR : DARK_STROKE_COLOR,
  });

  // ── Language ─────────────────────────────────────────────────────────────
  panel.querySelectorAll<HTMLElement>('[data-locale]').forEach((b) => {
    b.addEventListener('click', () => {
      const locale = b.dataset.locale as Locale;
      if (locale !== getLocale()) setLocale(locale);
    });
  });

  // ── Theme toggle ─────────────────────────────────────────────────────────
  panel.querySelectorAll<HTMLButtonElement>('.menu-theme-btn').forEach((b) => {
    b.addEventListener('click', () => {
      // Re-rendering the swatches drops focus; keep it on this item.
      const hadFocus = document.activeElement === b;
      applyTheme(b.dataset.mode as ThemeMode);
      history.dispatch({
        type: 'SET_STROKE_COLOR',
        color: isResolvedLight() ? LIGHT_STROKE_COLOR : DARK_STROKE_COLOR,
      });
      current = {
        ...current,
        bgColor: isResolvedLight() ? LIGHT_BG_COLORS[0]! : DARK_BG_COLORS[0]!,
      };
      saveSettings(current);
      applySettings(appEl, current);
      renderBgSwatches();
      if (hadFocus) b.focus();
    });
  });

  // Re-apply when system preference changes (for device mode)
  window
    .matchMedia('(prefers-color-scheme: light)')
    .addEventListener('change', (e) => {
      if (getThemeMode() === 'device') {
        applyTheme('device');
        history.dispatch({
          type: 'SET_STROKE_COLOR',
          color: isResolvedLight() ? LIGHT_STROKE_COLOR : DARK_STROKE_COLOR,
        });
        current = {
          ...current,
          bgColor: e.matches ? LIGHT_BG_COLORS[0]! : DARK_BG_COLORS[0]!,
        };
        saveSettings(current);
        applySettings(appEl, current);
        renderBgSwatches();
        syncPanel();
      }
    });

  history.subscribe(syncPanel);
}
