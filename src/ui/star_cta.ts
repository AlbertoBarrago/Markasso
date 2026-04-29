const COFFEE_ICON = `<svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
  <path d="M6 2v3M10 2v3M14 2v3M4 7h12l-1.5 9a2 2 0 01-2 1.5h-5a2 2 0 01-2-1.5zM16 9h2a2 2 0 010 4h-2"/>
</svg>`;

export function initStarCta(appEl: HTMLElement, toolbarEl: HTMLElement): void {
  // ── Toolbar button ──────────────────────────────────────────────────────────
  const coffeeBtn = document.createElement('button');
  coffeeBtn.className = 'tb-btn tb-coffee-btn';
  coffeeBtn.title = 'Buy me a coffee';
  coffeeBtn.setAttribute('aria-label', 'Support Markasso with a coffee');
  coffeeBtn.innerHTML = COFFEE_ICON;

  const leftSection = toolbarEl.querySelector<HTMLElement>('.tb-left');
  (leftSection ?? toolbarEl).appendChild(coffeeBtn);

  function triggerPulse(): void {
    coffeeBtn.classList.remove('pulse');
    void coffeeBtn.offsetWidth;
    coffeeBtn.classList.add('pulse');
  }

  triggerPulse();
  let pulseCount = 1;
  const pulseTimer = setInterval(() => {
    triggerPulse();
    if (++pulseCount >= 2) clearInterval(pulseTimer);
  }, 7000);

  // ── Modal ───────────────────────────────────────────────────────────────────
  let modalEl: HTMLElement | null = null;

  function openModal(): void {
    if (modalEl) return;

    modalEl = document.createElement('div');
    modalEl.id = 'star-modal';

    modalEl.innerHTML = `
      <div class="star-card" role="dialog" aria-modal="true" aria-label="Support Markasso">
        <button class="star-close" aria-label="Close">&times;</button>
        <div class="star-logo">
          <img src="markasso-logo-icon.svg" width="40" height="40" alt="Markasso" style="border-radius:6px">
        </div>
        <h2 class="star-title">Love Markasso?</h2>
        <p class="star-desc">
          Markasso is a free, open-source whiteboard built with vanilla TypeScript
          and zero external dependencies. No login. No tracking. Just drawing.
        </p>
        <p class="star-thanks">
          Made by <strong>albz</strong>. Heartfelt thanks to <strong>Lorenzo Cataldi</strong>
          for the style, and to <strong>Claude Code</strong> for its unbearable absence of fatigue.
        </p>
        <div class="star-actions">
          <a class="star-coffee-btn" href="https://buymeacoffee.com/albz" target="_blank" rel="noopener noreferrer">
            <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0">
              <path d="M6 2v3M10 2v3M14 2v3M4 7h12l-1.5 9a2 2 0 01-2 1.5h-5a2 2 0 01-2-1.5zM16 9h2a2 2 0 010 4h-2"/>
            </svg>
            Buy me a coffee
          </a>
        </div>
      </div>
    `;

    const dismiss = (): void => {
      if (!modalEl) return;
      modalEl.classList.add('star-out');
      modalEl.addEventListener(
        'animationend',
        () => {
          modalEl?.remove();
          modalEl = null;
        },
        { once: true },
      );
      document.removeEventListener('keydown', onKey);
    };

    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.preventDefault();
        dismiss();
      }
    };

    modalEl
      .querySelector<HTMLButtonElement>('.star-close')!
      .addEventListener('click', dismiss);
    modalEl.addEventListener('click', (e) => {
      if (e.target === modalEl) dismiss();
    });
    document.addEventListener('keydown', onKey);

    appEl.appendChild(modalEl);
  }

  coffeeBtn.addEventListener('click', openModal);
}
