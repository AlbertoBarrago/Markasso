// Caches DOM/CSSOM reads that only change when the theme is toggled
// (`applyTheme` in ui/settings.ts), avoiding a style recalc / attribute
// read on every render frame.

let canvasBg: string | null = null;
let isLightTheme: boolean | null = null;

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

export function invalidateThemeCache(): void {
  canvasBg = null;
  isLightTheme = null;
}
