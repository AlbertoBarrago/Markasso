import type { History } from '../engine/history';

export const COLOR_PICKER_COLORS = [
  'transparent',
  '#000000',
  '#e2e2ef',
  '#f5f5f5',
  '#ffffff',
  '#4d96ff',
  '#748ffc',
  '#c77dff',
  '#f783ac',
  '#ff6b6b',
  '#6bcb77',
  '#a9e34b',
  '#ffd43b',
  '#ff922b',
  '#f03e3e',
] as const;

type CustomColorKind = 'stroke' | 'fill';

export type ColorPickerResult = {
  pick?: string;
  preview?: string;
};

type ColorPickerLabels = {
  color: string;
  shades: string;
  hexCode: string;
  transparent: string;
};

type ColorPickerOptions = {
  history: History;
  labels: ColorPickerLabels;
  position: (anchor: HTMLElement, popup: HTMLElement) => void;
};

const CUSTOM_COLORS_KEY = 'markasso-custom-colors';

export function bindUndoTransaction(
  input: HTMLElement,
  history: History,
): void {
  let active = false;
  const begin = (): void => {
    if (active) return;
    active = true;
    history.beginDrag();
  };
  const end = (): void => {
    if (!active) return;
    active = false;
    history.endDrag();
  };
  input.addEventListener('pointerdown', begin);
  input.addEventListener('keydown', begin);
  input.addEventListener('pointerup', end);
  input.addEventListener('keyup', end);
  input.addEventListener('change', end);
  input.addEventListener('blur', end);
}

export function loadCustomColor(kind: CustomColorKind): string | null {
  try {
    const raw = localStorage.getItem(CUSTOM_COLORS_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return null;
    const value = (parsed as Record<string, unknown>)[kind];
    return typeof value === 'string' ? value : null;
  } catch {
    return null;
  }
}

export function saveCustomColor(
  kind: CustomColorKind,
  color: string | null,
): void {
  let data: Record<string, string | null> = {};
  try {
    const raw = localStorage.getItem(CUSTOM_COLORS_KEY);
    if (raw) {
      const parsed: unknown = JSON.parse(raw);
      if (typeof parsed === 'object' && parsed !== null) {
        data = parsed as Record<string, string | null>;
      }
    }
  } catch {
    // Ignore an invalid persisted custom color.
  }
  data[kind] = color;
  localStorage.setItem(CUSTOM_COLORS_KEY, JSON.stringify(data));
}

export function updateCustomColorButton(
  button: HTMLButtonElement,
  color: string | null,
  moreColorsLabel: string,
): void {
  if (color) {
    button.style.background = color;
    button.style.border = '2px solid rgba(255,255,255,0.15)';
    button.textContent = '';
    button.title = color;
    button.classList.add('cp-color-more-filled');
    return;
  }

  button.style.background = '';
  button.style.border = '';
  button.textContent = '+';
  button.title = moreColorsLabel;
  button.classList.remove('cp-color-more-filled');
}

export function createColorPicker(options: ColorPickerOptions): {
  contains: (target: Node) => boolean;
  open: (
    anchor: HTMLElement,
    currentColor: string,
    onResult: (result: ColorPickerResult) => void,
  ) => void;
} {
  const popup = document.createElement('div');
  popup.className = 'cp-color-popup';
  popup.setAttribute('role', 'dialog');
  popup.style.display = 'none';
  document.body.appendChild(popup);

  const shadesContainer = document.createElement('div');
  shadesContainer.className = 'cp-popup-shades';
  const shadesSection = document.createElement('div');
  shadesSection.className = 'cp-popup-section';
  shadesSection.innerHTML = `<div class="cp-popup-label">${options.labels.shades}</div>`;
  shadesSection.appendChild(shadesContainer);

  const popupGrid = document.createElement('div');
  popupGrid.className = 'cp-popup-grid';
  const hexInput = document.createElement('input');
  hexInput.className = 'cp-popup-hex-input';
  hexInput.maxLength = 6;
  hexInput.spellcheck = false;

  popup.innerHTML = `
    <div class="cp-popup-section">
      <div class="cp-popup-label">${options.labels.color}</div>
    </div>
    <div class="cp-popup-section cp-popup-hex-section">
      <div class="cp-popup-label">${options.labels.hexCode}</div>
      <div class="cp-popup-hex-row">
        <span class="cp-popup-hex-hash">#</span>
      </div>
    </div>
  `;
  popup.querySelector('.cp-popup-section')!.appendChild(popupGrid);
  popup.querySelector('.cp-popup-hex-row')!.appendChild(hexInput);
  popup.insertBefore(shadesSection, popup.lastElementChild);

  let onResult: ((result: ColorPickerResult) => void) | null = null;
  let transactionActive = false;

  const beginTransaction = (): void => {
    if (transactionActive) return;
    transactionActive = true;
    options.history.beginDrag();
  };
  const endTransaction = (): void => {
    if (!transactionActive) return;
    transactionActive = false;
    options.history.endDrag();
  };
  const close = (): void => {
    popup.style.display = 'none';
    onResult = null;
    endTransaction();
  };
  const pickColor = (color: string): void => {
    beginTransaction();
    onResult?.({ pick: color });
    close();
  };
  const updateShades = (baseColor: string): void => {
    shadesContainer.innerHTML = '';
    for (const shade of computeShades(baseColor)) {
      const button = document.createElement('button');
      button.className = 'cp-popup-swatch cp-popup-shade';
      button.style.background = shade;
      button.title = shade;
      button.addEventListener('click', () => pickColor(shade));
      shadesContainer.appendChild(button);
    }
    shadesSection.style.display = shadesContainer.childElementCount
      ? ''
      : 'none';
  };

  for (const color of COLOR_PICKER_COLORS) {
    const button = document.createElement('button');
    button.className = 'cp-popup-swatch';
    if (color === 'transparent') {
      button.classList.add('cp-popup-swatch-transparent');
    } else {
      button.style.background = color;
    }
    button.title = color === 'transparent' ? options.labels.transparent : color;
    button.dataset.color = color;
    button.addEventListener('click', () => pickColor(color));
    popupGrid.appendChild(button);
  }

  hexInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      const hex = `#${hexInput.value.replace(/[^0-9a-fA-F]/g, '')}`;
      if (hex.length === 7) pickColor(hex);
    }
    if (event.key === 'Escape') close();
  });
  hexInput.addEventListener('input', () => {
    const clean = hexInput.value.replace(/[^0-9a-fA-F]/g, '');
    hexInput.value = clean;
    if (clean.length !== 6) return;
    const hex = `#${clean}`;
    updateShades(hex);
    beginTransaction();
    onResult?.({ preview: hex });
  });

  document.addEventListener(
    'pointerdown',
    (event) => {
      if (
        popup.style.display !== 'none' &&
        !popup.contains(event.target as Node)
      ) {
        close();
      }
    },
    { capture: true },
  );
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && popup.style.display !== 'none') close();
  });

  return {
    contains(target): boolean {
      return popup.contains(target);
    },
    open(anchor, currentColor, callback): void {
      onResult = callback;
      popup
        .querySelectorAll<HTMLButtonElement>('.cp-popup-swatch')
        .forEach((button) => {
          button.classList.toggle(
            'active',
            button.dataset.color === currentColor.toLowerCase(),
          );
        });
      const baseColor = currentColor.startsWith('#') ? currentColor : '#808080';
      updateShades(baseColor);
      hexInput.value = currentColor.startsWith('#')
        ? currentColor.slice(1)
        : '';
      popup.style.display = 'block';
      requestAnimationFrame(() => {
        options.position(anchor, popup);
        hexInput.focus();
      });
    },
  };
}

function computeShades(hex: string): string[] {
  if (!hex.startsWith('#') || hex.length !== 7) return [];
  const [hue, saturation] = hexToHsl(hex);
  return [20, 35, 50, 65, 80].map((lightness) =>
    hslToHex(hue, saturation, lightness),
  );
}

function hexToHsl(hex: string): [number, number, number] {
  const red = parseInt(hex.slice(1, 3), 16) / 255;
  const green = parseInt(hex.slice(3, 5), 16) / 255;
  const blue = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const lightness = (max + min) / 2;
  if (max === min) return [0, 0, lightness * 100];

  const delta = max - min;
  const saturation =
    lightness > 0.5 ? delta / (2 - max - min) : delta / (max + min);
  let hue = 0;
  if (max === red) hue = ((green - blue) / delta + (green < blue ? 6 : 0)) / 6;
  else if (max === green) hue = ((blue - red) / delta + 2) / 6;
  else hue = ((red - green) / delta + 4) / 6;
  return [hue * 360, saturation * 100, lightness * 100];
}

function hslToHex(hue: number, saturation: number, lightness: number): string {
  const h = hue / 360;
  const s = saturation / 100;
  const l = lightness / 100;
  if (s === 0) {
    const channel = Math.round(l * 255)
      .toString(16)
      .padStart(2, '0');
    return `#${channel}${channel}${channel}`;
  }

  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const channel = (offset: number): string => {
    let value = h + offset;
    if (value < 0) value += 1;
    if (value > 1) value -= 1;
    const rgb =
      value < 1 / 6
        ? p + (q - p) * 6 * value
        : value < 1 / 2
          ? q
          : value < 2 / 3
            ? p + (q - p) * (2 / 3 - value) * 6
            : p;
    return Math.round(rgb * 255)
      .toString(16)
      .padStart(2, '0');
  };
  return `#${channel(1 / 3)}${channel(0)}${channel(-1 / 3)}`;
}
