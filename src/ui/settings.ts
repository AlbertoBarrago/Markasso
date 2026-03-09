import type { History } from '../engine/history';
import type { GridType } from '../core/app_state';

export type ToolbarPosition = 'top' | 'bottom' | 'left' | 'right';

export interface UISettings {
  toolbarPosition: ToolbarPosition;
  accentColor:     string;
}

const STORAGE_KEY = 'markasso-ui-settings';
const DEFAULTS: UISettings = { toolbarPosition: 'top', accentColor: '#7c63d4' };

export function loadSettings(): UISettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...DEFAULTS, ...(JSON.parse(raw) as Partial<UISettings>) };
  } catch { /* ignore */ }
  return { ...DEFAULTS };
}

export function saveSettings(s: UISettings): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
}

export function applySettings(appEl: HTMLElement, s: UISettings): void {
  appEl.dataset['toolbarPos'] = s.toolbarPosition;
  document.documentElement.style.setProperty('--accent', s.accentColor);
  document.documentElement.style.setProperty('--accent-light', hexAlpha(s.accentColor, 0.15));
}

function hexAlpha(hex: string, a: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${a})`;
}

const GRID_TYPES: { type: GridType; label: string; desc: string }[] = [
  { type: 'dot',  label: 'Dots',     desc: 'Dot grid'         },
  { type: 'line', label: 'Lines',    desc: 'Line grid'        },
  { type: 'mm',   label: 'mm',       desc: 'Graph paper (mm)' },
];

const ACCENT_PRESETS = ['#7c63d4', '#4d96ff', '#ff6b6b', '#6bcb77', '#ffd93d', '#ff9f43', '#c77dff'];

export function initSettings(
  appEl: HTMLElement,
  toolbarEl: HTMLElement,
  history: History,
): void {
  let current = loadSettings();
  applySettings(appEl, current);

  // ── Gear button ──────────────────────────────────────────────────────────
  const gearBtn = document.createElement('button');
  gearBtn.className   = 'tb-btn tb-settings-btn';
  gearBtn.title       = 'Settings';
  gearBtn.textContent = '⚙';
  toolbarEl.appendChild(gearBtn);

  // ── Panel ────────────────────────────────────────────────────────────────
  const panel = document.createElement('div');
  panel.className = 'settings-panel';
  panel.setAttribute('aria-hidden', 'true');
  document.body.appendChild(panel);

  panel.innerHTML = `
    <div class="sp-header">
      <span>Settings</span>
      <button class="sp-close">✕</button>
    </div>
    <div class="sp-body">

      <div class="sp-section">
        <div class="sp-label">Toolbar position</div>
        <div class="sp-pos-grid">
          <button class="sp-pos-btn" data-pos="top">Top</button>
          <button class="sp-pos-btn" data-pos="bottom">Bottom</button>
          <button class="sp-pos-btn" data-pos="left">Left</button>
          <button class="sp-pos-btn" data-pos="right">Right</button>
        </div>
      </div>

      <div class="sp-section">
        <div class="sp-label">Grid</div>
        <div class="sp-row">
          <label class="sp-check-label">
            <input type="checkbox" id="sp-grid-visible" />
            Show grid
          </label>
        </div>
        <div class="sp-grid-types">
          ${GRID_TYPES.map((g) =>
            `<button class="sp-grid-btn" data-grid="${g.type}" title="${g.desc}">${g.label}</button>`
          ).join('')}
        </div>
      </div>

      <div class="sp-section">
        <div class="sp-label">Accent color</div>
        <div class="sp-color-row">
          <input type="color" id="sp-accent" />
          <div class="sp-presets">
            ${ACCENT_PRESETS.map((c) =>
              `<button class="sp-preset" data-color="${c}" style="background:${c}" title="${c}"></button>`
            ).join('')}
          </div>
        </div>
      </div>

    </div>
  `;

  // ── Panel logic ──────────────────────────────────────────────────────────
  function open(): void {
    panel.classList.add('open');
    panel.setAttribute('aria-hidden', 'false');
    positionPanel();
    syncPanel();
  }
  function close(): void {
    panel.classList.remove('open');
    panel.setAttribute('aria-hidden', 'true');
  }
  function positionPanel(): void {
    const r   = gearBtn.getBoundingClientRect();
    const pos = current.toolbarPosition;
    panel.style.removeProperty('top');
    panel.style.removeProperty('bottom');
    panel.style.removeProperty('left');
    panel.style.removeProperty('right');
    if (pos === 'top')    { panel.style.top    = `${r.bottom + 6}px`; panel.style.right = `${window.innerWidth - r.right}px`; }
    if (pos === 'bottom') { panel.style.bottom = `${window.innerHeight - r.top + 6}px`; panel.style.right = `${window.innerWidth - r.right}px`; }
    if (pos === 'left')   { panel.style.top    = `${r.top}px`; panel.style.left  = `${r.right + 6}px`; }
    if (pos === 'right')  { panel.style.top    = `${r.top}px`; panel.style.right = `${window.innerWidth - r.left + 6}px`; }
  }
  function syncPanel(): void {
    panel.querySelectorAll<HTMLButtonElement>('.sp-pos-btn').forEach((b) => {
      b.classList.toggle('active', b.dataset['pos'] === current.toolbarPosition);
    });
    const gridVis = panel.querySelector<HTMLInputElement>('#sp-grid-visible')!;
    gridVis.checked = history.present.appState.gridVisible;
    panel.querySelectorAll<HTMLButtonElement>('.sp-grid-btn').forEach((b) => {
      b.classList.toggle('active', b.dataset['grid'] === history.present.appState.gridType);
    });
    const accentInput = panel.querySelector<HTMLInputElement>('#sp-accent')!;
    accentInput.value = current.accentColor;
  }

  gearBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    panel.classList.contains('open') ? close() : open();
  });
  panel.querySelector('.sp-close')!.addEventListener('click', close);
  document.addEventListener('click', (e) => {
    if (!panel.contains(e.target as Node) && e.target !== gearBtn) close();
  });

  // Toolbar position buttons
  panel.querySelectorAll<HTMLButtonElement>('.sp-pos-btn').forEach((b) => {
    b.addEventListener('click', () => {
      current = { ...current, toolbarPosition: b.dataset['pos'] as ToolbarPosition };
      saveSettings(current);
      applySettings(appEl, current);
      syncPanel();
      requestAnimationFrame(positionPanel);
    });
  });

  // Grid visible
  panel.querySelector<HTMLInputElement>('#sp-grid-visible')!.addEventListener('change', (e) => {
    if ((e.target as HTMLInputElement).checked) {
      // If grid was off and we turn it on, make sure gridVisible = true
    }
    history.dispatch({ type: 'TOGGLE_GRID' });
  });

  // Grid type buttons
  panel.querySelectorAll<HTMLButtonElement>('.sp-grid-btn').forEach((b) => {
    b.addEventListener('click', () => {
      history.dispatch({ type: 'SET_GRID_TYPE', gridType: b.dataset['grid'] as GridType });
      // Also ensure grid is visible when changing type
      if (!history.present.appState.gridVisible) {
        history.dispatch({ type: 'TOGGLE_GRID' });
      }
      syncPanel();
    });
  });

  // Accent color
  const accentInput = panel.querySelector<HTMLInputElement>('#sp-accent')!;
  accentInput.addEventListener('input', () => {
    current = { ...current, accentColor: accentInput.value };
    saveSettings(current);
    applySettings(appEl, current);
  });
  panel.querySelectorAll<HTMLButtonElement>('.sp-preset').forEach((b) => {
    b.addEventListener('click', () => {
      const color = b.dataset['color']!;
      accentInput.value = color;
      current = { ...current, accentColor: color };
      saveSettings(current);
      applySettings(appEl, current);
    });
  });

  history.subscribe(syncPanel);
}
