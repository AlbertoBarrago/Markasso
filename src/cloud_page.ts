import './styles/base.css';
import './styles/theme.css';
import './styles/cloud-page.css';
import { checkoutUrl } from './cloud_checkout';
import { POLAR_LINKS } from './config/polar';
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

function link(href: string, label: string, className: string): HTMLAnchorElement {
  const a = document.createElement('a');
  a.className = className;
  a.href = href;
  a.target = '_blank';
  a.rel = 'noopener';
  a.textContent = label;
  return a;
}

const plans = [
  [checkoutUrl(POLAR_LINKS.monthly), 'cloudPageBuyMonthly'],
  [checkoutUrl(POLAR_LINKS.yearly), 'cloudPageBuyYearly'],
] as const;
const buttons = plans.flatMap(([url, label]) =>
  url ? [link(url, t(label), 'checkout-link')] : [],
);
if (buttons.length) document.getElementById('checkout')?.replaceChildren(...buttons);

const portal = checkoutUrl(POLAR_LINKS.portal);
const manage = document.getElementById('manage');
if (portal && manage)
  manage.replaceChildren(link(portal, t('cloudPageManage'), 'manage-link'));

/**
 * Back from a Polar checkout (`?checkout_id=…`): Polar emails the buyer a link
 * to its customer portal, where the licence key lives, so the page only says
 * where to find it and how to use it.
 */
if (new URLSearchParams(location.search).has('checkout_id')) {
  const panel = document.getElementById('welcome');
  if (panel) {
    panel.hidden = false;
    if (portal)
      panel.append(link(portal, t('cloudWelcomePortal'), 'checkout-link'));
  }
}
