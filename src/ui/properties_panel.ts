import type { History } from '../engine/history';
import type { Element } from '../elements/element';

const STROKE_PRESETS = ['#e2e2ef', '#ffffff', '#ff6b6b', '#ffd93d', '#6bcb77', '#4d96ff', '#c77dff'];
const FILL_PRESETS   = ['transparent', '#ffffff', '#ff6b6b', '#ffd93d', '#6bcb77', '#4d96ff', '#c77dff'];

const FONTS = [
  { label: 'Handwritten', value: 'Virgil, cursive' },
  { label: 'Sans-serif',  value: 'Arial, sans-serif' },
  { label: 'Serif',       value: 'Georgia, serif' },
  { label: 'Monospace',   value: 'Courier New, monospace' },
  { label: 'Playful',     value: 'Comic Sans MS, cursive' },
];

export function initPropertiesPanel(workspace: HTMLElement, history: History): void {
  const panel = document.createElement('div');
  panel.id    = 'props-panel';
  panel.setAttribute('aria-label', 'Element properties');
  workspace.appendChild(panel);

  // ── Build sections ────────────────────────────────────────────────────────
  const strokeSection = buildColorSection('Stroke',     STROKE_PRESETS, false);
  const fillSection   = buildColorSection('Fill',       FILL_PRESETS,   true);
  const widthSection  = buildSlider('Stroke width', 1, 30, 1);
  const opacitySection= buildSlider('Opacity', 0, 100, 1);
  const fontSection   = buildFontSection();
  const deleteRow     = buildDeleteButton();

  panel.append(
    strokeSection.root,
    fillSection.root,
    buildSep(),
    widthSection.root,
    opacitySection.root,
    buildSep(),
    fontSection.root,
    buildSep(),
    deleteRow,
  );

  // ── Dispatch helpers ──────────────────────────────────────────────────────
  function applyStyle(patch: Parameters<typeof history.dispatch>[0] & { type: 'APPLY_STYLE' }): void {
    history.dispatch(patch);
  }

  strokeSection.onChange((color) => applyStyle({ type: 'APPLY_STYLE', strokeColor: color }));

  fillSection.onChange((color) => applyStyle({ type: 'APPLY_STYLE', fillColor: color }));

  widthSection.onChange((v) => applyStyle({ type: 'APPLY_STYLE', strokeWidth: v }));

  opacitySection.onChange((v) => applyStyle({ type: 'APPLY_STYLE', opacity: v / 100 }));

  fontSection.onFamilyChange((family) => history.dispatch({ type: 'SET_FONT_FAMILY', family }));
  fontSection.onSizeChange  ((size)   => history.dispatch({ type: 'SET_FONT_SIZE',   size  }));

  deleteRow.querySelector('button')!.addEventListener('click', () => {
    const ids = [...history.present.selectedIds];
    if (ids.length > 0) history.dispatch({ type: 'DELETE_ELEMENTS', ids });
  });

  // ── Sync panel to selection ───────────────────────────────────────────────
  function sync(): void {
    const scene     = history.present;
    const selected  = [...scene.selectedIds]
      .map((id) => scene.elements.find((el) => el.id === id))
      .filter((el): el is Element => el !== undefined);

    const visible = selected.length > 0;
    panel.classList.toggle('open', visible);
    if (!visible) return;

    const first     = selected[0]!;
    const hasText   = selected.some((el) => el.type === 'text');
    const allText   = selected.every((el) => el.type === 'text');

    strokeSection.setValue(first.strokeColor);
    fillSection.setValue(first.fillColor);
    widthSection.setValue(first.strokeWidth);
    opacitySection.setValue(Math.round(first.opacity * 100));

    fontSection.root.style.display = hasText ? '' : 'none';
    if (hasText) {
      const textEl = selected.find((el) => el.type === 'text');
      if (textEl && textEl.type === 'text') {
        fontSection.setFamily(textEl.fontFamily);
        fontSection.setSize(textEl.fontSize);
      }
    }

    // Hide stroke width for pure text selections (text has no stroke)
    widthSection.root.style.display = allText ? 'none' : '';
  }

  history.subscribe(sync);
  sync();
}

// ─── Section builders ─────────────────────────────────────────────────────────

function buildColorSection(
  label: string,
  presets: string[],
  allowTransparent: boolean
): {
  root: HTMLElement;
  onChange: (cb: (color: string) => void) => void;
  setValue: (color: string) => void;
} {
  let _cb: ((c: string) => void) | null = null;
  const emit = (c: string): void => { _cb?.(c); };

  const root = div('prop-section');
  root.innerHTML = `<div class="prop-label">${label}</div>`;

  // Preset swatches
  const swatches = div('prop-swatches');
  for (const p of presets) {
    const sw = document.createElement('button');
    sw.className   = 'swatch';
    sw.title       = p === 'transparent' ? 'No fill' : p;
    sw.dataset['color'] = p;
    if (p === 'transparent') {
      sw.classList.add('swatch-transparent');
      sw.textContent = '✕';
    } else {
      sw.style.background = p;
    }
    sw.addEventListener('click', () => emit(p));
    swatches.appendChild(sw);
  }

  // Custom picker
  const picker = document.createElement('input');
  picker.type  = 'color';
  picker.className = 'prop-color-input';
  picker.title = `Custom ${label.toLowerCase()} color`;
  picker.value = presets[0] ?? '#ffffff';
  picker.addEventListener('change', () => emit(picker.value));

  root.append(swatches, picker);

  return {
    root,
    onChange: (cb) => { _cb = cb; },
    setValue: (color) => {
      if (color !== 'transparent') picker.value = color;
      swatches.querySelectorAll<HTMLButtonElement>('.swatch').forEach((sw) => {
        sw.classList.toggle('active', sw.dataset['color'] === color);
      });
    },
  };
}

function buildSlider(
  label: string,
  min: number,
  max: number,
  step: number
): {
  root: HTMLElement;
  onChange: (cb: (v: number) => void) => void;
  setValue: (v: number) => void;
} {
  let _cb: ((v: number) => void) | null = null;

  const root  = div('prop-section');
  const lbl   = div('prop-label');
  lbl.textContent = label;
  const row   = div('prop-slider-row');
  const input = document.createElement('input');
  input.type  = 'range';
  input.min   = String(min);
  input.max   = String(max);
  input.step  = String(step);
  input.className = 'prop-slider';
  const val   = div('prop-slider-val');

  input.addEventListener('input', () => {
    val.textContent = input.value + (label === 'Opacity' ? '%' : '');
    _cb?.(Number(input.value));
  });

  row.append(input, val);
  root.append(lbl, row);

  return {
    root,
    onChange: (cb) => { _cb = cb; },
    setValue: (v) => {
      input.value     = String(v);
      val.textContent = String(v) + (label === 'Opacity' ? '%' : '');
    },
  };
}

function buildFontSection(): {
  root: HTMLElement;
  onFamilyChange: (cb: (f: string) => void) => void;
  onSizeChange:   (cb: (s: number) => void) => void;
  setFamily: (f: string) => void;
  setSize:   (s: number) => void;
} {
  let _familyCb: ((f: string) => void) | null = null;
  let _sizeCb:   ((s: number) => void) | null = null;

  const root  = div('prop-section');
  const lbl   = div('prop-label');
  lbl.textContent = 'Font';

  const select = document.createElement('select');
  select.className = 'prop-select';
  for (const f of FONTS) {
    const opt = document.createElement('option');
    opt.value       = f.value;
    opt.textContent = f.label;
    select.appendChild(opt);
  }
  select.addEventListener('change', () => _familyCb?.(select.value));

  const sizeRow = div('prop-slider-row');
  const sizeInput = document.createElement('input');
  sizeInput.type  = 'number';
  sizeInput.min   = '8';
  sizeInput.max   = '200';
  sizeInput.className = 'prop-number';
  sizeInput.addEventListener('change', () => {
    const v = Math.min(200, Math.max(8, Number(sizeInput.value)));
    sizeInput.value = String(v);
    _sizeCb?.(v);
  });
  const sizeLbl = div('prop-slider-val');
  sizeLbl.textContent = 'px';
  sizeRow.append(sizeInput, sizeLbl);

  root.append(lbl, select, sizeRow);

  return {
    root,
    onFamilyChange: (cb) => { _familyCb = cb; },
    onSizeChange:   (cb) => { _sizeCb   = cb; },
    setFamily: (f) => { select.value = f; },
    setSize:   (s) => { sizeInput.value = String(s); },
  };
}

function buildDeleteButton(): HTMLElement {
  const row  = div('prop-delete-row');
  const btn  = document.createElement('button');
  btn.className   = 'prop-delete-btn';
  btn.textContent = '🗑 Delete';
  btn.title       = 'Delete selected (Del)';
  row.appendChild(btn);
  return row;
}

function buildSep(): HTMLElement {
  const s = document.createElement('hr');
  s.className = 'prop-sep';
  return s;
}

function div(cls: string): HTMLElement {
  const d = document.createElement('div');
  d.className = cls;
  return d;
}
