import './styles/base.css';
import './styles/theme.css';
import './styles/cloud-page.css';
import { t } from './i18n';
import { initSiteFx } from './site_fx';

/**
 * The /mac page: static copy translated at load, plus the current Mac version
 * read from the worker (which follows the Sparkle appcast).
 */
const media = window.matchMedia('(prefers-color-scheme: light)');
let theme: string | null = null;
try {
  theme = localStorage.getItem('markasso-theme');
} catch {
  /** Use device appearance when browser storage is unavailable. */
}
function applyTheme(): void {
  const light = theme === 'light' || (theme !== 'dark' && media.matches);
  document.documentElement.dataset.theme = light ? 'light' : 'dark';
}
applyTheme();
media.addEventListener('change', applyTheme);

document.title = t('macPageTitle');
for (const element of document.querySelectorAll<HTMLElement>('[data-i18n]'))
  element.textContent = t(element.dataset.i18n!);
for (const element of document.querySelectorAll<HTMLElement>('[data-i18n-alt]'))
  element.setAttribute('alt', t(element.dataset.i18nAlt!));
// After translation: the title is typed from its translated text.
initSiteFx();

fetch('/download/mac.json')
  .then((response) => (response.ok ? response.json() : null))
  .then((build: { version?: unknown } | null) => {
    const version = document.getElementById('mac-version');
    if (version && typeof build?.version === 'string')
      version.textContent = `${build.version} beta`;
  })
  .catch(() => {
    /* The version is a detail: the download link works without it. */
  });
