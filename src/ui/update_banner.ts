import { t } from '../i18n';
import { flushSession } from '../io/session';

/** Served next to index.html by the `build-id` plugin in vite.config.ts. */
const VERSION_URL = '/version.json';
/** Background check while the tab stays visible. */
const POLL_INTERVAL_MS = 15 * 60 * 1000;
/** Lower bound between two checks, so quick tab switches do not hammer it. */
const MIN_CHECK_GAP_MS = 60 * 1000;

const INFO_ICON = `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9.5"/><path d="M12 11v5.5"/><circle cx="12" cy="7.75" r="0.6" fill="currentColor"/></svg>`;

/**
 * Whether the deployed build differs from the running one. Any difference
 * counts: build ids are opaque, and a rollback is a new version for the tab
 * as well.
 */
export function hasNewBuild(current: string, remote: string | null): boolean {
  return remote !== null && remote !== '' && remote !== current;
}

/**
 * Reads the deployed build id.
 * @returns the id, or null when the answer is not a usable version file.
 * @throws on network failures, so the caller decides how to report them.
 */
export async function fetchBuildId(
  fetchFn: typeof fetch = fetch,
): Promise<string | null> {
  const res = await fetchFn(VERSION_URL, { cache: 'no-store' });
  if (!res.ok) return null;
  const body: unknown = await res.json();
  if (typeof body !== 'object' || body === null) return null;
  const id = (body as { buildId?: unknown }).buildId;
  return typeof id === 'string' ? id : null;
}

/** Renders the notice; `onDismiss` runs when the user closes it. */
export function showUpdateBanner(onDismiss: () => void): void {
  if (document.querySelector('.update-banner')) return;
  // Same slot as the Mac banner: the reload wins. It is only hidden, not
  // dismissed, so it comes back on the next visit.
  document.querySelector('.mac-banner')?.remove();
  const banner = document.createElement('div');
  banner.className = 'update-banner';
  banner.setAttribute('role', 'status');

  const icon = document.createElement('span');
  icon.className = 'update-banner-icon';
  icon.innerHTML = INFO_ICON;

  const text = document.createElement('span');
  text.className = 'update-banner-text';
  text.textContent = t('updateBanner');

  const reload = document.createElement('button');
  reload.type = 'button';
  reload.className = 'update-banner-reload';
  reload.textContent = t('updateBannerReload');
  reload.addEventListener('click', () => {
    // The autosave is debounced: write the latest edits before leaving.
    flushSession();
    location.reload();
  });

  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'update-banner-close';
  close.setAttribute('aria-label', t('updateBannerDismiss'));
  close.textContent = '×';
  close.addEventListener('click', () => {
    banner.remove();
    onDismiss();
  });

  banner.append(icon, text, reload, close);
  document.body.append(banner);
}

/**
 * Watches for a newer deploy and offers a reload. Checks when the tab comes
 * back into view and every POLL_INTERVAL_MS while it is visible. A dismissed
 * notice comes back only for a build newer than the one dismissed.
 * Disabled in dev, where there is no version file.
 */
export function initUpdateBanner(): void {
  if (import.meta.env.DEV || typeof __BUILD_ID__ === 'undefined') return;
  const current = __BUILD_ID__;
  let dismissed: string | null = null;
  let lastCheck = 0;
  let checking = false;

  const check = async (): Promise<void> => {
    const now = Date.now();
    if (checking || now - lastCheck < MIN_CHECK_GAP_MS) return;
    checking = true;
    lastCheck = now;
    try {
      const remote = await fetchBuildId();
      if (hasNewBuild(current, remote) && remote !== dismissed) {
        showUpdateBanner(() => {
          dismissed = remote;
        });
      }
    } catch (err) {
      // Offline or a flaky network: try again on the next check.
      console.warn('[markasso] update check failed', err);
    } finally {
      checking = false;
    }
  };

  // The first check waits for the poll interval: a fresh load is current.
  lastCheck = Date.now();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void check();
  });
  setInterval(() => {
    if (document.visibilityState === 'visible') void check();
  }, POLL_INTERVAL_MS);
}
