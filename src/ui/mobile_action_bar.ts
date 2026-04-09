import type { History } from '../engine/history';
import type { Element } from '../elements/element';
import { t } from '../i18n';

const STROKE_PRESETS = ['#000000', '#e2e2ef', '#ff6b6b', '#6bcb77', '#4d96ff', '#c77dff', '#ffffff'];
const FILL_PRESETS   = ['transparent', '#e2e2ef', '#ff6b6b', '#6bcb77', '#4d96ff', '#c77dff', '#ffffff'];

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
  } catch { return null; }
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
  if (s === 0) { r = g = b = l; } else {
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
  } catch { return []; }
}

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

export function initMobileActionBar(workspace: HTMLElement, history: History): void {

  // ── Bottom sheet (style panel) ──────────────────────────────────────────────
  const sheet = document.createElement('div');
  sheet.id = 'mobile-style-sheet';
  workspace.appendChild(sheet);

  sheet.innerHTML = `
    <div class="mss-handle"></div>

    <div class="cp-section">
      <div class="cp-label">${t('stroke')}</div>
      <div class="cp-color-row">
        <div class="cp-color-swatches" id="mss-stroke-swatches"></div>
        <button class="cp-color-more" id="mss-stroke-more" title="${t('moreColors')}">+</button>
      </div>
    </div>

    <div class="cp-section">
      <div class="cp-label">${t('fill')}</div>
      <div class="cp-color-row">
        <div class="cp-color-swatches" id="mss-fill-swatches"></div>
        <button class="cp-color-more" id="mss-fill-more" title="${t('moreColors')}">+</button>
      </div>
    </div>

    <div class="cp-section">
      <div class="cp-label">${t('strokeWidth')}</div>
      <div class="cp-btn-row" id="mss-width-presets"></div>
    </div>

    <div class="cp-section">
      <div class="cp-label">${t('strokeStyle')}</div>
      <div class="cp-btn-row" id="mss-style-presets"></div>
    </div>

    <div class="cp-section">
      <div class="cp-label">${t('roughness')}</div>
      <div class="cp-btn-row" id="mss-roughness-presets"></div>
    </div>

    <div class="cp-section">
      <div class="cp-label">${t('corners')}</div>
      <div class="cp-btn-row" id="mss-border-presets"></div>
    </div>

    <div class="cp-section">
      <div class="cp-label">${t('opacity')}</div>
      <div class="cp-slider-row">
        <input type="range" min="0" max="100" step="1" class="cp-slider" id="mss-opacity" />
      </div>
      <div class="cp-slider-labels">
        <span>0</span>
        <span class="cp-slider-val" id="mss-opacity-val">100</span>
        <span>100</span>
      </div>
    </div>
  `;

  // ── Custom color state ──────────────────────────────────────────────────────
  let customStroke: string | null = loadCustomColor('stroke');
  let customFill:   string | null = loadCustomColor('fill');

  // ── Color popup ─────────────────────────────────────────────────────────────
  const colorPopup = document.createElement('div');
  colorPopup.className = 'cp-color-popup';
  colorPopup.setAttribute('role', 'dialog');
  colorPopup.style.display = 'none';
  document.body.appendChild(colorPopup);

  const shadesContainer = document.createElement('div');
  shadesContainer.className = 'cp-popup-shades';

  colorPopup.innerHTML = `
    <div class="cp-popup-section">
      <div class="cp-popup-label">${t('color')}</div>
      <div class="cp-popup-grid" id="mss-popup-grid"></div>
    </div>
    <div class="cp-popup-section" id="mss-popup-shades-section">
      <div class="cp-popup-label">${t('shades')}</div>
    </div>
    <div class="cp-popup-section cp-popup-hex-section">
      <div class="cp-popup-label">${t('hexCode')}</div>
      <div class="cp-popup-hex-row">
        <span class="cp-popup-hex-hash">#</span>
        <input class="cp-popup-hex-input" id="mss-popup-hex" maxlength="6" spellcheck="false" />
      </div>
    </div>
  `;
  colorPopup.querySelector('#mss-popup-shades-section')!.appendChild(shadesContainer);

  const popupGrid = colorPopup.querySelector<HTMLElement>('#mss-popup-grid')!;
  for (const color of POPUP_COLORS) {
    const btn = document.createElement('button');
    btn.className = 'cp-popup-swatch';
    if (color === 'transparent') btn.classList.add('cp-popup-swatch-transparent');
    else btn.style.background = color;
    btn.title = color === 'transparent' ? t('transparent') : color;
    btn.dataset['color'] = color;
    btn.addEventListener('click', () => pickColor(color));
    popupGrid.appendChild(btn);
  }

  const hexInput = colorPopup.querySelector<HTMLInputElement>('#mss-popup-hex')!;
  hexInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const hex = '#' + hexInput.value.replace(/[^0-9a-fA-F]/g, '');
      if (hex.length === 7) pickColor(hex);
    }
    if (e.key === 'Escape') closeColorPopup();
  });
  hexInput.addEventListener('input', () => {
    const clean = hexInput.value.replace(/[^0-9a-fA-F]/g, '');
    hexInput.value = clean;
    if (clean.length === 6) {
      updateShades('#' + clean);
      currentColorCallback?.({ preview: '#' + clean });
    }
  });

  let currentColorCallback: ((result: { pick?: string; preview?: string }) => void) | null = null;

  function updateShades(baseColor: string): void {
    shadesContainer.innerHTML = '';
    const shades = computeShades(baseColor);
    shades.forEach((shade) => {
      const btn = document.createElement('button');
      btn.className = 'cp-popup-swatch cp-popup-shade';
      btn.style.background = shade;
      btn.title = shade;
      btn.addEventListener('click', () => pickColor(shade));
      shadesContainer.appendChild(btn);
    });
    (colorPopup.querySelector('#mss-popup-shades-section') as HTMLElement).style.display =
      shades.length ? '' : 'none';
  }

  function pickColor(color: string): void {
    currentColorCallback?.({ pick: color });
    closeColorPopup();
  }

  function openColorPopup(
    anchor: HTMLElement,
    currentColor: string,
    onResult: (result: { pick?: string; preview?: string }) => void,
  ): void {
    currentColorCallback = onResult;
    colorPopup.querySelectorAll<HTMLButtonElement>('.cp-popup-swatch').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset['color'] === currentColor.toLowerCase());
    });
    const base = currentColor.startsWith('#') ? currentColor : '#808080';
    updateShades(base);
    hexInput.value = currentColor.startsWith('#') ? currentColor.slice(1) : '';
    colorPopup.style.display = 'block';
    requestAnimationFrame(() => {
      const r = anchor.getBoundingClientRect();
      const pw = colorPopup.offsetWidth;
      const ph = colorPopup.offsetHeight;
      let left = r.left + r.width / 2 - pw / 2;
      left = Math.max(8, Math.min(left, window.innerWidth - pw - 8));
      let top = r.top - ph - 8;
      if (top < 8) top = r.bottom + 8;
      colorPopup.style.left = left + 'px';
      colorPopup.style.top = top + 'px';
    });
  }

  function closeColorPopup(): void {
    colorPopup.style.display = 'none';
    currentColorCallback = null;
  }

  // Close color popup on tap outside (capture so canvas taps work too)
  document.addEventListener('pointerdown', (e) => {
    if (colorPopup.style.display !== 'none' && !colorPopup.contains(e.target as Node)) {
      closeColorPopup();
    }
  }, { capture: true });

  // ── Stroke swatches ────────────────────────────────────────────────────────
  const strokeSwatchEl = sheet.querySelector('#mss-stroke-swatches')!;
  for (const color of STROKE_PRESETS) {
    const sw = document.createElement('button');
    sw.className = 'cp-color-swatch';
    sw.title = color;
    sw.style.background = color;
    sw.addEventListener('click', () => history.dispatch({ type: 'APPLY_STYLE', strokeColor: color }));
    strokeSwatchEl.appendChild(sw);
  }

  const strokeMoreBtn = sheet.querySelector<HTMLButtonElement>('#mss-stroke-more')!;
  updateMoreBtn(strokeMoreBtn, customStroke);
  strokeMoreBtn.addEventListener('click', () => {
    const currentColor = customStroke ?? history.present.appState.strokeColor ?? '#e2e2ef';
    openColorPopup(strokeMoreBtn, currentColor, ({ pick, preview }) => {
      if (preview) history.dispatch({ type: 'APPLY_STYLE', strokeColor: preview });
      if (pick) {
        if (pick === 'transparent') {
          customStroke = null;
          saveCustomColor('stroke', null);
          updateMoreBtn(strokeMoreBtn, null);
        } else {
          customStroke = pick;
          saveCustomColor('stroke', pick);
          updateMoreBtn(strokeMoreBtn, pick);
          history.dispatch({ type: 'APPLY_STYLE', strokeColor: pick });
        }
      }
    });
  });

  // ── Fill swatches ──────────────────────────────────────────────────────────
  const fillSwatchEl = sheet.querySelector('#mss-fill-swatches')!;
  for (const color of FILL_PRESETS) {
    const sw = document.createElement('button');
    sw.className = 'cp-color-swatch';
    sw.title = color === 'transparent' ? t('transparent') : color;
    if (color === 'transparent') sw.classList.add('cp-color-swatch-transparent');
    else sw.style.background = color;
    sw.addEventListener('click', () => history.dispatch({ type: 'APPLY_STYLE', fillColor: color }));
    fillSwatchEl.appendChild(sw);
  }

  const fillMoreBtn = sheet.querySelector<HTMLButtonElement>('#mss-fill-more')!;
  updateMoreBtn(fillMoreBtn, customFill);
  fillMoreBtn.addEventListener('click', () => {
    const currentColor = customFill ?? history.present.appState.fillColor ?? 'transparent';
    const base = currentColor === 'transparent' ? '#ffffff' : currentColor;
    openColorPopup(fillMoreBtn, base, ({ pick, preview }) => {
      if (preview) history.dispatch({ type: 'APPLY_STYLE', fillColor: preview });
      if (pick) {
        if (pick === 'transparent') {
          customFill = null;
          saveCustomColor('fill', null);
          updateMoreBtn(fillMoreBtn, null);
        } else {
          customFill = pick;
          saveCustomColor('fill', pick);
          updateMoreBtn(fillMoreBtn, pick);
          history.dispatch({ type: 'APPLY_STYLE', fillColor: pick });
        }
      }
    });
  });

  // ── Width presets ──────────────────────────────────────────────────────────
  const widthEl = sheet.querySelector('#mss-width-presets')!;
  for (const w of [{ value: 1 }, { value: 3 }, { value: 8 }]) {
    const btn = document.createElement('button');
    btn.className = 'cp-btn cp-width-btn';
    btn.dataset['value'] = String(w.value);
    btn.addEventListener('click', () => history.dispatch({ type: 'APPLY_STYLE', strokeWidth: w.value }));
    widthEl.appendChild(btn);
  }
  const mssWidthInput = document.createElement('input');
  mssWidthInput.type = 'number';
  mssWidthInput.min = '1';
  mssWidthInput.max = '100';
  mssWidthInput.step = '1';
  mssWidthInput.className = 'cp-font-size-input';
  mssWidthInput.style.width = '52px';
  let mssWidthDisplay: HTMLDivElement | null = null;
  if (mssWidthInput.type !== 'number') {
    mssWidthDisplay = document.createElement('div');
    mssWidthDisplay.setAttribute('aria-live', 'polite');
    mssWidthDisplay.className = 'cp-width-display';
    widthEl.appendChild(mssWidthDisplay);
  } else {
    mssWidthInput.addEventListener('change', () => {
      const v = Math.max(1, Math.min(100, Math.round(Number(mssWidthInput.value))));
      mssWidthInput.value = String(v);
      history.dispatch({ type: 'APPLY_STYLE', strokeWidth: v });
    });
    widthEl.appendChild(mssWidthInput);
  }

  // ── Style presets ──────────────────────────────────────────────────────────
  const styleEl = sheet.querySelector('#mss-style-presets')!;
  for (const s of [{ value: 'solid' }, { value: 'dashed' }, { value: 'dotted' }]) {
    const btn = document.createElement('button');
    btn.className = 'cp-btn cp-style-btn';
    btn.dataset['style'] = s.value;
    btn.addEventListener('click', () =>
      history.dispatch({ type: 'APPLY_STYLE', strokeStyle: s.value as 'solid' | 'dashed' | 'dotted' })
    );
    styleEl.appendChild(btn);
  }

  // ── Roughness presets ──────────────────────────────────────────────────────
  const roughnessEl = sheet.querySelector('#mss-roughness-presets')!;
  for (const r of [{ value: 0 }, { value: 0.5 }, { value: 1 }]) {
    const btn = document.createElement('button');
    btn.className = 'cp-btn cp-roughness-btn';
    btn.dataset['roughness'] = String(r.value);
    btn.addEventListener('click', () => history.dispatch({ type: 'APPLY_STYLE', roughness: r.value }));
    roughnessEl.appendChild(btn);
  }

  // ── Border presets ─────────────────────────────────────────────────────────
  const borderEl = sheet.querySelector('#mss-border-presets')!;
  for (const b of [{ value: 'sharp' }, { value: 'rounded' }]) {
    const btn = document.createElement('button');
    btn.className = 'cp-btn cp-border-btn';
    btn.dataset['border'] = b.value;
    btn.addEventListener('click', () =>
      history.dispatch({ type: 'APPLY_STYLE', cornerRadius: b.value === 'rounded' ? 8 : 0 })
    );
    borderEl.appendChild(btn);
  }

  // ── Opacity slider ─────────────────────────────────────────────────────────
  const opacitySlider = sheet.querySelector<HTMLInputElement>('#mss-opacity')!;
  const opacityVal    = sheet.querySelector('#mss-opacity-val')!;
  opacitySlider.addEventListener('input', () => {
    opacityVal.textContent = opacitySlider.value;
    history.dispatch({ type: 'APPLY_STYLE', opacity: Number(opacitySlider.value) / 100 });
  });

  // ── Action bar ─────────────────────────────────────────────────────────────
  const bar = document.createElement('div');
  bar.id = 'mobile-actions';
  workspace.appendChild(bar);

  const undoBtn      = mkBtn(IC_UNDO,      t('undoLabel'));
  const redoBtn      = mkBtn(IC_REDO,      t('redoLabel'));
  const sep          = document.createElement('span');
  sep.className      = 'mobile-action-sep';
  const propsBtn     = mkBtn(IC_PROPS,     t('style'));
  const duplicateBtn = mkBtn(IC_DUPLICATE, t('duplicate'));
  const deleteBtn    = mkBtn(IC_DELETE,    t('delete'));
  deleteBtn.classList.add('mobile-action-danger');

  bar.append(undoBtn, redoBtn, sep, propsBtn, duplicateBtn, deleteBtn);

  undoBtn.addEventListener('click', () => history.undo());
  redoBtn.addEventListener('click', () => history.redo());

  propsBtn.addEventListener('click', () => {
    const open = sheet.classList.toggle('open');
    propsBtn.classList.toggle('active', open);
  });

  duplicateBtn.addEventListener('click', () => {
    const scene = history.present;
    const selected = [...scene.selectedIds]
      .map((id) => scene.elements.find((el) => el.id === id))
      .filter((el) => el !== undefined);
    for (const el of selected) {
      history.dispatch({
        type: 'CREATE_ELEMENT',
        element: { ...el, id: crypto.randomUUID(), x: el.x + 16, y: el.y + 16 },
      });
    }
  });

  deleteBtn.addEventListener('click', () => {
    const ids = [...history.present.selectedIds];
    if (ids.length) history.dispatch({ type: 'DELETE_ELEMENTS', ids });
  });

  // Close sheet on tap outside (capture so canvas taps work too)
  document.addEventListener('pointerdown', (e) => {
    const target = e.target as Node;
    if (
      sheet.classList.contains('open') &&
      !sheet.contains(target) &&
      !colorPopup.contains(target) &&
      target !== propsBtn
    ) {
      sheet.classList.remove('open');
      propsBtn.classList.remove('active');
    }
  }, { capture: true });

  // ── Sync ───────────────────────────────────────────────────────────────────
  function sync(): void {
    const scene = history.present;
    const selected = [...scene.selectedIds]
      .map((id) => scene.elements.find((el) => el.id === id))
      .filter((el): el is Element => el !== undefined);
    const hasSelection = selected.length > 0;

    undoBtn.disabled = !history.canUndo();
    redoBtn.disabled = !history.canRedo();

    sep.style.display          = hasSelection ? 'block' : 'none';
    propsBtn.style.display     = hasSelection ? 'flex'  : 'none';
    duplicateBtn.style.display = hasSelection ? 'flex'  : 'none';
    deleteBtn.style.display    = hasSelection ? 'flex'  : 'none';

    if (!hasSelection) {
      sheet.classList.remove('open');
      propsBtn.classList.remove('active');
      return;
    }

    const first = selected[0]!;
    const allText  = selected.every((el) => el.type === 'text');
    const allImage = selected.every((el) => el.type === 'image');

    // Stroke swatches
    sheet.querySelectorAll<HTMLButtonElement>('#mss-stroke-swatches .cp-color-swatch').forEach((sw) => {
      sw.classList.toggle('active', sw.title === first.strokeColor);
    });
    strokeMoreBtn.classList.toggle('active', !!customStroke && customStroke === first.strokeColor);

    // Fill swatches
    sheet.querySelectorAll<HTMLButtonElement>('#mss-fill-swatches .cp-color-swatch').forEach((sw) => {
      sw.classList.toggle('active', sw.title === first.fillColor ||
        (sw.classList.contains('cp-color-swatch-transparent') && first.fillColor === 'transparent'));
    });
    fillMoreBtn.classList.toggle('active', !!customFill && customFill === first.fillColor);

    // Width
    sheet.querySelectorAll<HTMLButtonElement>('#mss-width-presets .cp-btn').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset['value'] === String(first.strokeWidth));
    });
    if (mssWidthDisplay) mssWidthDisplay.textContent = `${first.strokeWidth}px`;
    else mssWidthInput.value = String(first.strokeWidth);

    // Style
    sheet.querySelectorAll<HTMLButtonElement>('#mss-style-presets .cp-btn').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset['style'] === (first.strokeStyle ?? 'solid'));
    });

    // Roughness
    sheet.querySelectorAll<HTMLButtonElement>('#mss-roughness-presets .cp-btn').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset['roughness'] === String(first.roughness ?? 0));
    });

    // Border
    const cr = first.type === 'rectangle' ? (first.cornerRadius ?? 0) : 0;
    sheet.querySelectorAll<HTMLButtonElement>('#mss-border-presets .cp-btn').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset['border'] === (cr > 0 ? 'rounded' : 'sharp'));
    });

    // Opacity
    const pct = Math.round(first.opacity * 100);
    opacitySlider.value = String(pct);
    opacityVal.textContent = String(pct);

    // Hide sections based on selected element types (mirrors desktop context panel logic)
    const FILL_TYPES  = new Set(['rectangle', 'ellipse', 'rhombus', 'text']);
    const STYLE_TYPES = new Set(['rectangle', 'ellipse', 'rhombus', 'line', 'arrow']);
    const hasFill  = !allImage && selected.some((el) => FILL_TYPES.has(el.type));
    const hasStyle = !allImage && !allText && selected.some((el) => STYLE_TYPES.has(el.type));
    const hasWidth = !allText && !allImage;
    (sheet.querySelector('#mss-stroke-swatches')!.closest('.cp-section') as HTMLElement).style.display =
      allImage ? 'none' : '';
    (sheet.querySelector('#mss-fill-swatches')!.closest('.cp-section') as HTMLElement).style.display =
      hasFill ? '' : 'none';
    (sheet.querySelector('#mss-width-presets')!.closest('.cp-section') as HTMLElement).style.display =
      hasWidth ? '' : 'none';
    (sheet.querySelector('#mss-style-presets')!.closest('.cp-section') as HTMLElement).style.display =
      hasStyle ? '' : 'none';
    (sheet.querySelector('#mss-roughness-presets')!.closest('.cp-section') as HTMLElement).style.display =
      hasStyle ? '' : 'none';
    (sheet.querySelector('#mss-border-presets')!.closest('.cp-section') as HTMLElement).style.display =
      (first.type !== 'rectangle') ? 'none' : '';
  }

  history.subscribe(sync);
  sync();
}

// ── Icons ──────────────────────────────────────────────────────────────────────

const IC_UNDO      = `<svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8h9a4 4 0 010 8H8"/><path d="M7 5L4 8l3 3"/></svg>`;
const IC_REDO      = `<svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M16 8H7a4 4 0 000 8h5"/><path d="M13 5l3 3-3 3"/></svg>`;
const IC_PROPS     = `<svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><line x1="4" y1="6" x2="16" y2="6"/><line x1="4" y1="10" x2="16" y2="10"/><line x1="4" y1="14" x2="16" y2="14"/><circle cx="7" cy="6" r="1.8" fill="currentColor" stroke="none"/><circle cx="13" cy="10" r="1.8" fill="currentColor" stroke="none"/><circle cx="9" cy="14" r="1.8" fill="currentColor" stroke="none"/></svg>`;
const IC_DUPLICATE = `<svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="7" y="7" width="9" height="9" rx="1.5"/><path d="M4 13V4h9"/></svg>`;
const IC_DELETE    = `<svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6h12M8 6V4h4v2M7 9v6M10 9v6M13 9v6M5 6l1 10h8l1-10"/></svg>`;

function mkBtn(icon: string, title: string): HTMLButtonElement {
  const b = document.createElement('button');
  b.className = 'mobile-action-btn';
  b.title = title;
  b.innerHTML = icon;
  return b;
}
