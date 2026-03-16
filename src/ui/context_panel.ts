import type { History } from '../engine/history';
import type { Element } from '../elements/element';

const STROKE_PRESETS = ['#e2e2ef', '#ff6b6b', '#6bcb77', '#4d96ff', '#c77dff', '#ffffff'];
const FILL_PRESETS = ['transparent', '#ff6b6b', '#6bcb77', '#4d96ff', '#c77dff', '#ffffff'];

export function initContextPanel(workspace: HTMLElement, history: History): void {
  const panel = document.createElement('div');
  panel.id = 'context-panel';
  panel.setAttribute('aria-label', 'Context panel');
  workspace.appendChild(panel);

  panel.innerHTML = `
    <div class="cp-section">
      <div class="cp-label">Tratto</div>
      <div class="cp-color-row">
        <div class="cp-color-swatches" id="cp-stroke-swatches"></div>
        <button class="cp-color-more" id="cp-stroke-more" title="Altri colori">+</button>
      </div>
    </div>

    <div class="cp-section">
      <div class="cp-label">Sfondo</div>
      <div class="cp-color-row">
        <div class="cp-color-swatches" id="cp-fill-swatches"></div>
        <button class="cp-color-more" id="cp-fill-more" title="Altri colori">+</button>
      </div>
    </div>

    <div class="cp-section">
      <div class="cp-label">Spessore del tratto</div>
      <div class="cp-btn-row" id="cp-width-presets"></div>
    </div>

    <div class="cp-section">
      <div class="cp-label">Stile del tratto</div>
      <div class="cp-btn-row" id="cp-style-presets"></div>
    </div>

    <div class="cp-section">
      <div class="cp-label">Imprecisione</div>
      <div class="cp-btn-row" id="cp-roughness-presets"></div>
    </div>

    <div class="cp-section">
      <div class="cp-label">Bordi</div>
      <div class="cp-btn-row" id="cp-border-presets"></div>
    </div>

    <div class="cp-section" id="cp-text-props">
      <div class="cp-label">Dimensione</div>
      <div class="cp-font-size-row">
        <input type="number" id="cp-font-size" min="6" max="400" step="1" class="cp-font-size-input" />
      </div>
      <div class="cp-label" style="margin-top:4px">Famiglia</div>
      <div class="cp-btn-row" id="cp-font-family-presets"></div>
    </div>

    <div class="cp-section">
      <div class="cp-label">Opacità</div>
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
      <div class="cp-label">Livelli</div>
      <div class="cp-btn-row" id="cp-layer-actions"></div>
    </div>

    <div class="cp-section">
      <div class="cp-label">Azioni</div>
      <div class="cp-btn-row" id="cp-actions"></div>
    </div>
  `;

  // ── Stroke swatches ────────────────────────────────────────────────────────
  const strokeSwatches = panel.querySelector('#cp-stroke-swatches')!;
  for (const color of STROKE_PRESETS) {
    const sw = document.createElement('button');
    sw.className = 'cp-color-swatch';
    sw.style.background = color;
    sw.title = color;
    sw.addEventListener('click', () => {
      history.dispatch({ type: 'APPLY_STYLE', strokeColor: color });
    });
    strokeSwatches.appendChild(sw);
  }

  // Stroke color picker
  const strokeMore = panel.querySelector('#cp-stroke-more')!;
  const strokePicker = document.createElement('input');
  strokePicker.type = 'color';
  strokePicker.className = 'cp-color-picker';
  strokePicker.value = STROKE_PRESETS[0] || '#e2e2ef';
  strokePicker.addEventListener('input', () => {
    history.dispatch({ type: 'APPLY_STYLE', strokeColor: strokePicker.value });
  });
  strokeMore.addEventListener('click', () => strokePicker.click());
  panel.appendChild(strokePicker);

  // ── Fill swatches ──────────────────────────────────────────────────────────
  const fillSwatches = panel.querySelector('#cp-fill-swatches')!;
  for (const color of FILL_PRESETS) {
    const sw = document.createElement('button');
    sw.className = 'cp-color-swatch';
    sw.title = color === 'transparent' ? 'Trasparente' : color;
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

  // Fill color picker
  const fillMore = panel.querySelector('#cp-fill-more')!;
  const fillPicker = document.createElement('input');
  fillPicker.type = 'color';
  fillPicker.className = 'cp-color-picker';
  fillPicker.value = FILL_PRESETS[1] || '#ffffff';
  fillPicker.addEventListener('input', () => {
    history.dispatch({ type: 'APPLY_STYLE', fillColor: fillPicker.value });
  });
  fillMore.addEventListener('click', () => fillPicker.click());
  panel.appendChild(fillPicker);

  // ── Width presets ──────────────────────────────────────────────────────────
  const widthPresets = panel.querySelector('#cp-width-presets')!;
  const WIDTHS = [
    { value: 1, label: 'Sottile' },
    { value: 3, label: 'Medio' },
    { value: 8, label: 'Spesso' },
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

  // ── Style presets ──────────────────────────────────────────────────────────
  const stylePresets = panel.querySelector('#cp-style-presets')!;
  const STYLES = [
    { value: 'solid', label: 'Solido' },
    { value: 'dashed', label: 'Tratteggio' },
    { value: 'dotted', label: 'Punti' },
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
    { value: 0, label: 'Liscio' },
    { value: 0.5, label: 'Medio' },
    { value: 1, label: 'Ruvido' },
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
    { value: 'sharp', label: 'Spigoloso' },
    { value: 'rounded', label: 'Arrotondato' },
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
    { icon: '⤓', label: 'Porta in fondo', action: 'back' },
    { icon: '↓', label: 'Indietro', action: 'backward' },
    { icon: '↑', label: 'Avanti', action: 'forward' },
    { icon: '⤒', label: 'Porta in cima', action: 'front' },
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
    { icon: '📋', label: 'Duplica', action: 'duplicate' },
    { icon: '🗑', label: 'Elimina', action: 'delete' },
    { icon: '🔗', label: 'Link', action: 'link' },
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
      } else if (a.action === 'link') {
        const url = prompt('Inserisci URL:');
        if (url) {
          console.log('Link:', url);
        }
      }
    });
    actions.appendChild(btn);
  }

  // ── Sync panel ─────────────────────────────────────────────────────────────
  function sync(): void {
    const scene = history.present;
    const selected = [...scene.selectedIds]
      .map((id) => scene.elements.find((el) => el.id === id))
      .filter((el): el is Element => el !== undefined);

    const hasSelection = selected.length > 0;
    const isTouch = window.matchMedia('(pointer: coarse)').matches;
    panel.classList.toggle('open', hasSelection && !isTouch);

    if (!hasSelection) return;

    const first = selected[0]!;
    const allText = selected.every((el) => el.type === 'text');
    const allImage = selected.every((el) => el.type === 'image');

    // Update swatches
    panel.querySelectorAll<HTMLButtonElement>('#cp-stroke-swatches .cp-color-swatch').forEach((sw) => {
      sw.classList.toggle('active', sw.title === first.strokeColor);
    });
    panel.querySelectorAll<HTMLButtonElement>('#cp-fill-swatches .cp-color-swatch').forEach((sw) => {
      sw.classList.toggle('active', sw.title === first.fillColor);
    });

    // Update color picker values
    if (first.strokeColor !== 'transparent' && !first.strokeColor.startsWith('#')) {
      strokePicker.value = first.strokeColor;
    }
    if (first.fillColor !== 'transparent' && !first.fillColor.startsWith('#')) {
      fillPicker.value = first.fillColor;
    }

    // Update width presets
    panel.querySelectorAll<HTMLButtonElement>('#cp-width-presets .cp-btn').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset['value'] === String(first.strokeWidth));
    });

    // Update style presets
    panel.querySelectorAll<HTMLButtonElement>('#cp-style-presets .cp-btn').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset['style'] === (first.strokeStyle ?? 'solid'));
    });

    // Update roughness presets
    panel.querySelectorAll<HTMLButtonElement>('#cp-roughness-presets .cp-btn').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset['roughness'] === String(first.roughness ?? 0));
    });

    // Update border presets
    const cr = first.type === 'rectangle' ? (first.cornerRadius ?? 0) : 0;
    panel.querySelectorAll<HTMLButtonElement>('#cp-border-presets .cp-btn').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset['border'] === (cr > 0 ? 'rounded' : 'sharp'));
    });

    // Update opacity slider
    opacitySlider.value = String(Math.round(first.opacity * 100));
    opacityVal.textContent = String(Math.round(first.opacity * 100));

    // Hide sections for text/images
    panel.querySelector('#cp-stroke-swatches')!.parentElement!.parentElement!.style.display = allImage ? 'none' : '';
    (panel.querySelector('#cp-stroke-swatches')!.parentElement!.parentElement!.querySelector('.cp-label') as HTMLElement).textContent = allText ? 'Colore' : 'Tratto';
    panel.querySelector('#cp-fill-swatches')!.parentElement!.parentElement!.style.display = (allText || allImage) ? 'none' : '';
    panel.querySelector('#cp-width-presets')!.parentElement!.style.display = (allText || allImage) ? 'none' : '';
    panel.querySelector('#cp-style-presets')!.parentElement!.style.display = (allText || allImage) ? 'none' : '';
    panel.querySelector('#cp-roughness-presets')!.parentElement!.style.display = (allText || allImage) ? 'none' : '';
    panel.querySelector('#cp-border-presets')!.parentElement!.style.display = (allText || allImage) ? 'none' : '';

    // Show/sync text-specific controls
    const textPropsSection = panel.querySelector<HTMLElement>('#cp-text-props')!;
    textPropsSection.style.display = allText ? '' : 'none';
    if (allText && first.type === 'text') {
      fontSizeInput.value = String(first.fontSize);
      panel.querySelectorAll<HTMLButtonElement>('#cp-font-family-presets .cp-btn').forEach((btn) => {
        btn.classList.toggle('active', btn.dataset['family'] === first.fontFamily);
      });
    }
  }

  history.subscribe(sync);
  sync();
}
