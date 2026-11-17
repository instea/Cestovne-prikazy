import { describe, expect, it } from 'vitest';
import {
  auditApiQuery,
  filterFromParams,
  filterToParams,
  isRangeInvalid,
  pageCount,
} from './audit-filter';

const parse = (q: string) => filterFromParams(new URLSearchParams(q));

describe('audit filter ↔ URL (NFR-06)', () => {
  it('parses every filter', () => {
    expect(
      parse(
        'actorId=u1&targetType=LEAVE&targetId=%20L1%20&action=LEAVE_APPROVED&action=LEAVE_CREATED&from=2026-11-01&to=2026-11-05&page=3',
      ),
    ).toEqual({
      actorId: 'u1',
      targetType: 'LEAVE',
      targetId: 'L1',
      actions: ['LEAVE_CREATED', 'LEAVE_APPROVED'],
      from: '2026-11-01',
      to: '2026-11-05',
      page: 3,
    });
  });

  it('accepts comma-separated actions and the CLI actor', () => {
    expect(
      parse('actorType=cli&actorId=x&action=USER_UPDATED,USER_ROLE_CHANGED'),
    ).toEqual({
      actorType: 'cli',
      actions: ['USER_UPDATED', 'USER_ROLE_CHANGED'],
      page: 1,
    });
  });

  it('drops invalid values', () => {
    expect(
      parse(
        'actorType=bot&targetType=TRIP&action=NOPE&from=2026-13-01&to=x&page=0',
      ),
    ).toEqual({ actions: [], page: 1 });
  });

  it('round-trips through the URL, omitting empties and page 1', () => {
    const filter = parse(
      'actorId=u1&targetType=USER&action=USER_DEACTIVATED&from=2026-01-01&page=2',
    );
    expect(filterFromParams(filterToParams(filter))).toEqual(filter);
    expect(
      filterToParams({ actions: [], page: 1, targetId: '  ' }).toString(),
    ).toBe('');
  });

  it('builds the API query with page and page size', () => {
    expect(auditApiQuery({ actions: ['LEAVE_APPROVED'], page: 1 })).toBe(
      'action=LEAVE_APPROVED&page=1&pageSize=50',
    );
  });

  it('flags from after to', () => {
    expect(isRangeInvalid({ from: '2026-11-05', to: '2026-11-01' })).toBe(true);
    expect(isRangeInvalid({ from: '2026-11-01', to: '2026-11-01' })).toBe(
      false,
    );
    expect(isRangeInvalid({ from: '2026-11-05' })).toBe(false);
  });

  it('counts pages', () => {
    expect(pageCount(0, 50)).toBe(1);
    expect(pageCount(50, 50)).toBe(1);
    expect(pageCount(51, 50)).toBe(2);
    expect(pageCount(120, 50)).toBe(3);
  });
});
