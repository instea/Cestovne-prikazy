import {
  LEAVE_STATE_LABELS_EN,
  LEAVE_STATES,
  LEAVE_TYPE_LABELS_EN,
  LEAVE_TYPES,
  LeaveType,
} from '@leaves/shared/leaves';
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

describe('leave type / state labels (DATA-02)', () => {
  const catalogs = { en, sk } as const;

  it.each(['en', 'sk'] as const)(
    'every type and state has a non-empty %s label that is not the raw code',
    (lang) => {
      const catalog = catalogs[lang];
      for (const code of LEAVE_TYPES) {
        expect(catalog.leaveType[code].trim()).not.toBe('');
        expect(catalog.leaveType[code]).not.toBe(code);
      }
      for (const code of LEAVE_STATES) {
        expect(catalog.leaveState[code].trim()).not.toBe('');
        expect(catalog.leaveState[code]).not.toBe(code);
      }
      expect(Object.keys(catalog.leaveType)).toEqual(LEAVE_TYPES);
      expect(Object.keys(catalog.leaveState)).toEqual(LEAVE_STATES);
    },
  );

  it('EN catalog equals the shared EN labels used by emails', () => {
    expect(en.leaveType).toEqual(LEAVE_TYPE_LABELS_EN);
    expect(en.leaveState).toEqual(LEAVE_STATE_LABELS_EN);
  });

  it('shows "Doctor visit" for DOCTOR in EN, never the code', async () => {
    await setLanguage('en');
    expect(i18n.t(`leaveType.${LeaveType.DOCTOR}`)).toBe('Doctor visit');
  });

  it('shows the SK labels in SK', async () => {
    await setLanguage('sk');
    expect(i18n.t('leaveType.CARING')).toBe('Ošetrovanie člena rodiny (OČR)');
    expect(i18n.t('leaveState.PENDING')).toBe('Čaká na schválenie');
    await setLanguage('en');
  });
});
