import type { History } from '../engine/history';
import { t } from '../i18n';

const isMac = navigator.platform.toUpperCase().includes('MAC');
const mod   = isMac ? '⌘' : 'Ctrl+';

const SHORTCUTS: { icon: string; label: string; key: string }[] = [
  { icon: '📂', label: t('openFile'),  key: `${mod}O` },
  { icon: '💾', label: t('saveFile'),  key: `${mod}S` },
  { icon: '↩',  label: t('undoLabel'), key: `${mod}Z` },
  { icon: '↪',  label: t('redoLabel'), key: isMac ? '⌘⇧Z' : 'Ctrl+Y' },
];

export function initWelcome(appEl: HTMLElement, history: History): void {
  if (history.present.elements.length > 0) return;

  const overlay = document.createElement('div');
  overlay.id = 'welcome-overlay';

  overlay.innerHTML = `
    <div class="wl-card" role="dialog" aria-modal="true" aria-label="${t('welcomeAria')}" aria-describedby="welcome-desc">
      <div class="wl-brand">
        <img width="140" height="140" src="markasso-logo-icon.svg" alt="Markasso logo"/>
        <span class="wl-name">Markasso</span>
      </div>
      <p class="wl-tagline" id="welcome-desc">
        ${t('welcomeTagline').replace('\n', '<br>')}
      </p>
      <ul class="wl-shortcuts">
        ${SHORTCUTS.map(s => `
          <li class="wl-shortcut-row">
            <span class="wl-shortcut-icon">${s.icon}</span>
            <span class="wl-shortcut-label">${s.label}</span>
            <kbd class="wl-kbd">${s.key}</kbd>
          </li>
        `).join('')}
      </ul>
      <button class="wl-cta">${t('startDrawing')}</button>
    </div>
  `;

  const dismiss = (): void => {
    overlay.classList.add('wl-out');
    overlay.addEventListener('animationend', () => overlay.remove(), { once: true });
    unsubscribe();
    document.removeEventListener('keydown', onKey);
  };

  const onKey = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') dismiss();
  };

  overlay.querySelector('.wl-cta')!.addEventListener('click', dismiss);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) dismiss(); });
  document.addEventListener('keydown', onKey);

  // Auto-dismiss as soon as the user draws something
  const unsubscribe = history.subscribe((scene) => {
    if (scene.elements.length > 0) dismiss();
  });

  appEl.appendChild(overlay);
}
