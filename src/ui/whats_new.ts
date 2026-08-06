import pkg from '../../package.json';
import { t } from '../i18n';

const STORAGE_KEY = 'markasso-whats-new-version';

const UPDATE_KEYS = [
  'whatsNewGestureMode',
  'whatsNewAirDrawing',
  'whatsNewGesturePrivacy',
] as const;

export function initWhatsNew(appEl: HTMLElement): boolean {
  const version = pkg.version;
  if (localStorage.getItem(STORAGE_KEY) === version) return false;

  const overlay = document.createElement('div');
  overlay.id = 'whats-new-overlay';

  overlay.innerHTML = `
    <div class="wn-card" role="dialog" aria-modal="true" aria-label="${t('whatsNewAria')}" aria-describedby="whats-new-desc">
      <div class="wn-kicker">Markasso ${version}</div>
      <h2 class="wn-title">${t('whatsNewTitle')}</h2>
      <p class="wn-desc" id="whats-new-desc">
        ${t('whatsNewDesc')}
      </p>
      <ul class="wn-list">
        ${UPDATE_KEYS.map((key) => `<li>${t(key)}</li>`).join('')}
      </ul>
      <div class="wn-actions">
        <a class="wn-link" href="https://github.com/AlbertoBarrago/Markasso" target="_blank" rel="noopener noreferrer">${t('whatsNewDetails')}</a>
        <button class="wn-cta" type="button">${t('startDrawing')}</button>
      </div>
    </div>
  `;

  const dismiss = (): void => {
    localStorage.setItem(STORAGE_KEY, version);
    overlay.classList.add('wn-out');
    overlay.addEventListener('animationend', () => overlay.remove(), {
      once: true,
    });
    document.removeEventListener('keydown', onKey);
  };

  const onKey = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') dismiss();
  };

  const cta = overlay.querySelector<HTMLButtonElement>('.wn-cta')!;
  cta.addEventListener('click', dismiss);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) dismiss();
  });
  document.addEventListener('keydown', onKey);
  appEl.appendChild(overlay);
  cta.focus({ preventScroll: true });

  return true;
}
