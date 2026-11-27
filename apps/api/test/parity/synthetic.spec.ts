import { describe, expect, it } from 'vitest';
import { indexToggl, togglKeyString } from './fixtures.mts';
import {
  EARLIEST_LEAVE,
  legacyDocuments,
  localMidnight,
  OLD_NON_FINITE_DATE,
  ssoBody,
  syntheticFixtureSet,
  togglFixtures,
} from './synthetic.mts';

describe('synthetic dataset (MIG-03)', () => {
  it('stores leave dates as local midnight in Europe/Bratislava (CET / CEST)', () => {
    expect(localMidnight('2024-03-11')).toBe('2024-03-10T23:00:00.000Z');
    expect(localMidnight('2024-07-15')).toBe('2024-07-14T22:00:00.000Z');
  });

  it('produces old-shaped documents with Extended JSON ids and dates', () => {
    const { users, leaves } = legacyDocuments();
    expect(users[0]).toMatchObject({
      _id: { $oid: expect.stringMatching(/^[0-9a-f]{24}$/) as unknown },
      degrees: '',
      address: '',
      approved: true,
      __v: 0,
    });
    const typeless = leaves.find(
      (l) => (l as { id: string }).id === 'l-i-01',
    ) as Record<string, unknown>;
    expect(typeless.type).toBeUndefined();
    expect(typeless.startDate).toEqual({ $date: '2024-04-07T22:00:00.000Z' });
    const ids = leaves.map((l) => (l as { _id: { $oid: string } })._id.$oid);
    expect([...ids].sort()).toEqual(ids); // insertion order = _id order
    expect(EARLIEST_LEAVE).toBe('2024-01-15');
  });

  it('lists the SSO users in the meta API shape', () => {
    const body = ssoBody() as { name: string; keys: { key: string }[] }[];
    expect(body.filter((u) => u.name === 'Eva')).toHaveLength(2);
    expect(
      body.find((u) => u.name === 'Cyril Čierny')!.keys.map((k) => k.key),
    ).not.toContain('togglUserId');
  });

  it('generates unique Toggl keys with chained pages', () => {
    const fixtures = togglFixtures([{ year: 2024, month: 3 }]);
    expect(() => indexToggl(fixtures)).not.toThrow();
    const anna = fixtures.filter((f) => f.key.userIds[0] === 20);
    expect(anna.map((f) => f.key.firstRowNumber)).toEqual([null, 3, 5]);
    expect(
      anna.map((f) => f.response.headers?.['X-Next-Row-Number'] ?? null),
    ).toEqual(['3', '5', null]);
    const filip = fixtures.filter((f) => f.key.userIds[0] === null);
    expect(filip).toHaveLength(1);
    expect(filip[0]!.response.body).toEqual([]);
    // Non-employee Boris and Cyril (no workspace) get no Toggl calls.
    expect(fixtures.every((f) => f.key.userIds[0] !== 7)).toBe(true);
  });

  it('adds the extra ranges for every employee with a workspace', () => {
    const set = syntheticFixtureSet(
      [],
      [{ startDate: OLD_NON_FINITE_DATE, endDate: OLD_NON_FINITE_DATE }],
    );
    expect(set.toggl).toHaveLength(7);
    expect(new Set(set.toggl.map((f) => togglKeyString(f.key))).size).toBe(7);
  });
});
