import type { History } from '../engine/history';
import type { Element } from '../elements/element';
import { t } from '../i18n';

const STROKE_PRESETS = ['#e2e2ef', '#ff6b6b', '#6bcb77', '#4d96ff', '#c77dff', '#ffffff'];
const FILL_PRESETS   = ['transparent', '#ff6b6b', '#6bcb77', '#4d96ff', '#c77dff', '#ffffff'];

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
      </div>
    </div>

    <div class="cp-section">
      <div class="cp-label">${t('fill')}</div>
      <div class="cp-color-row">
        <div class="cp-color-swatches" id="mss-fill-swatches"></div>
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

  // ── Stroke swatches ────────────────────────────────────────────────────────
  const strokeSwatchEl = sheet.querySelector('#mss-stroke-swatches')!;
  for (const color of STROKE_PRESETS) {
    const sw = document.createElement('button');
    sw.className = 'cp-color-swatch';
    sw.style.background = color;
    sw.title = color;
    sw.addEventListener('click', () => history.dispatch({ type: 'APPLY_STYLE', strokeColor: color }));
    strokeSwatchEl.appendChild(sw);
  }

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

  // ── Width presets ──────────────────────────────────────────────────────────
  const widthEl = sheet.querySelector('#mss-width-presets')!;
  for (const w of [{ value: 1 }, { value: 3 }, { value: 8 }]) {
    const btn = document.createElement('button');
    btn.className = 'cp-btn cp-width-btn';
    btn.dataset['value'] = String(w.value);
    btn.addEventListener('click', () => history.dispatch({ type: 'APPLY_STYLE', strokeWidth: w.value }));
    widthEl.appendChild(btn);
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

  // Tap outside closes sheet
  document.addEventListener('pointerdown', (e) => {
    if (sheet.classList.contains('open') && !sheet.contains(e.target as Node) && e.target !== propsBtn) {
      sheet.classList.remove('open');
      propsBtn.classList.remove('active');
    }
  });

  // ── Action bar ─────────────────────────────────────────────────────────────
  const bar = document.createElement('div');
  bar.id = 'mobile-actions';
  workspace.appendChild(bar);

  const undoBtn  = mkBtn(IC_UNDO,  t('undoLabel'));
  const redoBtn  = mkBtn(IC_REDO,  t('redoLabel'));

  const sep = document.createElement('span');
  sep.className = 'mobile-action-sep';

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
    // Fill swatches
    sheet.querySelectorAll<HTMLButtonElement>('#mss-fill-swatches .cp-color-swatch').forEach((sw) => {
      sw.classList.toggle('active', sw.title === first.fillColor ||
        (sw.classList.contains('cp-color-swatch-transparent') && first.fillColor === 'transparent'));
    });

    // Width
    sheet.querySelectorAll<HTMLButtonElement>('#mss-width-presets .cp-btn').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset['value'] === String(first.strokeWidth));
    });
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

    // Hide sections irrelevant for images
    const hideForImage = allImage;
    const hideForTextOrImage = allText || allImage;
    (sheet.querySelector('#mss-stroke-swatches')!.closest('.cp-section') as HTMLElement).style.display =
      hideForImage ? 'none' : '';
    (sheet.querySelector('#mss-fill-swatches')!.closest('.cp-section') as HTMLElement).style.display =
      hideForTextOrImage ? 'none' : '';
    (sheet.querySelector('#mss-width-presets')!.closest('.cp-section') as HTMLElement).style.display =
      hideForTextOrImage ? 'none' : '';
    (sheet.querySelector('#mss-style-presets')!.closest('.cp-section') as HTMLElement).style.display =
      hideForTextOrImage ? 'none' : '';
    (sheet.querySelector('#mss-roughness-presets')!.closest('.cp-section') as HTMLElement).style.display =
      hideForTextOrImage ? 'none' : '';
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
