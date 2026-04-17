const STAR_SEEN_KEY = 'markasso-star-hint';

const STAR_ICON = `<svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor">
  <path d="M10 2l2.4 4.9 5.4.8-3.9 3.8.9 5.4L10 14.4l-4.8 2.5.9-5.4L2.2 7.7l5.4-.8z"/>
</svg>`;

const GITHUB_URL = 'https://github.com/AlbertoBarrago/Markasso';

export function initStarCta(appEl: HTMLElement, toolbarEl: HTMLElement): void {
  // ── Toolbar button ──────────────────────────────────────────────────────────
  const starBtn = document.createElement('button');
  starBtn.className = 'tb-btn tb-star-btn';
  starBtn.title = 'Give us a star on GitHub';
  starBtn.setAttribute('aria-label', 'Support Markasso on GitHub');
  starBtn.innerHTML = STAR_ICON;

  // Pulse on first visit
  if (!localStorage.getItem(STAR_SEEN_KEY)) {
    starBtn.classList.add('pulse');
  }

  const leftSection = toolbarEl.querySelector<HTMLElement>('.tb-left');
  (leftSection ?? toolbarEl).appendChild(starBtn);

  // ── Modal ───────────────────────────────────────────────────────────────────
  let modalEl: HTMLElement | null = null;

  function openModal(): void {
    if (modalEl) return;

    localStorage.setItem(STAR_SEEN_KEY, '1');
    starBtn.classList.remove('pulse');

    modalEl = document.createElement('div');
    modalEl.id = 'star-modal';

    modalEl.innerHTML = `
      <div class="star-card" role="dialog" aria-modal="true" aria-label="Support Markasso">
        <button class="star-close" aria-label="Close">&times;</button>
        <div class="star-logo">
          <svg width="40" height="40" viewBox="0 0 20 20" fill="currentColor">
            <path d="M10 2l2.4 4.9 5.4.8-3.9 3.8.9 5.4L10 14.4l-4.8 2.5.9-5.4L2.2 7.7l5.4-.8z"/>
          </svg>
        </div>
        <h2 class="star-title">Love Markasso?</h2>
        <p class="star-desc">
          Markasso is a free, open-source whiteboard built with vanilla TypeScript
          and zero external dependencies. No login. No tracking. Just drawing.
        </p>
        <p class="star-thanks">
          Made by <strong>albz</strong>, with style courtesy of <strong>Lorenzo Cataldi</strong>
          and the legendary <strong>Claude Code</strong> keeping the neurons from exploding.
          If it's useful to you, a star on GitHub means the world to us.
        </p>
        <div class="star-actions">
          <a class="star-cta-btn" href="${GITHUB_URL}" target="_blank" rel="noopener noreferrer">
            <svg width="18" height="18" viewBox="0 0 20 20" fill="currentColor" style="flex-shrink:0">
              <path d="M10 2l2.4 4.9 5.4.8-3.9 3.8.9 5.4L10 14.4l-4.8 2.5.9-5.4L2.2 7.7l5.4-.8z"/>
            </svg>
            Star on GitHub
          </a>
          <a class="star-coffee-btn" href="https://buymeacoffee.com/albz" target="_blank" rel="noopener noreferrer">
            <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0">
              <path d="M6 2v3M10 2v3M14 2v3M4 7h12l-1.5 9a2 2 0 01-2 1.5h-5a2 2 0 01-2-1.5zM16 9h2a2 2 0 010 4h-2"/>
            </svg>
            Buy me a coffee
          </a>
        </div>
        <p class="star-sub">It takes 2 seconds and helps us grow.</p>
      </div>
    `;

    const dismiss = (): void => {
      if (!modalEl) return;
      modalEl.classList.add('star-out');
      modalEl.addEventListener('animationend', () => {
        modalEl?.remove();
        modalEl = null;
      }, { once: true });
      document.removeEventListener('keydown', onKey);
    };

    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') { e.preventDefault(); dismiss(); }
    };

    modalEl.querySelector<HTMLButtonElement>('.star-close')!.addEventListener('click', dismiss);
    modalEl.addEventListener('click', (e) => { if (e.target === modalEl) dismiss(); });
    document.addEventListener('keydown', onKey);

    appEl.appendChild(modalEl);
  }

  starBtn.addEventListener('click', openModal);
}
