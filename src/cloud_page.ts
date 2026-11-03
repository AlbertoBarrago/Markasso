import './styles/base.css';
import './styles/theme.css';
import './styles/cloud-page.css';
import { checkoutUrl } from './cloud_checkout';
import { t } from './i18n';

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

document.title = t('cloudPageTitle');
for (const element of document.querySelectorAll<HTMLElement>('[data-i18n]')) {
  element.textContent = t(element.dataset.i18n!);
}
const url = checkoutUrl(import.meta.env.VITE_LEMON_CHECKOUT_URL);
if (url) {
  const link = document.createElement('a');
  link.className = 'checkout-link';
  link.href = url;
  link.target = '_blank';
  link.rel = 'noopener';
  link.textContent = t('cloudPageBuy');
  document.getElementById('checkout')?.replaceChildren(link);
}
