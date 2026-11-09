import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parse } from 'yaml';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { parseDirectory } from '../../src/attendance/sso/sso.client';
import {
  buildSearchBody,
  togglAuthorization,
} from '../../src/attendance/toggl/toggl.client';
import {
  type FixtureSet as RecordedSet,
  FixturePseudonymizer,
  OLD_NON_FINITE_DATE as RECORDED_NON_FINITE,
  PARITY_SSO_PASSWORD,
  PARITY_SSO_USERNAME,
  parityMonths,
} from '../../src/migration/anonymize/parity-fixtures';
import {
  NON_FINITE_RANGE,
  recordFixtures,
  togglTargets,
} from '../../src/migration/anonymize/parity-recorder';
import { Pseudonymizer } from '../../src/migration/anonymize/pseudonym';
import { basicAuth } from '../mocks/contract.mts';
import { fakeRealServices, REAL } from '../support/recording-fake';
import type { FixtureSet } from './fixtures.mts';
import {
  type RunningMock,
  startMockServer,
  UNMATCHED_STATUS,
} from './mock-server.mts';
import { daysOf, effectiveMonths, parityRequests } from './months.mts';
import { loadRecordedFixtures } from './run.mts';
import { scanFixtureSet } from './secrets.mts';
import { OLD_NON_FINITE_DATE, PLACEHOLDER } from './synthetic.mts';

/**
 * MIG-02 ↔ MIG-03: fixtures recorded and pseudonymized by
 * `src/migration/anonymize` are what the parity harness replays — same
 * format, pass the secret scan, carry the compose file's SSO credentials,
 * cover the harness month set, and every request the apps send from the
 * pseudonymized SSO directory matches a fixture (no 401, no 599).
 */

const compose = parse(
  readFileSync(join(__dirname, 'docker-compose.parity.yml'), 'utf8'),
) as { 'x-common-env': Record<string, string> };

const NOW = new Date('2024-03-20T12:00:00Z');
const EARLIEST = '2024-02';

async function pseudonymizedSet(): Promise<{
  raw: RecordedSet;
  out: RecordedSet;
}> {
  const raw = await recordFixtures({
    ssoUri: REAL.ssoUri,
    ssoUsername: REAL.ssoUsername,
    ssoPassword: REAL.ssoPassword,
    togglBaseUrl: REAL.togglBaseUrl,
    months: parityMonths(EARLIEST, NOW),
    extraRanges: [NON_FINITE_RANGE],
    fetch: fakeRealServices(),
  });
  const out = new FixturePseudonymizer(
    new Pseudonymizer('parity-secret-'.padEnd(40, 'x')),
  ).fixtureSet(raw);
  return { raw, out };
}

describe('recorded fixtures fit the harness', () => {
  it('use the SSO credentials the compose file gives both apps', () => {
    expect(compose['x-common-env']).toMatchObject({
      SSO_USERNAME: PARITY_SSO_USERNAME,
      SSO_PASSWORD: PARITY_SSO_PASSWORD,
    });
    expect([PLACEHOLDER.ssoUsername, PLACEHOLDER.ssoPassword]).toEqual([
      PARITY_SSO_USERNAME,
      PARITY_SSO_PASSWORD,
    ]);
    expect(RECORDED_NON_FINITE).toBe(OLD_NON_FINITE_DATE);
  });

  it.each([
    ['2017-11', '2026-11-09'],
    ['2026-11', '2026-11-09'],
    ['2026-12', '2026-12-31'],
    [null, '2025-01-15'],
  ])('cover the harness months for earliest %s, now %s', (earliest, now) => {
    const at = new Date(`${now}T12:00:00Z`);
    const key = (m: { year: number; month: number }) => `${m.year}-${m.month}`;
    const harness = effectiveMonths(
      parityRequests(earliest ? `${earliest}-01` : null, at),
    );
    expect(parityMonths(earliest, at).map(key).sort()).toEqual(
      harness.map(key).sort(),
    );
  });

  it('are the harness FixtureSet type and pass its secret scan', async () => {
    const { raw, out } = await pseudonymizedSet();
    const set: FixtureSet = out; // compile-time format check
    expect(scanFixtureSet(set)).toEqual([]);
    expect(scanFixtureSet(raw).length).toBeGreaterThan(0);
  });

  describe('replayed by the mock', () => {
    let mock: RunningMock;
    let set: RecordedSet;

    beforeAll(async () => {
      set = (await pseudonymizedSet()).out;
      mock = await startMockServer({
        controlPort: 0,
        apps: [{ name: 'new', port: 0 }],
        host: '127.0.0.1',
        fixtures: set,
      });
    });

    afterAll(() => mock.close());

    it('answers SSO with the compose credentials, 401 otherwise', async () => {
      const url = `http://127.0.0.1:${mock.ports.new}/sso`;
      const env = compose['x-common-env'];
      const ok = await fetch(url, {
        headers: {
          Authorization: basicAuth(env.SSO_USERNAME!, env.SSO_PASSWORD!),
        },
      });
      expect(ok.status).toBe(200);
      expect(await ok.json()).toEqual(set.sso.response.body);
      const real = await fetch(url, {
        headers: {
          Authorization: basicAuth(REAL.ssoUsername, REAL.ssoPassword),
        },
      });
      expect(real.status).toBe(401);
    });

    it('matches every Toggl request the apps send for the parity months', async () => {
      const directory = parseDirectory(set.sso.response.body);
      const ranges = [
        ...parityMonths(EARLIEST, NOW).map((m) => {
          const days = daysOf(m.year, m.month);
          return { start: days[0]!, end: days.at(-1)! };
        }),
        { start: OLD_NON_FINITE_DATE, end: OLD_NON_FINITE_DATE },
      ];
      let sent = 0;
      for (const user of togglTargets(directory)) {
        const { togglWorkspaceId, togglUserId, togglApiToken } = user;
        for (const r of ranges) {
          let next: string | null = null;
          do {
            const body = buildSearchBody(
              { togglWorkspaceId, togglUserId, togglApiToken },
              r.start,
              r.end,
              next,
            );
            const res = await fetch(
              `http://127.0.0.1:${mock.ports.new}/reports/api/v3/workspace/${encodeURIComponent(String(togglWorkspaceId))}/search/time_entries`,
              {
                method: 'POST',
                headers: {
                  Authorization: togglAuthorization(togglApiToken),
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify(body),
              },
            );
            sent++;
            expect(res.status, JSON.stringify(body)).not.toBe(UNMATCHED_STATUS);
            expect(res.status).not.toBe(401);
            next = res.ok ? res.headers.get('x-next-row-number') : null;
            await res.arrayBuffer();
          } while (next);
        }
      }
      expect(sent).toBe(set.toggl.length);
      expect(mock.records.filter((r) => r.unmatched)).toEqual([]);
    });
  });

  describe('--fixtures', () => {
    let dir: string;
    beforeAll(async () => {
      dir = await mkdtemp(join(tmpdir(), 'leaves-fixtures-'));
    });
    afterAll(() => rm(dir, { recursive: true, force: true }));

    it('takes the recorder file or a directory, and refuses real secrets', async () => {
      const { raw, out } = await pseudonymizedSet();
      const file = join(dir, 'sso-toggl-fixtures-2024-03-20.json');
      await writeFile(file, JSON.stringify(out));
      expect(await loadRecordedFixtures(file)).toEqual(out);
      await writeFile(join(dir, 'sso.json'), JSON.stringify(out.sso));
      await writeFile(join(dir, 'toggl.json'), JSON.stringify(out.toggl));
      expect(await loadRecordedFixtures(dir)).toEqual(out);
      const rawFile = join(dir, 'raw.json');
      await writeFile(rawFile, JSON.stringify(raw));
      await expect(loadRecordedFixtures(rawFile)).rejects.toThrow(
        'Recorded fixtures contain secrets',
      );
    });
  });
});
