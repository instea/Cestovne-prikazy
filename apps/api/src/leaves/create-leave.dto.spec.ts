import 'reflect-metadata';
import type { ApiErrorBody } from '@leaves/shared/enums';
import { describe, expect, it } from 'vitest';
import { AppException } from '../common/app-exception';
import { createValidationPipe } from '../common/validation';
import { assertLeaveDateRules, CreateLeaveDto } from './create-leave.dto';

/** LV-01 body as the API sees it: global pipe, then the date rules. */
async function check(body: unknown): Promise<ApiErrorBody | 'ok'> {
  try {
    const dto = (await createValidationPipe().transform(body, {
      type: 'body',
      metatype: CreateLeaveDto,
    })) as CreateLeaveDto;
    assertLeaveDateRules(dto);
    return 'ok';
  } catch (e) {
    if (e instanceof AppException) return e.body;
    throw e;
  }
}

const valid = {
  startDate: '2026-11-09',
  endDate: '2026-11-13',
  type: 'ANNUAL',
  isHalfDay: false,
};

const failed = (code: string, message?: string) => ({
  statusCode: 400,
  code,
  message: message ?? (expect.any(String) as string),
});

describe('CreateLeaveDto validation (LV-01)', () => {
  it.each<[string, unknown, ReturnType<typeof failed> | 'ok']>([
    ['a valid body', valid, 'ok'],
    [
      'no type / isHalfDay (defaults)',
      { startDate: '2026-11-09', endDate: '2026-11-09' },
      'ok',
    ],
    [
      'a half-day on one day',
      { ...valid, endDate: valid.startDate, isHalfDay: true },
      'ok',
    ],
    [
      'a weekend (0 work days)',
      { ...valid, startDate: '2026-11-07', endDate: '2026-11-08' },
      'ok',
    ],
    [
      'a 400-day range',
      { ...valid, startDate: '2026-01-01', endDate: '2027-02-04' },
      'ok',
    ],
    [
      'just under 2 years (2026-03-01 → 2028-02-29)',
      { ...valid, startDate: '2026-03-01', endDate: '2028-02-29' },
      'ok',
    ],
    [
      'exactly 2 years (2026-03-01 → 2028-03-01)',
      { ...valid, startDate: '2026-03-01', endDate: '2028-03-01' },
      failed('LEAVE_TOO_LONG', 'Leave must be shorter than 2 years'),
    ],
    [
      'the whole range (2000-01-01 → 2100-12-31)',
      { ...valid, startDate: '2000-01-01', endDate: '2100-12-31' },
      failed('LEAVE_TOO_LONG', 'Leave must be shorter than 2 years'),
    ],
    [
      'the range edges (2000-01-01, 2100-12-31)',
      { ...valid, startDate: '2000-01-01', endDate: '2000-01-01' },
      'ok',
    ],
    [
      'the last day of the range',
      { ...valid, startDate: '2100-12-31', endDate: '2100-12-31' },
      'ok',
    ],
    [
      'a startDate in 1999',
      { ...valid, startDate: '1999-12-31' },
      failed(
        'VALIDATION_FAILED',
        'startDate must be between 2000-01-01 and 2100-12-31',
      ),
    ],
    [
      'an endDate in 2101',
      { ...valid, endDate: '2101-01-01' },
      failed(
        'VALIDATION_FAILED',
        'endDate must be between 2000-01-01 and 2100-12-31',
      ),
    ],
    [
      'the old DoS range 0100-01-01 → 9999-12-31',
      { ...valid, startDate: '0100-01-01', endDate: '9999-12-31' },
      failed(
        'VALIDATION_FAILED',
        'startDate must be between 2000-01-01 and 2100-12-31',
      ),
    ],
    [
      'type: null',
      { ...valid, type: null },
      failed(
        'VALIDATION_FAILED',
        'type must be one of ANNUAL, SICKNESS, DOCTOR, MATERNITY, PARENTAL, CARING',
      ),
    ],
    [
      'isHalfDay: null',
      { ...valid, isHalfDay: null },
      failed('VALIDATION_FAILED', 'isHalfDay must be a boolean'),
    ],
    [
      'a __proto__ key',
      JSON.parse(
        '{"__proto__":{},"startDate":"2026-11-09","endDate":"2026-11-09"}',
      ),
      failed('VALIDATION_FAILED', 'property __proto__ should not exist'),
    ],
    [
      'endDate < startDate',
      { ...valid, startDate: '2026-11-13', endDate: '2026-11-09' },
      failed(
        'LEAVE_END_BEFORE_START',
        'Start date must not be greater than end date',
      ),
    ],
    [
      'a multi-day half-day',
      { ...valid, isHalfDay: true },
      failed(
        'LEAVE_HALF_DAY_MULTIPLE_DAYS',
        'Half day option is allowed only within single day',
      ),
    ],
    [
      'numDays from the client',
      { ...valid, numDays: 99 },
      failed('VALIDATION_FAILED', 'property numDays should not exist'),
    ],
    [
      'state from the client',
      { ...valid, state: 'APPROVED' },
      failed('VALIDATION_FAILED'),
    ],
    [
      'requesterId from the client',
      { ...valid, requesterId: 'x' },
      failed('VALIDATION_FAILED'),
    ],
    [
      'approverId from the client',
      { ...valid, approverId: 'x' },
      failed('VALIDATION_FAILED'),
    ],
    ['id from the client', { ...valid, id: 'x' }, failed('VALIDATION_FAILED')],
    [
      'a non-existent date',
      { ...valid, startDate: '2026-02-30' },
      failed(
        'VALIDATION_FAILED',
        'startDate must be a date in YYYY-MM-DD format',
      ),
    ],
    [
      'a d.M.yyyy date',
      { ...valid, startDate: '9.11.2026' },
      failed(
        'VALIDATION_FAILED',
        'startDate must be a date in YYYY-MM-DD format',
      ),
    ],
    [
      'a missing endDate',
      { startDate: '2026-11-09' },
      failed(
        'VALIDATION_FAILED',
        'endDate must be a date in YYYY-MM-DD format',
      ),
    ],
    [
      'a numeric date',
      { ...valid, endDate: 20261113 },
      failed('VALIDATION_FAILED'),
    ],
    ['an empty body', {}, failed('VALIDATION_FAILED')],
    [
      'an unknown type',
      { ...valid, type: 'VACATION' },
      failed(
        'VALIDATION_FAILED',
        'type must be one of ANNUAL, SICKNESS, DOCTOR, MATERNITY, PARENTAL, CARING',
      ),
    ],
    [
      'a non-boolean isHalfDay',
      { ...valid, isHalfDay: 'yes' },
      failed('VALIDATION_FAILED', 'isHalfDay must be a boolean'),
    ],
  ])('%s', async (_label, body, expected) => {
    expect(await check(body)).toEqual(expected);
  });
});

describe('rule precedence (LV-01)', () => {
  it('END_BEFORE_START wins when both date rules fail', async () => {
    expect(
      await check({
        ...valid,
        startDate: '2026-11-13',
        endDate: '2026-11-09',
        isHalfDay: true,
      }),
    ).toEqual(failed('LEAVE_END_BEFORE_START'));
  });

  it('END_BEFORE_START wins over TOO_LONG', async () => {
    // Reversed and more than 2 years apart.
    expect(
      await check({ ...valid, startDate: '2030-01-01', endDate: '2026-01-01' }),
    ).toEqual(failed('LEAVE_END_BEFORE_START'));
  });

  it('TOO_LONG wins over HALF_DAY_MULTIPLE_DAYS', async () => {
    expect(
      await check({
        ...valid,
        startDate: '2026-01-01',
        endDate: '2029-01-01',
        isHalfDay: true,
      }),
    ).toEqual(failed('LEAVE_TOO_LONG'));
  });

  it('an out-of-range date wins over the date rules', async () => {
    expect(
      await check({ ...valid, startDate: '2101-01-01', endDate: '2026-01-01' }),
    ).toEqual(failed('VALIDATION_FAILED'));
  });

  it('a malformed field wins over the date rules', async () => {
    expect(
      await check({
        startDate: '2026-11-13',
        endDate: '2026-11-09',
        type: 'VACATION',
      }),
    ).toEqual(failed('VALIDATION_FAILED'));
  });

  it('applies the defaults: ANNUAL, full day', () => {
    expect(
      assertLeaveDateRules({ startDate: '2026-11-09', endDate: '2026-11-09' }),
    ).toEqual({
      startDate: '2026-11-09',
      endDate: '2026-11-09',
      type: 'ANNUAL',
      isHalfDay: false,
    });
  });
});
