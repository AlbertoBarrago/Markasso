import { t } from '../i18n';

const STORAGE_KEY = 'markasso-whats-new-version';

/**
 * Release whose highlights are shown. Bump it only when the list below
 * changes, so patch releases don't reopen the same notice.
 */
const WHATS_NEW_ID = '1.16';
const RELEASE_URL =
  'https://github.com/AlbertoBarrago/Markasso/releases/tag/v1.16.0';

const HIGHLIGHTS = [
  ['whatsNewAgentsTitle', 'whatsNewAgents'],
  ['whatsNewAgentLiveTitle', 'whatsNewAgentLive'],
  ['whatsNewTipsTitle', 'whatsNewTips'],
] as const;

/**
 * Shows the release highlights once per WHATS_NEW_ID.
 * @returns true when the notice was shown (the welcome card is then skipped).
 */
export function initWhatsNew(appEl: HTMLElement): boolean {
  if (localStorage.getItem(STORAGE_KEY) === WHATS_NEW_ID) return false;

  const overlay = document.createElement('div');
  overlay.id = 'whats-new-overlay';

  overlay.innerHTML = `
    <div class="wn-card" role="dialog" aria-modal="true" aria-label="${t('whatsNewAria')}" aria-describedby="whats-new-desc">
      <div class="wn-kicker">Markasso ${WHATS_NEW_ID}</div>
      <h2 class="wn-title">${t('whatsNewTitle')}</h2>
      <p class="wn-desc" id="whats-new-desc">${t('whatsNewDesc')}</p>
      <ul class="wn-list">
        ${HIGHLIGHTS.map(([title, text]) => `<li><strong>${t(title)}</strong> ${t(text)}</li>`).join('')}
      </ul>
      <div class="wn-actions">
        <a class="wn-link" href="${RELEASE_URL}" target="_blank" rel="noopener noreferrer">${t('whatsNewDetails')}</a>
        <button class="wn-cta" type="button">${t('startDrawing')}</button>
      </div>
    </div>
  `;

  const dismiss = (): void => {
    localStorage.setItem(STORAGE_KEY, WHATS_NEW_ID);
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
