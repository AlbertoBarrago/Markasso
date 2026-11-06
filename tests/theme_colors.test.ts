import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  getCodeBlockColors,
  resolveStrokeColorForTheme,
} from '../src/rendering/draw_element';
import {
  getCanvasInk,
  invalidateThemeCache,
  isLightColor,
} from '../src/rendering/theme_cache';

/** Stubs the DOM reads theme_cache makes: data-theme and --canvas-bg. */
function setTheme(theme: 'light' | 'dark', canvasBg: string): void {
  vi.stubGlobal('document', {
    documentElement: {
      getAttribute: (name: string) => (name === 'data-theme' ? theme : null),
    },
  });
  vi.stubGlobal('getComputedStyle', () => ({
    getPropertyValue: (name: string) =>
      name === '--canvas-bg' ? canvasBg : '',
  }));
  invalidateThemeCache();
}

afterEach(() => {
  vi.unstubAllGlobals();
  invalidateThemeCache();
});

describe('resolveStrokeColorForTheme', () => {
  it('draws the dark default ink black in the light theme', () => {
    setTheme('light', '#ffffff');
    expect(resolveStrokeColorForTheme('#E2E2EF')).toBe('#000000');
    expect(resolveStrokeColorForTheme('#ff6b6b')).toBe('#ff6b6b');
  });

  it('draws black as the dark default ink in the dark theme', () => {
    setTheme('dark', '#080808');
    expect(resolveStrokeColorForTheme('#000000')).toBe('#e2e2ef');
    expect(resolveStrokeColorForTheme('#000', 'transparent')).toBe('#e2e2ef');
  });

  it('keeps black on its own fill in the dark theme', () => {
    setTheme('dark', '#080808');
    expect(resolveStrokeColorForTheme('#000000', '#ffffff')).toBe('#000000');
  });
});

describe('getCanvasInk', () => {
  it('follows the canvas background, not only the theme', () => {
    setTheme('dark', '#f5f0e6');
    expect(getCanvasInk()).toBe('0,0,0');
    setTheme('light', '#141414');
    expect(getCanvasInk()).toBe('255,255,255');
  });

  it('falls back to the theme when the background is not a hex color', () => {
    setTheme('light', 'rgb(1 2 3)');
    expect(getCanvasInk()).toBe('0,0,0');
  });
});

describe('isLightColor', () => {
  it('parses short and long hex', () => {
    expect(isLightColor('#fff')).toBe(true);
    expect(isLightColor('#080808')).toBe(false);
    expect(isLightColor('transparent')).toBeNull();
  });
});

describe('getCodeBlockColors', () => {
  it('uses a light block in the light theme', () => {
    setTheme('light', '#ffffff');
    expect(getCodeBlockColors().fill).toBe('rgba(0,0,0,0.05)');
    setTheme('dark', '#080808');
    expect(getCodeBlockColors().fill).toBe('rgba(0,0,0,0.55)');
  });
});
