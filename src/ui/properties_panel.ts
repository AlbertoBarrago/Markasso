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
  const strokeSection      = buildColorSection('Stroke',     STROKE_PRESETS, false);
  const fillSection        = buildColorSection('Fill',       FILL_PRESETS,   true);
  const strokeStyleSection = buildStrokeStyleSection();
  const widthSection       = buildSlider('Stroke width', 1, 30, 1);
  const roughnessSection   = buildSlider('Roughness', 0, 100, 1);
  const opacitySection     = buildSlider('Opacity', 0, 100, 1);
  const fontSection        = buildFontSection();

  panel.append(
    strokeSection.root,
    fillSection.root,
    buildSep(),
    strokeStyleSection.root,
    widthSection.root,
    roughnessSection.root,
    opacitySection.root,
    buildSep(),
    fontSection.root,
  );

  // ── Dispatch helpers ──────────────────────────────────────────────────────
  function applyStyle(patch: Parameters<typeof history.dispatch>[0] & { type: 'APPLY_STYLE' }): void {
    history.dispatch(patch);
  }

  strokeSection.onChange((color) => applyStyle({ type: 'APPLY_STYLE', strokeColor: color }));

  fillSection.onChange((color) => applyStyle({ type: 'APPLY_STYLE', fillColor: color }));

  strokeStyleSection.onChange((style) => applyStyle({ type: 'APPLY_STYLE', strokeStyle: style as 'solid' | 'dashed' | 'dotted' }));

  widthSection.onChange((v) => applyStyle({ type: 'APPLY_STYLE', strokeWidth: v }));

  roughnessSection.onChange((v) => applyStyle({ type: 'APPLY_STYLE', roughness: v / 100 }));

  opacitySection.onChange((v) => applyStyle({ type: 'APPLY_STYLE', opacity: v / 100 }));

  fontSection.onFamilyChange((family) => history.dispatch({ type: 'SET_FONT_FAMILY', family }));
  fontSection.onSizeChange  ((size)   => history.dispatch({ type: 'SET_FONT_SIZE',   size  }));

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
    const allImage  = selected.every((el) => el.type === 'image');

    if (!allImage) {
      strokeSection.setValue(first.strokeColor);
      fillSection.setValue(first.fillColor);
      strokeStyleSection.setValue((first.strokeStyle ?? 'solid') as 'solid' | 'dashed' | 'dotted');
      widthSection.setValue(first.strokeWidth);
      roughnessSection.setValue(Math.round((first.roughness ?? 0) * 100));
    }
    opacitySection.setValue(Math.round(first.opacity * 100));

    // For text: show only "Color" (strokeColor is the text color), hide fill/style/width/roughness
    // For image: hide all stroke/fill controls
    strokeSection.root.style.display      = allImage ? 'none' : '';
    strokeSection.setLabel(allText ? 'Color' : 'Stroke');
    fillSection.root.style.display        = (allText || allImage) ? 'none' : '';
    strokeStyleSection.root.style.display = (allText || allImage) ? 'none' : '';
    widthSection.root.style.display       = (allText || allImage) ? 'none' : '';
    roughnessSection.root.style.display   = (allText || allImage) ? 'none' : '';

    fontSection.root.style.display = hasText ? '' : 'none';
    if (hasText) {
      const textEl = selected.find((el) => el.type === 'text');
      if (textEl && textEl.type === 'text') {
        fontSection.setFamily(textEl.fontFamily);
        fontSection.setSize(textEl.fontSize);
      }
    }
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
  setLabel: (l: string) => void;
} {
  void allowTransparent;
  let _cb: ((c: string) => void) | null = null;
  const emit = (c: string): void => { _cb?.(c); };

  const root = div('prop-section');
  const labelEl = document.createElement('div');
  labelEl.className = 'prop-label';
  labelEl.textContent = label;
  root.appendChild(labelEl);

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
    setLabel: (l) => { labelEl.textContent = l; },
  };
}

function buildStrokeStyleSection(): {
  root: HTMLElement;
  onChange: (cb: (style: string) => void) => void;
  setValue: (style: 'solid' | 'dashed' | 'dotted') => void;
} {
  let _cb: ((s: string) => void) | null = null;

  const root = div('prop-section');
  const lbl  = div('prop-label');
  lbl.textContent = 'Stroke style';
  root.appendChild(lbl);

  const row = div('prop-stroke-style-row');

  const styles: { value: 'solid' | 'dashed' | 'dotted'; label: string; title: string }[] = [
    { value: 'solid',  label: '—',    title: 'Solid' },
    { value: 'dashed', label: '- -',  title: 'Dashed' },
    { value: 'dotted', label: '···',  title: 'Dotted' },
  ];

  const btns = new Map<string, HTMLButtonElement>();
  for (const s of styles) {
    const b = document.createElement('button');
    b.className = 'prop-style-btn';
    b.title = s.title;
    b.textContent = s.label;
    b.dataset['style'] = s.value;
    b.addEventListener('click', () => {
      btns.forEach((btn) => btn.classList.remove('active'));
      b.classList.add('active');
      _cb?.(s.value);
    });
    btns.set(s.value, b);
    row.appendChild(b);
  }

  root.appendChild(row);

  return {
    root,
    onChange: (cb) => { _cb = cb; },
    setValue: (style) => {
      btns.forEach((b, k) => b.classList.toggle('active', k === style));
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
