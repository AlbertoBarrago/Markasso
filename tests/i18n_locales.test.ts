import { describe, expect, it } from 'vitest';
import de from '../src/i18n/locales/de.json';
import en from '../src/i18n/locales/en.json';
import es from '../src/i18n/locales/es.json';
import fr from '../src/i18n/locales/fr.json';
import itLocale from '../src/i18n/locales/it.json';
import ja from '../src/i18n/locales/ja.json';
import pt from '../src/i18n/locales/pt.json';
import zh from '../src/i18n/locales/zh.json';

const LOCALES: Record<string, Record<string, string>> = {
  de,
  es,
  fr,
  it: itLocale,
  ja,
  pt,
  zh,
};

describe('locale dictionaries', () => {
  const enKeys = Object.keys(en).sort();

  for (const [name, dict] of Object.entries(LOCALES)) {
    it(`${name} has exactly the English keys`, () => {
      // A missing key silently falls back to English; an extra one is dead.
      expect(Object.keys(dict).sort()).toEqual(enKeys);
    });

    it(`${name} has no empty translations`, () => {
      for (const [key, value] of Object.entries(dict))
        expect(value.trim(), key).not.toBe('');
    });
  }
});
