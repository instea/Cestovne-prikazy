import { enGB, sk as skLocale, type Locale } from 'date-fns/locale';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './en.json';
import sk from './sk.json';

export const LANGUAGES = ['en', 'sk'] as const;
export type Language = (typeof LANGUAGES)[number];

const STORAGE_KEY = 'lang';

function isLanguage(v: unknown): v is Language {
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
  return lang === 'sk' ? skLocale : enGB;
}

i18n.on('languageChanged', (lang) => {
  document.documentElement.lang = lang;
});

void i18n.use(initReactI18next).init({
  resources: { en: { translation: en }, sk: { translation: sk } },
  lng: storedLanguage(),
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
});
document.documentElement.lang = i18n.language;

export { i18n };
