import it from './locales/it.json';
import en from './locales/en.json';
import es from './locales/es.json';
import fr from './locales/fr.json';
import de from './locales/de.json';
import pt from './locales/pt.json';
import zh from './locales/zh.json';
import ja from './locales/ja.json';

const STORAGE_KEY = 'markasso-locale';

export type Locale = 'it' | 'en' | 'es' | 'fr' | 'de' | 'pt' | 'zh' | 'ja';

export const LOCALES: Record<Locale, string> = {
  it: 'Italiano',
  en: 'English',
  es: 'Español',
  fr: 'Français',
  de: 'Deutsch',
  pt: 'Português',
  zh: '中文',
  ja: '日本語',
};

const dicts: Record<Locale, Record<string, string>> = { it, en, es, fr, de, pt, zh, ja };

const stored = localStorage.getItem(STORAGE_KEY);
const current: Locale = (stored && stored in dicts) ? (stored as Locale) : 'it';

export function t(key: string): string {
  return dicts[current][key] ?? dicts['en'][key] ?? key;
}

export function setLocale(locale: Locale): void {
  localStorage.setItem(STORAGE_KEY, locale);
  location.reload();
}

export function getLocale(): Locale {
  return current;
}
