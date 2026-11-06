import { AUDIT_ACTIONS } from '@leaves/shared/audit';
import { ErrorCode } from '@leaves/shared/enums';
import {
  LEAVE_STATE_LABELS_EN,
  LEAVE_STATES,
  LEAVE_TYPE_LABELS_EN,
  LEAVE_TYPES,
  LeaveType,
} from '@leaves/shared/leaves';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  currentLanguage,
  dateLocale,
  i18n,
  LANGUAGES,
  type Language,
  setLanguage,
  storedLanguage,
} from '.';
import en from './locales/en.json';
import sk from './locales/sk.json';

const catalogs: Record<Language, object> = { en, sk };

function flatten(obj: object, prefix = ''): Record<string, string> {
  return Object.fromEntries(
    Object.entries(obj).flatMap(([k, v]) =>
      typeof v === 'object' && v !== null
        ? Object.entries(flatten(v as object, `${prefix}${k}.`))
        : [[`${prefix}${k}`, v as string]],
    ),
  );
}

const PLURAL = /_(zero|one|two|few|many|other)$/;
const baseKey = (key: string) => key.replace(PLURAL, '');

/** Interpolation variable names, e.g. `{{count, number(...)}}` → `count`. */
function variables(text: string): string[] {
  return [...text.matchAll(/{{\s*([\w.]+)[^}]*}}/g)].map((m) => m[1]!).sort();
}

describe('catalog parity (NFR-13)', () => {
  const flat = { en: flatten(en), sk: flatten(sk) };

  it('has the same keys in en and sk, apart from plural suffixes', () => {
    const bases = (lang: Language) =>
      [...new Set(Object.keys(flat[lang]).map(baseKey))].sort();
    expect(bases('sk')).toEqual(bases('en'));
  });

  it.each(LANGUAGES)(
    'has exactly the plural forms %s needs for every plural key',
    (lang) => {
      const categories = new Intl.PluralRules(lang)
        .resolvedOptions()
        .pluralCategories.slice()
        .sort();
      const plural = Object.keys(flat[lang]).filter((k) => PLURAL.test(k));
      const groups = Map.groupBy(plural, baseKey);
      expect(groups.size).toBeGreaterThan(0);
      for (const [, keys] of groups) {
        expect(keys.map((k) => PLURAL.exec(k)![1]).sort()).toEqual(categories);
      }
    },
  );

  it.each(LANGUAGES)('has no empty values in %s', (lang) => {
    for (const [key, value] of Object.entries(flat[lang])) {
      expect(typeof value, key).toBe('string');
      expect(value.trim(), key).not.toBe('');
    }
  });

  it('uses the same interpolation variables per key', () => {
    const vars = (lang: Language) => {
      const out = new Map<string, string>();
      for (const [key, value] of Object.entries(flat[lang])) {
        const base = baseKey(key);
        const v = variables(value).join(',');
        // every plural form of a key uses the same variables
        if (out.has(base)) expect(v, key).toBe(out.get(base));
        out.set(base, v);
      }
      return out;
    };
    expect(Object.fromEntries(vars('sk'))).toEqual(
      Object.fromEntries(vars('en')),
    );
  });

  it.each(LANGUAGES)(
    'covers every shared LeaveType, LeaveState, ErrorCode and audit action in %s',
    (lang) => {
      const keys = new Set(Object.keys(flat[lang]));
      const required = [
        ...LEAVE_TYPES.flatMap((c) => [
          `leaveType.${c}`,
          `leaveTypeShort.${c}`,
        ]),
        ...LEAVE_STATES.map((c) => `leaveState.${c}`),
        ...Object.values(ErrorCode).map((c) => `errors.${c}`),
        'errors.UNKNOWN',
        'errors.NETWORK_ERROR',
        ...AUDIT_ACTIONS.map((a) => `audit.action.${a}`),
      ];
      for (const key of required) expect(keys.has(key), key).toBe(true);
    },
  );

  it.each(LANGUAGES)('never shows a raw type/state code in %s', (lang) => {
    const catalog = catalogs[lang] as typeof en;
    for (const code of LEAVE_TYPES) {
      expect(catalog.leaveType[code]).not.toBe(code);
    }
    for (const code of LEAVE_STATES) {
      expect(catalog.leaveState[code]).not.toBe(code);
    }
  });

  it('EN catalog equals the shared EN labels used by emails', () => {
    expect(en.leaveType).toEqual(LEAVE_TYPE_LABELS_EN);
    expect(en.leaveState).toEqual(LEAVE_STATE_LABELS_EN);
  });
});

describe('language persistence', () => {
  afterEach(() => vi.restoreAllMocks());

  it('defaults to English', () => {
    expect(storedLanguage()).toBe('en');
    expect(currentLanguage()).toBe('en');
    expect(i18n.t('nav.logout')).toBe('Logout');
    expect(dateLocale().code).toBe('en-US');
  });

  it('persists the choice and updates <html lang> and the title', async () => {
    await setLanguage('sk');
    expect(localStorage.getItem('lang')).toBe('sk');
    expect(storedLanguage()).toBe('sk');
    expect(document.documentElement.lang).toBe('sk');
    expect(document.title).toBe('Správa dovoleniek a PN');
    expect(i18n.t('nav.logout')).toBe('Odhlásiť sa');
    expect(dateLocale().code).toBe('sk');
    await setLanguage('en');
    expect(document.documentElement.lang).toBe('en');
    expect(document.title).toBe('Annual / Sick Leaves Management');
  });

  it('starts in Slovak after a reload when SK was chosen', async () => {
    await setLanguage('sk');
    // In-memory language back to EN without touching storage, then a reload:
    // the re-imported module initialises i18next from storage again.
    await i18n.changeLanguage('en');
    expect(document.documentElement.lang).toBe('en');
    vi.resetModules();
    const reloaded = await import('.');
    await vi.waitFor(() => expect(reloaded.currentLanguage()).toBe('sk'));
    expect(reloaded.i18n.t('nav.logout')).toBe('Odhlásiť sa');
    expect(document.documentElement.lang).toBe('sk');
    expect(document.title).toBe('Správa dovoleniek a PN');
  });

  it('ignores an unknown stored value', () => {
    localStorage.setItem('lang', 'de');
    expect(storedLanguage()).toBe('en');
  });

  it('falls back to English when storage throws, and still switches', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('denied');
    });
    expect(storedLanguage()).toBe('en');
    await setLanguage('sk');
    expect(currentLanguage()).toBe('sk');
  });
});

describe('translations', () => {
  it('shows "Doctor visit" for DOCTOR in EN, never the code', () => {
    expect(i18n.t(`leaveType.${LeaveType.DOCTOR}`)).toBe('Doctor visit');
  });

  it('shows the SK labels in SK', async () => {
    await setLanguage('sk');
    expect(i18n.t('leaveType.CARING')).toBe('Ošetrovanie člena rodiny (OČR)');
    expect(i18n.t('leaveState.PENDING')).toBe('Čaká na schválenie');
  });

  const days = (count: number) =>
    i18n.t('leaves.table.daysValue', { start: 'A', end: 'B', count });

  it('selects EN plurals: 1 → work day, 2.5 → work days', () => {
    expect(days(1)).toBe('A - B (1 work day)');
    expect(days(2.5)).toBe('A - B (2.5 work days)');
    expect(days(0)).toBe('A - B (0 work days)');
  });

  it('selects SK plurals: 1 one, 2 few, 2.5 many, 5 other', async () => {
    await setLanguage('sk');
    expect(days(1)).toBe('A - B (1 pracovný deň)');
    expect(days(2)).toBe('A - B (2 pracovné dni)');
    expect(days(2.5)).toBe('A - B (2,5 pracovného dňa)');
    expect(days(5)).toBe('A - B (5 pracovných dní)');
  });
});
