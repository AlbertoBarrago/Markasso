export type Locale = 'it' | 'en' | 'es' | 'fr' | 'de' | 'pt' | 'zh' | 'ja';

const SUPPORTED: ReadonlySet<string> = new Set<Locale>([
  'it',
  'en',
  'es',
  'fr',
  'de',
  'pt',
  'zh',
  'ja',
]);

function isLocale(value: string): value is Locale {
  return SUPPORTED.has(value);
}

/**
 * The locale to use: the one picked in Settings, otherwise the first browser
 * language we have a dictionary for (`pt-BR` → `pt`), otherwise English.
 * The detected locale is not persisted, so it follows browser changes.
 */
export function detectLocale(
  stored: string | null,
  languages: ReadonlyArray<string>,
): Locale {
  if (stored && isLocale(stored)) return stored;
  for (const language of languages) {
    const primary = language.toLowerCase().split('-')[0];
    if (primary && isLocale(primary)) return primary;
  }
  return 'en';
}
