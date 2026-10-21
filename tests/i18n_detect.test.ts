import { describe, expect, it } from 'vitest';
import { detectLocale } from '../src/i18n/detect';

describe('detectLocale', () => {
  it('uses the primary subtag of the first supported browser language', () => {
    expect(detectLocale(null, ['en-US', 'it-IT'])).toBe('en');
    expect(detectLocale(null, ['it-IT', 'en'])).toBe('it');
    expect(detectLocale(null, ['pt-BR'])).toBe('pt');
    expect(detectLocale(null, ['zh-Hans-CN'])).toBe('zh');
  });

  it('skips unsupported languages', () => {
    expect(detectLocale(null, ['nl-NL', 'de-DE'])).toBe('de');
  });

  it('falls back to English', () => {
    expect(detectLocale(null, ['nl-NL', 'sv'])).toBe('en');
    expect(detectLocale(null, [])).toBe('en');
  });

  it('prefers the language picked in Settings', () => {
    expect(detectLocale('ja', ['en-US'])).toBe('ja');
  });

  it('ignores an invalid stored value', () => {
    expect(detectLocale('xx', ['fr-FR'])).toBe('fr');
  });
});
