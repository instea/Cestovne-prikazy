import { enUS, sk as skLocale, type Locale } from 'date-fns/locale';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './locales/en.json';
import sk from './locales/sk.json';

/** NFR-13: only English and Slovak; English is the default (no detection). */
export const LANGUAGES = ['en', 'sk'] as const;
export type Language = (typeof LANGUAGES)[number];

export const STORAGE_KEY = 'lang';

export function isLanguage(v: unknown): v is Language {
  return (LANGUAGES as readonly unknown[]).includes(v);
}

/** Stored choice or `en`. Storage may be unavailable (private mode). */
export function storedLanguage(): Language {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return isLanguage(v) ? v : 'en';
  } catch {
    return 'en';
  }
}

/** Switches without reload; the choice is kept in memory if storage fails. */
export async function setLanguage(lang: Language): Promise<void> {
  try {
    localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    // not persisted; still switch for this session
  }
  await i18n.changeLanguage(lang);
}

export function currentLanguage(): Language {
  return isLanguage(i18n.language) ? i18n.language : 'en';
}

export function dateLocale(lang: Language = currentLanguage()): Locale {
  return lang === 'sk' ? skLocale : enUS;
}

function applyDocumentLanguage(): void {
  document.documentElement.lang = currentLanguage();
  document.title = i18n.t('app.title');
}

i18n.on('languageChanged', applyDocumentLanguage);

void i18n.use(initReactI18next).init({
  resources: { en: { translation: en }, sk: { translation: sk } },
  lng: storedLanguage(),
  fallbackLng: 'en',
  supportedLngs: LANGUAGES,
  interpolation: { escapeValue: false },
});
applyDocumentLanguage();

export { i18n };
