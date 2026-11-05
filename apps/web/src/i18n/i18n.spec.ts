import { describe, expect, it } from 'vitest';
import en from './en.json';
import sk from './sk.json';
import { dateLocale, i18n, setLanguage, storedLanguage } from '.';

function keys(obj: object, prefix = ''): string[] {
  return Object.entries(obj).flatMap(([k, v]) =>
    typeof v === 'object' && v !== null
      ? keys(v as object, `${prefix}${k}.`)
      : [`${prefix}${k}`],
  );
}

describe('i18n', () => {
  it('has identical key sets in en and sk', () => {
    expect(keys(sk).sort()).toEqual(keys(en).sort());
  });

  it('defaults to English', () => {
    expect(storedLanguage()).toBe('en');
    expect(i18n.t('nav.logout')).toBe('Logout');
  });

  it('persists the choice and updates <html lang>', async () => {
    await setLanguage('sk');
    expect(localStorage.getItem('lang')).toBe('sk');
    expect(storedLanguage()).toBe('sk');
    expect(document.documentElement.lang).toBe('sk');
    expect(i18n.t('nav.logout')).toBe('Odhlásiť sa');
    expect(dateLocale().code).toBe('sk');
  });

  it('ignores an unknown stored value', () => {
    localStorage.setItem('lang', 'de');
    expect(storedLanguage()).toBe('en');
    expect(dateLocale('en').code).toBe('en-GB');
  });
});
