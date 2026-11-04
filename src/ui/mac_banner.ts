import { t } from '../i18n';

const DISMISSED_KEY = 'markasso-mac-banner-dismissed';

/**
 * Whether the visitor is on a Mac desktop. iPadOS also reports "Macintosh"
 * in its user agent, so a touch screen rules it out.
 */
export function isMacDesktop(
  nav: Pick<Navigator, 'userAgent' | 'maxTouchPoints'> & {
    userAgentData?: { platform?: string };
  },
): boolean {
  const platform = nav.userAgentData?.platform;
  const mac = platform ? platform === 'macOS' : /Macintosh/.test(nav.userAgent);
  return mac && (nav.maxTouchPoints ?? 0) <= 1;
}

/**
 * A small dismissible "Markasso for Mac is here" banner, shown only on Mac
 * desktops and never again once closed (remembered in localStorage).
 */
export function initMacBanner(): void {
  if (!isMacDesktop(navigator)) return;
  try {
    if (localStorage.getItem(DISMISSED_KEY)) return;
  } catch {
    // Without storage the banner could not stay dismissed: do not show it.
    return;
  }
  const banner = document.createElement('div');
  banner.className = 'mac-banner';
  banner.setAttribute('role', 'note');
  const text = document.createElement('span');
  text.textContent = t('macBanner');
  const link = document.createElement('a');
  link.href = '/mac/';
  link.target = '_blank';
  link.rel = 'noopener';
  link.textContent = t('macBannerLink');
  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'mac-banner-close';
  close.setAttribute('aria-label', t('macBannerDismiss'));
  close.textContent = '×';
  const dismiss = (): void => {
    banner.remove();
    try {
      localStorage.setItem(DISMISSED_KEY, '1');
    } catch {
      /* best effort: it reappears next visit */
    }
  };
  close.addEventListener('click', dismiss);
  link.addEventListener('click', dismiss);
  banner.append(text, link, close);
  document.body.append(banner);
}
