import { describe, expect, it } from 'vitest';
import { setLanguage } from '.';
import { ApiError } from '../api/errors';
import {
  errorMessage,
  formatDate,
  formatDateRange,
  formatNumber,
  formatTimestamp,
  monthName,
  translateErrorCode,
} from './format';

describe('formatters (NFR-13)', () => {
  it('formats a leave range like the old Angular app in EN', () => {
    expect(formatDateRange('2026-11-04', '2026-11-06', 'en')).toBe(
      'Nov 4, 2026 - Nov 6, 2026',
    );
  });

  it('formats a leave range as d. M. yyyy in SK', () => {
    expect(formatDateRange('2026-11-04', '2026-11-06', 'sk')).toBe(
      '4. 11. 2026 - 6. 11. 2026',
    );
  });

  it('formats calendar dates without timezone shifting', () => {
    expect(formatDate('2026-01-01', 'en')).toBe('Jan 1, 2026');
    expect(formatDate('2026-12-31', 'sk')).toBe('31. 12. 2026');
  });

  it('uses the active language by default', async () => {
    await setLanguage('sk');
    expect(formatDate('2026-11-04')).toBe('4. 11. 2026');
    expect(formatNumber(2.5)).toBe('2,5');
  });

  it('lists month names per locale', () => {
    expect(monthName(1, 'en')).toBe('January');
    expect(monthName(11, 'en')).toBe('November');
    expect(monthName(1, 'sk')).toBe('január');
    expect(monthName(12, 'sk')).toBe('december');
  });

  it('formats timestamps in the default timezone (CET / CEST)', () => {
    expect(formatTimestamp('2026-11-04T09:15:02.123Z', 'en')).toBe(
      'Nov 4, 2026 10:15',
    );
    expect(formatTimestamp('2026-11-04T09:15:02.123Z', 'sk')).toBe(
      '4. 11. 2026 10:15',
    );
    expect(formatTimestamp('2026-07-01T05:05:00Z', 'sk')).toBe(
      '1. 7. 2026 7:05',
    );
    expect(
      formatTimestamp('2026-10-31T23:30:00Z', 'en', 'America/New_York'),
    ).toBe('Oct 31, 2026 19:30');
  });

  it('formats numbers with at most one decimal', () => {
    expect(formatNumber(2.5, 'en')).toBe('2.5');
    expect(formatNumber(2.5, 'sk')).toBe('2,5');
    expect(formatNumber(0, 'en')).toBe('0');
    expect(formatNumber(3, 'sk')).toBe('3');
  });
});

describe('error translation (NFR-13)', () => {
  it('translates a known code in the active language', async () => {
    expect(translateErrorCode('CONFIRM_EMAIL_MISMATCH')).toBe(
      'The email does not match.',
    );
    await setLanguage('sk');
    expect(translateErrorCode('CONFIRM_EMAIL_MISMATCH')).toBe(
      'E-mail sa nezhoduje.',
    );
  });

  it('shows errors.UNKNOWN for an unknown code, not the server text', () => {
    expect(errorMessage(new ApiError(409, 'SOME_NEW_CODE', 'Server'))).toBe(
      'Something went wrong. Try again later.',
    );
  });

  it('shows errors.UNKNOWN for non-API errors', () => {
    expect(errorMessage(new Error('x'))).toBe(
      'Something went wrong. Try again later.',
    );
  });
});
