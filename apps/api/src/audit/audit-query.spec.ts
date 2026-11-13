import { ErrorCode } from '@leaves/shared/enums';
import { describe, expect, it } from 'vitest';
import { AppException } from '../common/app-exception';
import {
  auditFilter,
  endOfDayIn,
  parseAuditQuery,
  startOfDayIn,
} from './audit-query';

const TZ = 'Europe/Bratislava';

function codeOf(fn: () => unknown): string | undefined {
  try {
    fn();
  } catch (e) {
    if (e instanceof AppException) return `${e.getStatus()} ${e.code}`;
    throw e;
  }
  return undefined;
}

describe('day boundaries in DEFAULT_TIMEZONE', () => {
  it('CET day 2026-11-01', () => {
    expect(startOfDayIn('2026-11-01', TZ).toISOString()).toBe(
      '2026-10-31T23:00:00.000Z',
    );
    expect(endOfDayIn('2026-11-01', TZ).toISOString()).toBe(
      '2026-11-01T22:59:59.999Z',
    );
  });

  it('DST end day 2026-10-25 has 25 hours', () => {
    const start = startOfDayIn('2026-10-25', TZ);
    const end = endOfDayIn('2026-10-25', TZ);
    expect(start.toISOString()).toBe('2026-10-24T22:00:00.000Z');
    expect(end.toISOString()).toBe('2026-10-25T22:59:59.999Z');
    expect(end.getTime() + 1 - start.getTime()).toBe(25 * 3600_000);
  });

  it('month and year ends roll over', () => {
    expect(endOfDayIn('2026-12-31', TZ).toISOString()).toBe(
      '2026-12-31T22:59:59.999Z',
    );
    expect(endOfDayIn('2026-07-31', 'UTC').toISOString()).toBe(
      '2026-07-31T23:59:59.999Z',
    );
  });
});

describe('parseAuditQuery', () => {
  it('defaults', () => {
    expect(parseAuditQuery({})).toEqual({
      actions: undefined,
      actorType: undefined,
      actorId: undefined,
      targetType: undefined,
      targetId: undefined,
      from: undefined,
      to: undefined,
      page: 1,
      pageSize: 50,
    });
  });

  it('action repeated and comma-separated, deduplicated', () => {
    expect(
      parseAuditQuery({
        action: ['LEAVE_CREATED,LEAVE_APPROVED', 'LEAVE_CREATED'],
      }).actions,
    ).toEqual(['LEAVE_CREATED', 'LEAVE_APPROVED']);
  });

  it('accepts every filter', () => {
    expect(
      parseAuditQuery({
        action: 'USER_UPDATED',
        actorType: 'cli',
        actorId: 'u1',
        targetType: 'USER',
        targetId: 't1',
        from: '2026-11-01',
        to: '2026-11-01',
        page: '3',
        pageSize: '200',
      }),
    ).toMatchObject({
      actions: ['USER_UPDATED'],
      actorType: 'cli',
      targetType: 'USER',
      page: 3,
      pageSize: 200,
    });
  });

  it.each([
    [{ action: 'NOPE' }],
    [{ action: 'LEAVE_CREATED,' }],
    [{ actorType: 'admin' }],
    [{ targetType: 'leave' }],
    [{ from: '2026-13-01' }],
    [{ to: '1.11.2026' }],
    [{ page: '0' }],
    [{ page: '1.5' }],
    [{ pageSize: '0' }],
    [{ pageSize: '201' }],
    [{ pageSize: '-1' }],
    [{ targetId: ['a', 'b'] }],
    [{ actorId: '' }],
    [{ foo: 'bar' }],
  ])('%j → 400 VALIDATION_FAILED', (raw) => {
    expect(codeOf(() => parseAuditQuery(raw))).toBe(
      `400 ${ErrorCode.VALIDATION_FAILED}`,
    );
  });

  it('from after to → 400 AUDIT_RANGE_INVALID', () => {
    expect(
      codeOf(() => parseAuditQuery({ from: '2026-11-05', to: '2026-11-01' })),
    ).toBe(`400 ${ErrorCode.AUDIT_RANGE_INVALID}`);
  });
});

describe('auditFilter', () => {
  it('empty query → empty filter', () => {
    expect(auditFilter(parseAuditQuery({}), TZ)).toEqual({});
  });

  it('combines filters and converts the date range', () => {
    expect(
      auditFilter(
        parseAuditQuery({
          action: 'LEAVE_APPROVED,LEAVE_REJECTED',
          actorType: 'user',
          actorId: 'a1',
          targetType: 'LEAVE',
          targetId: 'l1',
          from: '2026-11-01',
          to: '2026-11-01',
        }),
        TZ,
      ),
    ).toEqual({
      action: { $in: ['LEAVE_APPROVED', 'LEAVE_REJECTED'] },
      actorType: 'user',
      actorId: 'a1',
      targetType: 'LEAVE',
      targetId: 'l1',
      at: {
        $gte: new Date('2026-10-31T23:00:00.000Z'),
        $lte: new Date('2026-11-01T22:59:59.999Z'),
      },
    });
  });

  it('open-ended ranges', () => {
    expect(auditFilter(parseAuditQuery({ to: '2026-11-01' }), TZ)).toEqual({
      at: { $lte: new Date('2026-11-01T22:59:59.999Z') },
    });
  });
});
