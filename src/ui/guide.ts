import manualMarkdown from '../../MANUAL.md?raw';
import { t } from '../i18n';
import { renderMarkdown } from './markdown';

export interface GuideHandle {
  open(): void;
}

export function initGuide(appEl: HTMLElement): GuideHandle {
  let modalEl: HTMLElement | null = null;
  let rendered: ReturnType<typeof renderMarkdown> | null = null;

  function open(): void {
    if (modalEl) return;
    rendered ??= renderMarkdown(manualMarkdown);

    const navItems = rendered.sections
      .map(
        (section) =>
          `<li><a href="#guide-${section.id}" data-guide-nav="${section.id}">${section.title}</a></li>`,
      )
      .join('');

    modalEl = document.createElement('div');
    modalEl.id = 'guide-modal';
    modalEl.innerHTML = `
      <div class="guide-card" role="dialog" aria-modal="true" aria-label="${t('guide')}">
        <div class="guide-header">
          <h2 class="guide-title">${t('guide')}</h2>
          <input
            class="guide-search"
            type="search"
            placeholder="${t('guideSearchPlaceholder')}"
            aria-label="${t('guideSearchPlaceholder')}"
          />
          <button class="guide-close" aria-label="Close">&times;</button>
        </div>
        <div class="guide-body">
          <nav class="guide-nav"><ul>${navItems}</ul></nav>
          <div class="guide-content">${rendered.html}</div>
        </div>
      </div>
    `;

    // The renderer emits bare `id="..."` anchors; prefix them here so they
    // can't collide with unrelated ids elsewhere in the app's DOM.
    modalEl.querySelectorAll('.guide-content [id]').forEach((el) => {
      el.id = `guide-${el.id}`;
    });

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

    const navEl = modalEl.querySelector<HTMLElement>('.guide-nav')!;
    const contentEl = modalEl.querySelector<HTMLElement>('.guide-content')!;
    navEl.addEventListener('click', (e) => {
      const link = (e.target as HTMLElement).closest<HTMLAnchorElement>(
        'a[data-guide-nav]',
      );
      if (!link) return;
      e.preventDefault();
      const target = contentEl.querySelector<HTMLElement>(
        `#guide-${link.dataset.guideNav}`,
      );
      target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    const searchInput =
      modalEl.querySelector<HTMLInputElement>('.guide-search')!;
    searchInput.addEventListener('input', () => {
      const query = searchInput.value.trim().toLowerCase();
      navEl.querySelectorAll<HTMLLIElement>('li').forEach((item) => {
        const matches =
          query.length === 0 || item.textContent!.toLowerCase().includes(query);
        item.hidden = !matches;
      });
    });

    appEl.appendChild(modalEl);
    requestAnimationFrame(() => searchInput.focus());
  }

  return { open };
}
