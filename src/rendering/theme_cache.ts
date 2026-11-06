// Caches DOM/CSSOM reads that only change when the theme is toggled
// (`applyTheme` in ui/settings.ts), avoiding a style recalc / attribute
// read on every render frame.

let canvasBg: string | null = null;
let isLightTheme: boolean | null = null;
let canvasInk: string | null = null;

export function getCanvasBg(): string {
  if (canvasBg === null) {
    canvasBg =
      getComputedStyle(document.documentElement)
        .getPropertyValue('--canvas-bg')
        .trim() || '#141414';
  }
  return canvasBg;
}

export function getIsLightTheme(): boolean {
  if (isLightTheme === null) {
    isLightTheme =
      document.documentElement.getAttribute('data-theme') === 'light';
  }
  return isLightTheme;
}

/**
 * RGB triplet ("r,g,b") for faint chrome drawn on the canvas (grid, guides):
 * black on a light canvas, white on a dark one. It follows the canvas
 * background the user picked, not only the UI theme, so a custom light
 * background in the dark theme still gets a visible grid.
 */
export function getCanvasInk(): string {
  if (typeof document === 'undefined') return '255,255,255';
  if (canvasInk === null) {
    const light = isLightColor(getCanvasBg());
    canvasInk = (light ?? getIsLightTheme()) ? '0,0,0' : '255,255,255';
  }
  return canvasInk;
}

/** Relative luminance check for #rgb / #rrggbb; null when not parseable. */
export function isLightColor(color: string): boolean | null {
  let hex = color.trim().replace('#', '');
  if (hex.length === 3) hex = [...hex].map((c) => c + c).join('');
  if (!/^[0-9a-f]{6}/i.test(hex)) return null;
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.55;
}

export function invalidateThemeCache(): void {
  canvasBg = null;
  isLightTheme = null;
  canvasInk = null;
}
