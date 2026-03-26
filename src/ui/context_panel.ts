import type { History } from '../engine/history';
import type { Element } from '../elements/element';
import { t } from '../i18n';
import { isFocusInPanel } from './keyboard_utils';

const STROKE_PRESETS = ['#000000', '#e2e2ef', '#ff6b6b', '#6bcb77', '#4d96ff', '#c77dff', '#ffffff'];
const FILL_PRESETS = ['transparent', '#ff6b6b', '#6bcb77', '#4d96ff', '#c77dff', '#ffffff'];

// 15-color palette for the custom color popup (5 × 3 grid)
// First slot is transparent — picking it resets the custom color slot back to "+"
const POPUP_COLORS = [
  'transparent', '#000000', '#e2e2ef', '#f5f5f5', '#ffffff',
  '#4d96ff', '#748ffc', '#c77dff', '#f783ac', '#ff6b6b',
  '#6bcb77', '#a9e34b', '#ffd43b', '#ff922b', '#f03e3e',
];

const CUSTOM_COLORS_KEY = 'markasso-custom-colors';

function loadCustomColor(kind: 'stroke' | 'fill'): string | null {
  try {
    const raw = localStorage.getItem(CUSTOM_COLORS_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return null;
    const val = (parsed as Record<string, unknown>)[kind];
    return typeof val === 'string' ? val : null;
  } catch {
    return null;
  }
}

function saveCustomColor(kind: 'stroke' | 'fill', color: string | null): void {
  let data: Record<string, string | null> = {};
  try {
    const raw = localStorage.getItem(CUSTOM_COLORS_KEY);
    if (raw) {
      const parsed: unknown = JSON.parse(raw);
      if (typeof parsed === 'object' && parsed !== null) {
        data = parsed as Record<string, string | null>;
      }
    }
  } catch { /* ignore */ }
  data[kind] = color;
  localStorage.setItem(CUSTOM_COLORS_KEY, JSON.stringify(data));
}

function hexToHsl(hex: string): [number, number, number] {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l * 100];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return [h * 360, s * 100, l * 100];
}

function hslToHex(h: number, s: number, l: number): string {
  h /= 360; s /= 100; l /= 100;
  const hue2rgb = (p: number, q: number, t: number): number => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  let r, g, b;
  if (s === 0) {
    r = g = b = l;
  } else {
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1 / 3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1 / 3);
  }
  return '#' + [r, g, b].map((x) => Math.round(x * 255).toString(16).padStart(2, '0')).join('');
}

function computeShades(hex: string): string[] {
  if (!hex || !hex.startsWith('#') || hex.length !== 7) return [];
  try {
    const [h, s] = hexToHsl(hex);
    return [20, 35, 50, 65, 80].map((l) => hslToHex(h, s, l));
  } catch {
    return [];
  }
}

export function initContextPanel(workspace: HTMLElement, history: History): void {
  const panel = document.createElement('div');
  panel.id = 'context-panel';
  panel.setAttribute('role', 'region');
  panel.setAttribute('aria-label', 'Context panel');
  workspace.appendChild(panel);

  panel.innerHTML = `
    <div class="cp-section">
      <div class="cp-label">${t('stroke')}</div>
      <div class="cp-color-row" role="group" aria-label="${t('stroke')}">
        <div class="cp-color-swatches" id="cp-stroke-swatches"></div>
        <button class="cp-color-more" id="cp-stroke-more" title="${t('moreColors')}">+</button>
      </div>
    </div>

    <div class="cp-section">
      <div class="cp-label">${t('fill')}</div>
      <div class="cp-color-row" role="group" aria-label="${t('fill')}">
        <div class="cp-color-swatches" id="cp-fill-swatches"></div>
        <button class="cp-color-more" id="cp-fill-more" title="${t('moreColors')}">+</button>
      </div>
    </div>

    <div class="cp-section">
      <div class="cp-label">${t('strokeWidth')}</div>
      <div class="cp-btn-row" id="cp-width-presets" role="group" aria-label="${t('strokeWidth')}"></div>
    </div>

    <div class="cp-section">
      <div class="cp-label">${t('strokeStyle')}</div>
      <div class="cp-btn-row" id="cp-style-presets" role="group" aria-label="${t('strokeStyle')}"></div>
    </div>

    <div class="cp-section">
      <div class="cp-label">${t('roughness')}</div>
      <div class="cp-btn-row" id="cp-roughness-presets" role="group" aria-label="${t('roughness')}"></div>
    </div>

    <div class="cp-section">
      <div class="cp-label">${t('corners')}</div>
      <div class="cp-btn-row" id="cp-border-presets" role="group" aria-label="${t('corners')}"></div>
    </div>

    <div class="cp-section" id="cp-text-props">
      <div class="cp-label">${t('mode')}</div>
      <div class="cp-btn-row" id="cp-textmode-presets" role="group" aria-label="${t('mode')}"></div>
      <div class="cp-label" style="margin-top:4px">${t('fontSize')}</div>
      <div class="cp-font-size-row">
        <input type="number" id="cp-font-size" min="6" max="400" step="1" class="cp-font-size-input" />
      </div>
      <div class="cp-label" style="margin-top:4px">${t('fontFamily')}</div>
      <div class="cp-btn-row" id="cp-font-family-presets" role="group" aria-label="${t('fontFamily')}"></div>
      <div class="cp-label" style="margin-top:4px">${t('alignment')}</div>
      <div class="cp-btn-row" id="cp-align-presets" role="group" aria-label="${t('alignment')}"></div>
    </div>

    <div class="cp-section">
      <div class="cp-label">${t('opacity')}</div>
      <div class="cp-slider-row">
        <input type="range" min="0" max="100" step="1" class="cp-slider" id="cp-opacity" />
      </div>
      <div class="cp-slider-labels">
        <span>0</span>
        <span class="cp-slider-val" id="cp-opacity-val">100</span>
        <span>100</span>
      </div>
    </div>

    <div class="cp-section">
      <div class="cp-label">${t('layers')}</div>
      <div class="cp-btn-row" id="cp-layer-actions" role="group" aria-label="${t('layers')}"></div>
    </div>

    <div class="cp-section">
      <div class="cp-label">${t('actions')}</div>
      <div class="cp-btn-row" id="cp-actions" role="group" aria-label="${t('actions')}"></div>
    </div>
  `;

  // ── Custom color state (one slot per row, persisted) ──────────────────────
  let customStroke: string | null = loadCustomColor('stroke');
  let customFill: string | null = loadCustomColor('fill');

  // ── Color picker popup ─────────────────────────────────────────────────────
  const popup = document.createElement('div');
  popup.className = 'cp-color-popup';
  popup.setAttribute('role', 'dialog');
  popup.setAttribute('aria-label', t('moreColors'));
  popup.style.display = 'none';
  document.body.appendChild(popup);

  const shadesContainer = document.createElement('div');
  shadesContainer.className = 'cp-popup-shades';

  popup.innerHTML = `
    <div class="cp-popup-section">
      <div class="cp-popup-label">${t('color')}</div>
      <div class="cp-popup-grid" id="cp-popup-grid"></div>
    </div>
    <div class="cp-popup-section" id="cp-popup-shades-section">
      <div class="cp-popup-label">${t('shades')}</div>
    </div>
    <div class="cp-popup-section cp-popup-hex-section">
      <div class="cp-popup-label">${t('hexCode')}</div>
      <div class="cp-popup-hex-row">
        <span class="cp-popup-hex-hash">#</span>
        <input class="cp-popup-hex-input" id="cp-popup-hex" maxlength="6" spellcheck="false" />
      </div>
    </div>
  `;

  // Append shades container inside the shades section
  popup.querySelector('#cp-popup-shades-section')!.appendChild(shadesContainer);

  // Populate preset grid
  const popupGrid = popup.querySelector<HTMLElement>('#cp-popup-grid')!;
  for (const color of POPUP_COLORS) {
    const btn = document.createElement('button');
    btn.className = 'cp-popup-swatch';
    if (color === 'transparent') {
      btn.classList.add('cp-popup-swatch-transparent');
    } else {
      btn.style.background = color;
    }
    btn.title = color === 'transparent' ? t('transparent') : color;
    btn.dataset['color'] = color;
    btn.addEventListener('click', () => {
      pickColor(color);
    });
    popupGrid.appendChild(btn);
  }

  const hexInput = popup.querySelector<HTMLInputElement>('#cp-popup-hex')!;
  hexInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const hex = '#' + hexInput.value.replace(/[^0-9a-fA-F]/g, '');
      if (hex.length === 7) pickColor(hex);
    }
    if (e.key === 'Escape') closePopup();
  });
  hexInput.addEventListener('input', () => {
    const clean = hexInput.value.replace(/[^0-9a-fA-F]/g, '');
    hexInput.value = clean;
    if (clean.length === 6) {
      const hex = '#' + clean;
      updateShades(hex);
      currentPickerCallback?.({ preview: hex });
    }
  });

  let currentPickerCallback: ((result: { pick?: string; preview?: string }) => void) | null = null;

  function updateShades(baseColor: string): void {
    shadesContainer.innerHTML = '';
    const shades = computeShades(baseColor);
    shades.forEach((shade, i) => {
      const btn = document.createElement('button');
      btn.className = 'cp-popup-swatch cp-popup-shade';
      btn.style.background = shade;
      btn.title = shade;
      btn.innerHTML = '';
      btn.addEventListener('click', () => pickColor(shade));
      shadesContainer.appendChild(btn);
    });
    (popup.querySelector('#cp-popup-shades-section') as HTMLElement).style.display = shades.length ? '' : 'none';
  }

  function pickColor(color: string): void {
    currentPickerCallback?.({ pick: color });
    closePopup();
  }

  function openPopup(
    anchor: HTMLElement,
    currentColor: string,
    onResult: (result: { pick?: string; preview?: string }) => void,
  ): void {
    currentPickerCallback = onResult;

    // Highlight active preset
    popup.querySelectorAll<HTMLButtonElement>('.cp-popup-swatch').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset['color'] === currentColor.toLowerCase());
    });

    // Shades based on current color
    const base = currentColor.startsWith('#') ? currentColor : '#808080';
    updateShades(base);

    // Hex input
    hexInput.value = currentColor.startsWith('#') ? currentColor.slice(1) : '';

    // Position to the right of the context panel, aligned with its top
    popup.style.display = 'block';
    requestAnimationFrame(() => {
      const panelRect = panel.getBoundingClientRect();
      const pw = popup.offsetWidth;
      const ph = popup.offsetHeight;
      let left = panelRect.right + 8;
      if (left + pw > window.innerWidth - 8) left = panelRect.left - pw - 8;
      if (left < 8) left = 8;
      let top = panelRect.top;
      if (top + ph > window.innerHeight - 8) top = window.innerHeight - ph - 8;
      if (top < 8) top = 8;
      popup.style.left = left + 'px';
      popup.style.top = top + 'px';
      hexInput.focus();
    });
  }

  function closePopup(): void {
    popup.style.display = 'none';
    currentPickerCallback = null;
  }

  // Close popup on outside click
  document.addEventListener('pointerdown', (e) => {
    if (popup.style.display !== 'none' && !popup.contains(e.target as Node)) {
      closePopup();
    }
  }, true);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && popup.style.display !== 'none') closePopup();

  });

  // ── Updates the "+" button appearance when a custom color is set ──────────
  function updateMoreBtn(btn: HTMLButtonElement, color: string | null): void {
    if (color) {
      btn.style.background = color;
      btn.style.border = '2px solid rgba(255,255,255,0.15)';
      btn.textContent = '';
      btn.title = color;
      btn.classList.add('cp-color-more-filled');
    } else {
      btn.style.background = '';
      btn.style.border = '';
      btn.textContent = '+';
      btn.title = t('moreColors');
      btn.classList.remove('cp-color-more-filled');
    }
  }

  // ── Stroke swatches ────────────────────────────────────────────────────────
  const strokeSwatches = panel.querySelector('#cp-stroke-swatches')!;
  for (const color of STROKE_PRESETS) {
    const sw = document.createElement('button');
    sw.className = 'cp-color-swatch';
    sw.style.background = color;
    sw.title = color;
    sw.setAttribute('aria-label', color);
    sw.setAttribute('aria-pressed', 'false');
    sw.addEventListener('click', () => {
      history.dispatch({ type: 'APPLY_STYLE', strokeColor: color });
    });
    strokeSwatches.appendChild(sw);
  }

  const strokeMore = panel.querySelector<HTMLButtonElement>('#cp-stroke-more')!;
  updateMoreBtn(strokeMore, customStroke);
  strokeMore.addEventListener('click', () => {
    const currentColor = customStroke ?? history.present.appState.strokeColor ?? STROKE_PRESETS[0] ?? '#000000';
    openPopup(strokeMore, currentColor, ({ pick, preview }) => {
      if (preview) {
        history.dispatch({ type: 'APPLY_STYLE', strokeColor: preview });
      }
      if (pick) {
        if (pick === 'transparent') {
          customStroke = null;
          saveCustomColor('stroke', null);
          updateMoreBtn(strokeMore, null);
        } else {
          customStroke = pick;
          saveCustomColor('stroke', pick);
          updateMoreBtn(strokeMore, pick);
          history.dispatch({ type: 'APPLY_STYLE', strokeColor: pick });
        }
      }
    });
  });

  // ── Fill swatches ──────────────────────────────────────────────────────────
  const fillSwatches = panel.querySelector('#cp-fill-swatches')!;
  for (const color of FILL_PRESETS) {
    const sw = document.createElement('button');
    sw.className = 'cp-color-swatch';
    const swLabel = color === 'transparent' ? t('transparent') : color;
    sw.title = swLabel;
    sw.setAttribute('aria-label', swLabel);
    sw.setAttribute('aria-pressed', 'false');
    if (color === 'transparent') {
      sw.classList.add('cp-color-swatch-transparent');
    } else {
      sw.style.background = color;
    }
    sw.addEventListener('click', () => {
      history.dispatch({ type: 'APPLY_STYLE', fillColor: color });
    });
    fillSwatches.appendChild(sw);
  }

  const fillMore = panel.querySelector<HTMLButtonElement>('#cp-fill-more')!;
  updateMoreBtn(fillMore, customFill);
  fillMore.addEventListener('click', () => {
    const currentColor = customFill ?? history.present.appState.fillColor ?? FILL_PRESETS[1] ?? '#ffffff';
    const base = currentColor === 'transparent' ? '#ffffff' : currentColor;
    openPopup(fillMore, base, ({ pick, preview }) => {
      if (preview) {
        history.dispatch({ type: 'APPLY_STYLE', fillColor: preview });
      }
      if (pick) {
        if (pick === 'transparent') {
          customFill = null;
          saveCustomColor('fill', null);
          updateMoreBtn(fillMore, null);
        } else {
          customFill = pick;
          saveCustomColor('fill', pick);
          updateMoreBtn(fillMore, pick);
          history.dispatch({ type: 'APPLY_STYLE', fillColor: pick });
        }
      }
    });
  });

  // ── Width presets ──────────────────────────────────────────────────────────
  const widthPresets = panel.querySelector('#cp-width-presets')!;
  const WIDTHS = [
    { value: 1, label: t('thin') },
    { value: 3, label: t('medium') },
    { value: 8, label: t('thick') },
  ];
  for (const w of WIDTHS) {
    const btn = document.createElement('button');
    btn.className = 'cp-btn cp-width-btn';
    btn.title = w.label;
    btn.dataset['value'] = String(w.value);
    btn.addEventListener('click', () => {
      history.dispatch({ type: 'APPLY_STYLE', strokeWidth: w.value });
    });
    widthPresets.appendChild(btn);
  }
  const widthInput = document.createElement('input');
  widthInput.type = 'number';
  widthInput.min = '1';
  widthInput.max = '100';
  widthInput.step = '1';
  widthInput.className = 'cp-font-size-input';
  widthInput.style.width = '52px';
  let widthDisplay: HTMLDivElement | null = null;
  if (widthInput.type !== 'number') {
    widthDisplay = document.createElement('div');
    widthDisplay.setAttribute('aria-live', 'polite');
    widthDisplay.className = 'cp-width-display';
    widthPresets.appendChild(widthDisplay);
  } else {
    widthInput.addEventListener('change', () => {
      const v = Math.max(1, Math.min(100, Math.round(Number(widthInput.value))));
      widthInput.value = String(v);
      history.dispatch({ type: 'APPLY_STYLE', strokeWidth: v });
    });
    widthPresets.appendChild(widthInput);
  }

  // ── Style presets ──────────────────────────────────────────────────────────
  const stylePresets = panel.querySelector('#cp-style-presets')!;
  const STYLES = [
    { value: 'solid', label: t('solid') },
    { value: 'dashed', label: t('dashed') },
    { value: 'dotted', label: t('dotted') },
  ];
  for (const s of STYLES) {
    const btn = document.createElement('button');
    btn.className = 'cp-btn cp-style-btn';
    btn.title = s.label;
    btn.dataset['style'] = s.value;
    btn.addEventListener('click', () => {
      history.dispatch({ type: 'APPLY_STYLE', strokeStyle: s.value as 'solid' | 'dashed' | 'dotted' });
    });
    stylePresets.appendChild(btn);
  }

  // ── Roughness presets ──────────────────────────────────────────────────────
  const roughnessPresets = panel.querySelector('#cp-roughness-presets')!;
  const ROUGHNESS = [
    { value: 0, label: t('smooth') },
    { value: 0.5, label: t('medium') },
    { value: 1, label: t('rough') },
  ];
  for (const r of ROUGHNESS) {
    const btn = document.createElement('button');
    btn.className = 'cp-btn cp-roughness-btn';
    btn.title = r.label;
    btn.dataset['roughness'] = String(r.value);
    btn.addEventListener('click', () => {
      history.dispatch({ type: 'APPLY_STYLE', roughness: r.value });
    });
    roughnessPresets.appendChild(btn);
  }

  // ── Border presets ─────────────────────────────────────────────────────────
  const borderPresets = panel.querySelector('#cp-border-presets')!;
  const BORDERS = [
    { value: 'sharp', label: t('sharp') },
    { value: 'rounded', label: t('rounded') },
  ];
  for (const b of BORDERS) {
    const btn = document.createElement('button');
    btn.className = 'cp-btn cp-border-btn';
    btn.title = b.label;
    btn.dataset['border'] = b.value;
    btn.addEventListener('click', () => {
      history.dispatch({ type: 'APPLY_STYLE', cornerRadius: b.value === 'rounded' ? 8 : 0 });
    });
    borderPresets.appendChild(btn);
  }

  // ── Font size input ────────────────────────────────────────────────────────
  const fontSizeInput = panel.querySelector<HTMLInputElement>('#cp-font-size')!;
  fontSizeInput.addEventListener('focus', () => fontSizeInput.select());
  fontSizeInput.addEventListener('change', () => {
    const size = parseInt(fontSizeInput.value, 10);
    if (!isNaN(size) && size >= 6 && size <= 400) {
      history.dispatch({ type: 'SET_FONT_SIZE', size });
    }
  });
  fontSizeInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') fontSizeInput.blur();
  });

  // ── Font family presets ────────────────────────────────────────────────────
  const fontFamilyPresets = panel.querySelector('#cp-font-family-presets')!;
  const FONT_FAMILIES = [
    { label: 'Aa', family: 'Arial, sans-serif',         title: 'Arial' },
    { label: 'Ss', family: 'Georgia, serif',            title: 'Georgia' },
    { label: 'M_', family: '"Courier New", monospace',  title: 'Monospace' },
    { label: 'Ff', family: '"Comic Sans MS", cursive',  title: 'Comic Sans' },
  ];
  for (const f of FONT_FAMILIES) {
    const btn = document.createElement('button');
    btn.className = 'cp-btn cp-font-family-btn';
    btn.title = f.title;
    btn.textContent = f.label;
    btn.style.fontFamily = f.family;
    btn.dataset['family'] = f.family;
    btn.addEventListener('click', () => {
      history.dispatch({ type: 'SET_FONT_FAMILY', family: f.family });
    });
    fontFamilyPresets.appendChild(btn);
  }

  // ── Text mode toggle ───────────────────────────────────────────────────────
  const textModePresets = panel.querySelector('#cp-textmode-presets')!;
  const TEXT_MODES: { value: 'text' | 'code'; label: string; icon: string }[] = [
    { value: 'text', label: t('text'), icon: `<svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor"><path d="M3 4h14v2.5H12v9.5H8V6.5H3z"/></svg>` },
    { value: 'code', label: t('code'), icon: `<svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M7 6L3 10l4 4"/><path d="M13 6l4 4-4 4"/></svg>` },
  ];
  for (const m of TEXT_MODES) {
    const btn = document.createElement('button');
    btn.className = 'cp-btn';
    btn.title = m.label;
    btn.innerHTML = m.icon;
    btn.dataset['mode'] = m.value;
    btn.addEventListener('click', () => {
      history.dispatch({ type: 'SET_TEXT_MODE', mode: m.value });
    });
    textModePresets.appendChild(btn);
  }

  // ── Align presets ──────────────────────────────────────────────────────────
  const alignPresets = panel.querySelector('#cp-align-presets')!;
  const ALIGNS: { value: 'left' | 'center' | 'right'; label: string; icon: string }[] = [
    { value: 'left',   label: t('left'),   icon: `<svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><line x1="3" y1="5" x2="17" y2="5"/><line x1="3" y1="9" x2="13" y2="9"/><line x1="3" y1="13" x2="17" y2="13"/><line x1="3" y1="17" x2="11" y2="17"/></svg>` },
    { value: 'center', label: t('center'), icon: `<svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><line x1="3" y1="5" x2="17" y2="5"/><line x1="5" y1="9" x2="15" y2="9"/><line x1="3" y1="13" x2="17" y2="13"/><line x1="6" y1="17" x2="14" y2="17"/></svg>` },
    { value: 'right',  label: t('right'),  icon: `<svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><line x1="3" y1="5" x2="17" y2="5"/><line x1="7" y1="9" x2="17" y2="9"/><line x1="3" y1="13" x2="17" y2="13"/><line x1="9" y1="17" x2="17" y2="17"/></svg>` },
  ];
  for (const a of ALIGNS) {
    const btn = document.createElement('button');
    btn.className = 'cp-btn cp-align-btn';
    btn.title = a.label;
    btn.innerHTML = a.icon;
    btn.dataset['align'] = a.value;
    btn.addEventListener('click', () => {
      history.dispatch({ type: 'APPLY_STYLE', textAlign: a.value });
    });
    alignPresets.appendChild(btn);
  }

  // ── Opacity slider ─────────────────────────────────────────────────────────
  const opacitySlider = panel.querySelector<HTMLInputElement>('#cp-opacity')!;
  const opacityVal = panel.querySelector('#cp-opacity-val')!;
  opacitySlider.addEventListener('input', () => {
    opacityVal.textContent = opacitySlider.value;
    history.dispatch({ type: 'APPLY_STYLE', opacity: Number(opacitySlider.value) / 100 });
  });

  // ── Layer actions ──────────────────────────────────────────────────────────
  const layerActions = panel.querySelector('#cp-layer-actions')!;
  const LAYERS = [
    { icon: '⤓', label: t('toBack'),   action: 'back' },
    { icon: '↓', label: t('backward'), action: 'backward' },
    { icon: '↑', label: t('forward'),  action: 'forward' },
    { icon: '⤒', label: t('toFront'),  action: 'front' },
  ];
  for (const l of LAYERS) {
    const btn = document.createElement('button');
    btn.className = 'cp-btn cp-layer-btn';
    btn.textContent = l.icon;
    btn.title = l.label;
    btn.dataset['layer'] = l.action;
    btn.addEventListener('click', () => {
      const scene = history.present;
      const ids = [...scene.selectedIds];
      if (ids.length === 0) return;

      const currentIndex = scene.elements.findIndex((el) => el.id === ids[0]);
      let targetIndex = currentIndex;

      if (l.action === 'back') targetIndex = 0;
      else if (l.action === 'backward') targetIndex = Math.max(0, currentIndex - 1);
      else if (l.action === 'forward') targetIndex = Math.min(scene.elements.length - 1, currentIndex + 1);
      else if (l.action === 'front') targetIndex = scene.elements.length - 1;

      if (targetIndex !== currentIndex) {
        history.dispatch({ type: 'REORDER_ELEMENTS', ids, targetIndex });
      }
    });
    layerActions.appendChild(btn);
  }

  // ── Actions ────────────────────────────────────────────────────────────────
  const actions = panel.querySelector('#cp-actions')!;
  const ACTIONS = [
    { icon: '📋', label: t('duplicate'), action: 'duplicate' },
    { icon: '🗑', label: t('delete'),    action: 'delete' },
  ];
  for (const a of ACTIONS) {
    const btn = document.createElement('button');
    btn.className = 'cp-btn cp-action-btn';
    btn.textContent = a.icon;
    btn.title = a.label;
    btn.dataset['action'] = a.action;
    btn.addEventListener('click', () => {
      const scene = history.present;
      const ids = [...scene.selectedIds];
      if (ids.length === 0) return;

      if (a.action === 'duplicate') {
        const newIds: string[] = [];
        for (const id of ids) {
          const el = scene.elements.find((e) => e.id === id);
          if (!el) continue;
          const newId = crypto.randomUUID();
          newIds.push(newId);
          history.dispatch({ type: 'CREATE_ELEMENT', element: { ...el, id: newId } });
          history.dispatch({ type: 'MOVE_ELEMENT', id: newId, dx: 20, dy: 20 });
        }
        history.dispatch({ type: 'SELECT_ELEMENTS', ids: newIds });
      } else if (a.action === 'delete') {
        history.dispatch({ type: 'DELETE_ELEMENTS', ids });
      }
    });
    actions.appendChild(btn);
  }

  const colorRowStroke = panel.querySelector<HTMLElement>('#cp-stroke-swatches')!.parentElement!;
  const colorRowFill   = panel.querySelector<HTMLElement>('#cp-fill-swatches')!.parentElement!;

  /** Updates aria-pressed on all buttons in a group based on their .active class. */
  function syncAriaPressed(container: HTMLElement, selector: string): void {
    container.querySelectorAll<HTMLButtonElement>(selector).forEach((b) => {
      b.setAttribute('aria-pressed', String(b.classList.contains('active')));
    });
  }

  // ── Sync panel ─────────────────────────────────────────────────────────────
  const DRAWING_TOOLS = new Set<string>(['rectangle', 'ellipse', 'line', 'arrow', 'rombo', 'freehand', 'text']);

  function sync(): void {
    const scene = history.present;
    const selected = [...scene.selectedIds]
      .map((id) => scene.elements.find((el) => el.id === id))
      .filter((el): el is Element => el !== undefined);

    const hasSelection = selected.length > 0;
    const isTouch = window.matchMedia('(pointer: coarse)').matches;
    const isDrawingTool = DRAWING_TOOLS.has(scene.appState.activeTool);
    const isOpen = !isTouch && (hasSelection || isDrawingTool);
    panel.classList.toggle('open', isOpen);

    if (!isOpen) {
      return;
    }

    if (!hasSelection) {
      if (!isDrawingTool) return;
      // ── Tool mode: sync appState defaults, show only relevant sections ──────
      const { activeTool, strokeColor, fillColor, strokeWidth, strokeStyle, roughness, opacity, fontSize, fontFamily } = scene.appState;
      const isText = activeTool === 'text';
      const hasFill = activeTool === 'rectangle' || activeTool === 'ellipse' || activeTool === 'rombo' || activeTool === 'text';
      const hasStyle = activeTool !== 'text' && activeTool !== 'freehand';

      panel.querySelectorAll<HTMLButtonElement>('#cp-stroke-swatches .cp-color-swatch').forEach((sw) => {
        sw.classList.toggle('active', sw.title === strokeColor);
      });
      strokeMore.classList.toggle('active', !!customStroke && customStroke.toLowerCase() === strokeColor.toLowerCase());
      syncAriaPressed(colorRowStroke, '.cp-color-swatch, .cp-color-more');
      panel.querySelectorAll<HTMLButtonElement>('#cp-fill-swatches .cp-color-swatch').forEach((sw) => {
        sw.classList.toggle('active', sw.title === fillColor || (sw.classList.contains('cp-color-swatch-transparent') && fillColor === 'transparent'));
      });
      fillMore.classList.toggle('active', !!customFill && customFill.toLowerCase() === fillColor.toLowerCase());
      syncAriaPressed(colorRowFill, '.cp-color-swatch, .cp-color-more');
      panel.querySelectorAll<HTMLButtonElement>('#cp-width-presets .cp-btn').forEach((btn) => {
        btn.classList.toggle('active', btn.dataset['value'] === String(strokeWidth));
      });
      syncAriaPressed(panel.querySelector<HTMLElement>('#cp-width-presets')!, '.cp-btn');
      if (widthDisplay) widthDisplay.textContent = `${strokeWidth}px`;
      else widthInput.value = String(strokeWidth);
      panel.querySelectorAll<HTMLButtonElement>('#cp-style-presets .cp-btn').forEach((btn) => {
        btn.classList.toggle('active', btn.dataset['style'] === strokeStyle);
      });
      syncAriaPressed(panel.querySelector<HTMLElement>('#cp-style-presets')!, '.cp-btn');
      panel.querySelectorAll<HTMLButtonElement>('#cp-roughness-presets .cp-btn').forEach((btn) => {
        btn.classList.toggle('active', btn.dataset['roughness'] === String(roughness));
      });
      syncAriaPressed(panel.querySelector<HTMLElement>('#cp-roughness-presets')!, '.cp-btn');
      opacitySlider.value = String(Math.round(opacity * 100));
      opacityVal.textContent = String(Math.round(opacity * 100));

      const strokeSection = panel.querySelector('#cp-stroke-swatches')!.parentElement!.parentElement!;
      strokeSection.style.display = '';
      (strokeSection.querySelector('.cp-label') as HTMLElement).textContent = isText ? t('color') : t('stroke');
      panel.querySelector('#cp-fill-swatches')!.parentElement!.parentElement!.style.display = hasFill ? '' : 'none';
      panel.querySelector('#cp-width-presets')!.parentElement!.style.display = isText ? 'none' : '';
      panel.querySelector('#cp-style-presets')!.parentElement!.style.display = hasStyle ? '' : 'none';
      panel.querySelector('#cp-roughness-presets')!.parentElement!.style.display = hasStyle ? '' : 'none';
      panel.querySelector('#cp-border-presets')!.parentElement!.style.display = activeTool === 'rectangle' ? '' : 'none';

      const textPropsSection = panel.querySelector<HTMLElement>('#cp-text-props')!;
      textPropsSection.style.display = isText ? '' : 'none';
      if (isText) {
        fontSizeInput.value = String(fontSize);
        panel.querySelectorAll<HTMLButtonElement>('#cp-font-family-presets .cp-btn').forEach((btn) => {
          btn.classList.toggle('active', btn.dataset['family'] === fontFamily);
        });
        syncAriaPressed(panel.querySelector<HTMLElement>('#cp-font-family-presets')!, '.cp-btn');
        panel.querySelectorAll<HTMLButtonElement>('#cp-textmode-presets .cp-btn').forEach((btn) => {
          btn.classList.toggle('active', btn.dataset['mode'] === scene.appState.textMode);
        });
        syncAriaPressed(panel.querySelector<HTMLElement>('#cp-textmode-presets')!, '.cp-btn');
        panel.querySelectorAll<HTMLButtonElement>('#cp-align-presets .cp-btn').forEach((btn) => {
          btn.classList.toggle('active', btn.dataset['align'] === scene.appState.textAlign);
        });
        syncAriaPressed(panel.querySelector<HTMLElement>('#cp-align-presets')!, '.cp-btn');
      }

      panel.querySelector<HTMLElement>('#cp-actions')!.parentElement!.style.display = 'none';
      return;
    }

    // ── Restore sections visibility for selection mode ───────────────────────
    panel.querySelector<HTMLElement>('#cp-layer-actions')!.parentElement!.style.display = '';
    panel.querySelector<HTMLElement>('#cp-actions')!.parentElement!.style.display = '';

    const first = selected[0]!;
    const allText = selected.every((el) => el.type === 'text');
    const allImage = selected.every((el) => el.type === 'image');

    // Update swatches
    panel.querySelectorAll<HTMLButtonElement>('#cp-stroke-swatches .cp-color-swatch').forEach((sw) => {
      sw.classList.toggle('active', sw.title === first.strokeColor);
    });
    strokeMore.classList.toggle('active', !!customStroke && customStroke.toLowerCase() === first.strokeColor.toLowerCase());
    syncAriaPressed(colorRowStroke, '.cp-color-swatch, .cp-color-more');
    panel.querySelectorAll<HTMLButtonElement>('#cp-fill-swatches .cp-color-swatch').forEach((sw) => {
      sw.classList.toggle('active', sw.title === first.fillColor);
    });
    fillMore.classList.toggle('active', !!customFill && customFill.toLowerCase() === first.fillColor.toLowerCase());
    syncAriaPressed(colorRowFill, '.cp-color-swatch, .cp-color-more');

    // Update width presets
    panel.querySelectorAll<HTMLButtonElement>('#cp-width-presets .cp-btn').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset['value'] === String(first.strokeWidth));
    });
    syncAriaPressed(panel.querySelector<HTMLElement>('#cp-width-presets')!, '.cp-btn');
    if (widthDisplay) widthDisplay.textContent = `${first.strokeWidth}px`;
    else widthInput.value = String(first.strokeWidth);

    // Update style presets
    panel.querySelectorAll<HTMLButtonElement>('#cp-style-presets .cp-btn').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset['style'] === (first.strokeStyle ?? 'solid'));
    });
    syncAriaPressed(panel.querySelector<HTMLElement>('#cp-style-presets')!, '.cp-btn');

    // Update roughness presets
    panel.querySelectorAll<HTMLButtonElement>('#cp-roughness-presets .cp-btn').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset['roughness'] === String(first.roughness ?? 0));
    });
    syncAriaPressed(panel.querySelector<HTMLElement>('#cp-roughness-presets')!, '.cp-btn');

    // Update border presets
    const cr = first.type === 'rectangle' ? (first.cornerRadius ?? 0) : 0;
    panel.querySelectorAll<HTMLButtonElement>('#cp-border-presets .cp-btn').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset['border'] === (cr > 0 ? 'rounded' : 'sharp'));
    });
    syncAriaPressed(panel.querySelector<HTMLElement>('#cp-border-presets')!, '.cp-btn');

    // Update opacity slider
    opacitySlider.value = String(Math.round(first.opacity * 100));
    opacityVal.textContent = String(Math.round(first.opacity * 100));

    // Dynamic section visibility based on selected element types
    const FILL_TYPES = new Set(['rectangle', 'ellipse', 'rhombus', 'text']);
    const STYLE_TYPES = new Set(['rectangle', 'ellipse', 'rhombus', 'line', 'arrow']);
    const hasFill = !allImage && selected.some((el) => FILL_TYPES.has(el.type));
    const hasStyle = !allImage && !allText && selected.some((el) => STYLE_TYPES.has(el.type));
    const hasBorder = selected.some((el) => el.type === 'rectangle');
    const hasWidth = !allText && !allImage;

    const strokeSection = panel.querySelector('#cp-stroke-swatches')!.parentElement!.parentElement!;
    strokeSection.style.display = allImage ? 'none' : '';
    (strokeSection.querySelector('.cp-label') as HTMLElement).textContent = allText ? t('color') : t('stroke');
    panel.querySelector('#cp-fill-swatches')!.parentElement!.parentElement!.style.display = hasFill ? '' : 'none';
    panel.querySelector('#cp-width-presets')!.parentElement!.style.display = hasWidth ? '' : 'none';
    panel.querySelector('#cp-style-presets')!.parentElement!.style.display = hasStyle ? '' : 'none';
    panel.querySelector('#cp-roughness-presets')!.parentElement!.style.display = hasStyle ? '' : 'none';
    panel.querySelector('#cp-border-presets')!.parentElement!.style.display = hasBorder ? '' : 'none';

    // Layer + action groups always present when selection exists
    syncAriaPressed(panel.querySelector<HTMLElement>('#cp-layer-actions')!, '.cp-btn');
    syncAriaPressed(panel.querySelector<HTMLElement>('#cp-actions')!, '.cp-btn');

    // Show/sync text-specific controls
    const textPropsSection = panel.querySelector<HTMLElement>('#cp-text-props')!;
    textPropsSection.style.display = allText ? '' : 'none';
    if (allText && first.type === 'text') {
      fontSizeInput.value = String(first.fontSize);
      panel.querySelectorAll<HTMLButtonElement>('#cp-font-family-presets .cp-btn').forEach((btn) => {
        btn.classList.toggle('active', btn.dataset['family'] === first.fontFamily);
      });
      syncAriaPressed(panel.querySelector<HTMLElement>('#cp-font-family-presets')!, '.cp-btn');
      panel.querySelectorAll<HTMLButtonElement>('#cp-textmode-presets .cp-btn').forEach((btn) => {
        btn.classList.toggle('active', btn.dataset['mode'] === (first.isCode ? 'code' : 'text'));
      });
      syncAriaPressed(panel.querySelector<HTMLElement>('#cp-textmode-presets')!, '.cp-btn');
      panel.querySelectorAll<HTMLButtonElement>('#cp-align-presets .cp-btn').forEach((btn) => {
        btn.classList.toggle('active', btn.dataset['align'] === (first.textAlign ?? 'left'));
      });
      syncAriaPressed(panel.querySelector<HTMLElement>('#cp-align-presets')!, '.cp-btn');
    }
  }

  history.subscribe(sync);
  sync();
}
