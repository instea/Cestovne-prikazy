import { describe, expect, it } from 'vitest';
import { buildContext, eachDate, flattenSso, localDate } from './context.mts';
import { localMidnight } from './synthetic.mts';

const TZ = 'Europe/Bratislava';
const leave = (
  id: string,
  requesterId: string,
  start: string,
  end: string,
  state = 'APPROVED',
) => ({
  id,
  requesterId,
  startDate: new Date(localMidnight(start)),
  endDate: new Date(localMidnight(end)),
  state,
});

const sso = flattenSso([
  { name: 'Cyril', email: 'cyril@x', keys: [{ key: 'employee', value: '1' }] },
  {
    name: 'Dana',
    email: 'dana@x',
    keys: [
      { key: 'employee', value: '1' },
      { key: 'togglUserId', value: '35' },
    ],
  },
  {
    name: 'Ivan',
    email: 'ivan@x',
    keys: [
      { key: 'employee', value: '1' },
      { key: 'togglUserId', value: '50' },
    ],
  },
  { name: 'Hana', email: 'Hana@x', keys: [{ key: 'employee', value: '1' }] },
]);
const users = [
  { id: 'c', email: 'cyril@x' },
  { id: 'd', email: 'dana@x' },
  { id: 'i', email: 'ivan@x' },
  { id: 'h', email: 'hana@x' },
];
const leaves = [
  leave('c1', 'c', '2024-06-08', '2024-06-12'),
  leave('c2', 'c', '2024-07-06', '2024-07-07'), // weekend only: no hang
  leave('c3', 'c', '2024-08-05', '2024-08-05', 'PENDING'),
  leave('d1', 'd', '2024-01-15', '2025-01-20'),
  leave('i1', 'i', '2024-04-08', '2024-04-08'),
  leave('i2', 'i', '2024-04-15', '2024-04-16'),
  leave('h1', 'h', '2024-06-10', '2024-06-10'), // SSO email differs in case
];

describe('buildContext (MIG-03)', () => {
  const dates = eachDate('2024-01-01', '2025-12-31');
  const weekend = (d: string) =>
    [0, 6].includes(new Date(`${d}T00:00:00Z`).getUTCDay());
  const oldNonWorking = new Set(
    dates.filter((d) => weekend(d) || d === '2025-09-01'),
  );
  const context = buildContext({
    sso,
    users,
    leaves,
    timezone: TZ,
    oldNonWorking,
    newIsWorkingDay: (d) => !weekend(d),
    dates,
    findings: [
      {
        code: 'LEAVE_TYPE_DEFAULTED',
        collection: 'leaves',
        recordId: 'i1',
        action: 'migrated-with-default',
      },
      {
        code: 'LEAVE_HALF_DAY_MULTIPLE_DAYS',
        collection: 'leaves',
        recordId: 'i2',
        action: 'skipped',
      },
      {
        code: 'LEAVE_NUMDAYS_CHANGED',
        collection: 'leaves',
        recordId: 'd1',
        action: 'migrated',
      },
    ],
  });

  it('lists dates whose working-day status differs', () => {
    expect([...context.holidayMismatch]).toEqual(['2025-09-01']);
  });

  it('marks months where an employee without togglUserId has an APPROVED leave on a working day', () => {
    expect([...context.hangMonths]).toEqual(['2024-06']);
  });

  it('lists APPROVED leaves spanning more than 11 months per SSO name', () => {
    expect(context.longLeaves).toEqual(
      new Map([['Dana', [{ start: '2024-01-15', end: '2025-01-20' }]]]),
    );
  });

  it('maps skipped / changed leaves of the migration report to SSO names and dates', () => {
    expect(context.migrationReported).toEqual(
      new Map([
        [
          'Ivan',
          [
            { start: '2024-04-08', end: '2024-04-08' },
            { start: '2024-04-15', end: '2024-04-16' },
          ],
        ],
      ]),
    );
  });

  it('marks every leave of a skipped user', () => {
    const ctx = buildContext({
      sso,
      users,
      leaves,
      timezone: TZ,
      oldNonWorking: new Set(),
      newIsWorkingDay: () => true,
      dates: [],
      findings: [
        {
          code: 'USER_DUPLICATE_EMAIL',
          collection: 'users',
          recordId: 'd',
          action: 'skipped',
        },
      ],
    });
    expect(ctx.migrationReported.get('Dana')).toBe('all');
  });
});

describe('date helpers', () => {
  it('localDate converts an instant to the calendar date in the zone', () => {
    expect(localDate(new Date('2024-03-10T23:00:00Z'), TZ)).toBe('2024-03-11');
    expect(localDate('2024-07-14T22:00:00Z', TZ)).toBe('2024-07-15');
    expect(localDate('nope', TZ)).toBeNull();
  });

  it('flattenSso lets keys override name and email like the old app', () => {
    expect(
      flattenSso([
        { name: 'A', email: 'a@x', keys: [{ key: 'name', value: 'B' }] },
      ]),
    ).toEqual([{ name: 'B', email: 'a@x' }]);
    expect(flattenSso({})).toEqual([]);
  });
});
