import 'i18next';
import type en from './locales/en.json';

/** NFR-13: `en.json` types every `t()` key; a missing key fails `tsc`. */
declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'translation';
    resources: { translation: typeof en };
  }
}
