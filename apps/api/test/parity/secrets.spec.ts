import { describe, expect, it } from 'vitest';
import type { FixtureSet } from './fixtures.mts';
import { scanFixtureSet } from './secrets.mts';
import { syntheticFixtureSet } from './synthetic.mts';

const clean = (): FixtureSet => syntheticFixtureSet([{ year: 2024, month: 3 }]);

describe('recorded fixture secret scan (MIG-03)', () => {
  it('accepts placeholders only', () => {
    expect(scanFixtureSet(clean())).toEqual([]);
  });

  it('refuses a real togglApiToken in the SSO answer', () => {
    const set = clean();
    (
      set.sso.response.body as { keys: { key: string; value: string }[] }[]
    )[0]!.keys.push({
      key: 'togglApiToken',
      value: '1a2b3c4d5e6f',
    });
    expect(scanFixtureSet(set)).toEqual([
      'sso.response.body[0].keys[5]: togglApiToken is not a placeholder',
    ]);
  });

  it('refuses real tokens in Toggl keys, SSO credentials and Authorization values', () => {
    const set = clean();
    set.toggl[0]!.key.token = 'real-token';
    set.sso.password = 'hunter2';
    set.toggl[1]!.response.headers = { Authorization: 'Basic dXNlcjpwYXNz' };
    expect(scanFixtureSet(set)).toEqual([
      'sso.password: not a placeholder',
      'toggl[0].key.token: not a placeholder',
      'toggl[1].response.headers.Authorization: not a placeholder',
      'toggl[1].response.headers.Authorization: looks like an Authorization value',
    ]);
  });
});
