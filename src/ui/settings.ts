import type { History } from '../engine/history';
import type { GridType } from '../core/app_state';
import pkg from '../../package.json';

export interface UISettings {
  accentColor: string;
}

const STORAGE_KEY = 'markasso-ui-settings';
const DEFAULTS: UISettings = { accentColor: '#7c63d4' };

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

export function applySettings(_appEl: HTMLElement, s: UISettings): void {
  document.documentElement.style.setProperty('--accent', s.accentColor);
  document.documentElement.style.setProperty('--accent-light', hexAlpha(s.accentColor, 0.18));
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

  // ── Settings button (placed in the top-left island) ───────────────────
  const gearBtn = document.createElement('button');
  gearBtn.className = 'tb-btn';
  gearBtn.title     = 'Settings';
  gearBtn.innerHTML = `<svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
    <line x1="3" y1="5" x2="17" y2="5"/>
    <line x1="3" y1="10" x2="17" y2="10"/>
    <line x1="3" y1="15" x2="17" y2="15"/>
  </svg>`;
  const leftSection = toolbarEl.querySelector<HTMLElement>('.tb-left');
  (leftSection ?? toolbarEl).appendChild(gearBtn);

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
    <div class="sp-footer">
      <span class="sp-version">Markasso v${pkg.version}</span>
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
    const r = gearBtn.getBoundingClientRect();
    panel.style.top  = `${r.bottom + 6}px`;
    panel.style.left = `${r.left}px`;
    panel.style.right = '';
  }
  function syncPanel(): void {
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
