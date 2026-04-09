const isMac = navigator.platform.toUpperCase().includes('MAC');
const mod   = isMac ? '⌘' : 'Ctrl+';

type ShortcutEntry = { label: string; key: string };
type ShortcutSection = { title: string; items: ShortcutEntry[] };

const SECTIONS: ShortcutSection[] = [
  {
    title: 'Tools',
    items: [
      { label: 'Hand',      key: 'H / Space' },
      { label: 'Select',    key: 'V / 1' },
      { label: 'Rectangle', key: 'R / 2' },
      { label: 'Ellipse',   key: 'E / 3' },
      { label: 'Rhombus',   key: 'D / 4' },
      { label: 'Arrow',     key: 'A / 5' },
      { label: 'Line',      key: 'L / 6' },
      { label: 'Pen',       key: 'P / 7' },
      { label: 'Text',      key: 'T / 8' },
      { label: 'Eraser',    key: '0' },
    ],
  },
  {
    title: 'Edit',
    items: [
      { label: 'Undo',      key: `${mod}Z` },
      { label: 'Redo',      key: isMac ? '⌘⇧Z' : 'Ctrl+Y' },
      { label: 'Select all',key: `${mod}A` },
      { label: 'Duplicate', key: `${mod}D` },
      { label: 'Copy',      key: `${mod}C` },
      { label: 'Paste',     key: `${mod}V` },
      { label: 'Delete',    key: 'Del / ⌫' },
    ],
  },
  {
    title: 'Organize',
    items: [
      { label: 'Bring to front', key: `${mod}⇧]` },
      { label: 'Send to back',   key: `${mod}⇧[` },
      { label: 'Group',          key: `${mod}G` },
      { label: 'Ungroup',        key: `${mod}⇧G` },
    ],
  },
  {
    title: 'View',
    items: [
      { label: 'Toggle grid',   key: 'G' },
      { label: 'Fit to content',key: 'F' },
      { label: 'Reset zoom',    key: 'Shift+0' },
      { label: 'Hide UI',       key: '\\' },
    ],
  },
  {
    title: 'Navigation',
    items: [
      { label: 'Cancel / Deselect', key: 'Esc' },
      { label: 'Keyboard shortcuts', key: '?' },
    ],
  },
];

function buildModal(): HTMLElement {
  const overlay = document.createElement('div');
  overlay.id = 'shortcuts-help';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', 'Keyboard shortcuts');

  const sectionsHtml = SECTIONS.map(section => `
    <div class="sh-section">
      <h3 class="sh-section-title">${section.title}</h3>
      <ul class="sh-list">
        ${section.items.map(item => `
          <li class="sh-row">
            <span class="sh-label">${item.label}</span>
            <kbd class="sh-kbd">${item.key}</kbd>
          </li>
        `).join('')}
      </ul>
    </div>
  `).join('');

  overlay.innerHTML = `
    <div class="sh-card">
      <div class="sh-header">
        <span class="sh-title">Keyboard shortcuts</span>
        <button class="sh-close" aria-label="Close">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
            <line x1="1" y1="1" x2="13" y2="13"/><line x1="13" y1="1" x2="1" y2="13"/>
          </svg>
        </button>
      </div>
      <div class="sh-body">
        ${sectionsHtml}
      </div>
    </div>
  `;

  return overlay;
}

let overlayEl: HTMLElement | null = null;

function open(appEl: HTMLElement): void {
  if (overlayEl) return;
  overlayEl = buildModal();

  const dismiss = (): void => {
    if (!overlayEl) return;
    overlayEl.classList.add('sh-out');
    overlayEl.addEventListener('animationend', () => {
      overlayEl?.remove();
      overlayEl = null;
    }, { once: true });
    document.removeEventListener('keydown', onKey);
  };

  const onKey = (e: KeyboardEvent): void => {
    if (e.key === 'Escape' || e.key === '?') {
      e.preventDefault();
      dismiss();
    }
  };

  overlayEl.querySelector('.sh-close')!.addEventListener('click', dismiss);
  overlayEl.addEventListener('click', (e) => { if (e.target === overlayEl) dismiss(); });
  document.addEventListener('keydown', onKey);

  appEl.appendChild(overlayEl);
}

export function isShortcutsHelpOpen(): boolean {
  return overlayEl !== null;
}

function showCanvasHint(appEl: HTMLElement): void {
  const hint = document.createElement('div');
  hint.id = 'shortcuts-hint';
  hint.innerHTML = `Press <kbd>?</kbd> to see all keyboard shortcuts`;
  appEl.appendChild(hint);

  // Fade in on next frame so the CSS transition fires
  requestAnimationFrame(() => hint.classList.add('sh-hint-visible'));

  const hide = (): void => {
    hint.classList.remove('sh-hint-visible');
    hint.addEventListener('transitionend', () => hint.remove(), { once: true });
    clearTimeout(timer);
  };

  // Auto-hide after 5s or on first pointer interaction
  const timer = setTimeout(hide, 5000);
  window.addEventListener('pointerdown', hide, { once: true });
}

export function initShortcutsHelp(appEl: HTMLElement): void {
  showCanvasHint(appEl);

  window.addEventListener('keydown', (e) => {
    if (e.key === '?' && !e.ctrlKey && !e.metaKey) {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;
      e.preventDefault();
      if (overlayEl) return; // already open, let the inner handler close it
      open(appEl);
    }
  });
}
