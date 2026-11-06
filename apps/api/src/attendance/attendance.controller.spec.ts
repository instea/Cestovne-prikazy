import type { ExecutionContext } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import type { AppConfig } from '../config/env.schema';
import { isAttendancePath } from '../app.setup';
import {
  M2mBasicAuthGuard,
  parseAttendanceParams,
} from './attendance.controller';
import {
  AttendanceParamError,
  M2mUnauthorizedError,
} from './attendance.errors';

const MONTH = AttendanceParamError.MONTH;
const YEAR = AttendanceParamError.YEAR;

describe('parseAttendanceParams (ATT-01 validation and normalization)', () => {
  it.each([
    // [year, month, expected { year, month, leaveCodes }]
    ['2024', '3', { year: 2024, month: 3, leaveCodes: true }],
    ['2024', '03', { year: 2024, month: 3, leaveCodes: true }],
    ['2024', '1e1', { year: 2024, month: 10, leaveCodes: true }],
    ['2024', '12', { year: 2024, month: 12, leaveCodes: true }],
    ['2024', '13', { year: 2025, month: 1, leaveCodes: false }],
    ['2024', '0', { year: 2023, month: 12, leaveCodes: false }],
    ['2024', '-1', { year: 2023, month: 11, leaveCodes: false }],
    ['2024', '24', { year: 2025, month: 12, leaveCodes: false }],
    ['2024', '25', { year: 2026, month: 1, leaveCodes: false }],
    ['2024', '1.5', { year: 2024, month: 1, leaveCodes: false }],
    ['2024', '0.5', { year: 2024, month: 1, leaveCodes: false }],
    ['2024.9', '3', { year: 2024, month: 3, leaveCodes: true }],
    // `Number('')` / `Number(' ')` are 0, valid like old `isNaN`.
    ['2024', ' ', { year: 2023, month: 12, leaveCodes: false }],
  ])('%s/%s → %o', (year, month, expected) => {
    expect(parseAttendanceParams(year, month)).toEqual(expected);
  });

  it.each([
    ['2024', 'abc', MONTH],
    ['abc', '3', YEAR],
    ['abc', 'abc', MONTH],
    ['2024', 'Infinity', MONTH],
    ['2024', '-Infinity', MONTH],
    ['2024', '1e400', MONTH],
    ['Infinity', '3', YEAR],
    ['1e400', '3', YEAR],
  ])('%s/%s → 400 %s', (year, month, message) => {
    expect(() => parseAttendanceParams(year, month)).toThrow(
      new AttendanceParamError(message),
    );
  });
});

describe('M2mBasicAuthGuard', () => {
  const contextWith = (authorization?: string) =>
    ({
      switchToHttp: () => ({
        getRequest: () => ({ headers: { authorization } }),
      }),
    }) as unknown as ExecutionContext;
  const guard = (username?: string, password?: string) =>
    new M2mBasicAuthGuard({
      M2M_USERNAME: username,
      M2M_PASSWORD: password,
    } as AppConfig);
  const basic = (s: string) => `Basic ${Buffer.from(s).toString('base64')}`;

  it('allows valid credentials', () => {
    expect(guard('m2m', 'p:w').canActivate(contextWith(basic('m2m:p:w')))).toBe(
      true,
    );
  });

  it.each([
    ['no header', 'm2m', 'pw', undefined],
    ['Bearer header', 'm2m', 'pw', 'Bearer token'],
    ['wrong password', 'm2m', 'pw', basic('m2m:x')],
    ['wrong username', 'm2m', 'pw', basic('x:pw')],
    ['password unset, empty password sent', 'm2m', undefined, basic('m2m:')],
    ['username unset', undefined, 'pw', basic(':pw')],
  ])('rejects %s', (_name, user, pass, header) => {
    expect(() => guard(user, pass).canActivate(contextWith(header))).toThrow(
      M2mUnauthorizedError,
    );
  });
});

describe('isAttendancePath (CORS exclusion)', () => {
  it.each([
    ['/api/attendence/2024/3', true],
    ['/api/attendence/2024/3/', true],
    ['/api/attendence/2024/3?x=1', true],
    ['/api/attendence', true],
    ['/API/Attendence/2024/3', true],
    ['/api/attendences', false],
    ['/api/auth/me', false],
    [undefined, false],
  ])('%s → %s', (url, expected) => {
    expect(isAttendancePath(url)).toBe(expected);
  });
});
