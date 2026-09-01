import manualMarkdown from '../../MANUAL.md?raw';
import { t } from '../i18n';
import { renderMarkdown } from './markdown';

export interface GuideHandle {
  open(): void;
}

export function initGuide(appEl: HTMLElement): GuideHandle {
  let modalEl: HTMLElement | null = null;
  let contentHtml: string | null = null;

  function open(): void {
    if (modalEl) return;
    contentHtml ??= renderMarkdown(manualMarkdown);

    modalEl = document.createElement('div');
    modalEl.id = 'guide-modal';
    modalEl.innerHTML = `
      <div class="guide-card" role="dialog" aria-modal="true" aria-label="${t('guide')}">
        <button class="guide-close" aria-label="Close">&times;</button>
        <div class="guide-content">${contentHtml}</div>
      </div>
    `;

    const close = (): void => {
      if (!modalEl) return;
      const el = modalEl;
      el.classList.add('guide-out');
      el.addEventListener('animationend', () => el.remove(), { once: true });
      modalEl = null;
      document.removeEventListener('keydown', onKey);
    };

    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.preventDefault();
        close();
      }
    };

    modalEl
      .querySelector<HTMLButtonElement>('.guide-close')!
      .addEventListener('click', close);
    modalEl.addEventListener('click', (e) => {
      if (e.target === modalEl) close();
    });
    document.addEventListener('keydown', onKey);

    appEl.appendChild(modalEl);
  }

  return { open };
}
