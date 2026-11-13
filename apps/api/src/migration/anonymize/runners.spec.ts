import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { fakeRealServices, REAL } from '../../../test/support/recording-fake';
import { UsageError } from '../runner';
import { anonymizeEnv, parseAnonymizeArgs } from './anonymize-runner';
import type { FixtureSet } from './parity-fixtures';
import {
  parseRecordArgs,
  recordEnv,
  runRecord,
  TOGGL_DEFAULT_BASE_URL,
} from './record-runner';

const SECRET = 'runner-secret-'.padEnd(40, 'x');

describe('anonymize-legacy CLI arguments and env', () => {
  it('parses flags', () => {
    expect(parseAnonymizeArgs([])).toEqual({
      replace: false,
      allowFindingDrift: false,
    });
    expect(parseAnonymizeArgs(['--replace', '--allow-finding-drift'])).toEqual({
      replace: true,
      allowFindingDrift: true,
    });
    expect(() => parseAnonymizeArgs(['--dry-run'])).toThrow(UsageError);
  });

  const env = {
    ANONYMIZE_SECRET: SECRET,
    LEGACY_MONGO_URL: 'mongodb://h/cestaky_legacy',
    ANONYMIZED_MONGO_URL: 'mongodb://h/cestaky',
  };

  it('refuses to run without the secret, or with a short one', () => {
    expect(() => anonymizeEnv({ ...env, ANONYMIZE_SECRET: undefined })).toThrow(
      /ANONYMIZE_SECRET is required/,
    );
    expect(() => anonymizeEnv({ ...env, ANONYMIZE_SECRET: 'short' })).toThrow(
      /at least 32/,
    );
  });

  it('requires both database URLs', () => {
    expect(() => anonymizeEnv({ ...env, LEGACY_MONGO_URL: '' })).toThrow(
      'LEGACY_MONGO_URL is required',
    );
    expect(() => anonymizeEnv({ ...env, ANONYMIZED_MONGO_URL: ' ' })).toThrow(
      'ANONYMIZED_MONGO_URL is required',
    );
  });

  it('defaults the timezone', () => {
    expect(anonymizeEnv(env)).toEqual({
      secret: SECRET,
      sourceUrl: env.LEGACY_MONGO_URL,
      targetUrl: env.ANONYMIZED_MONGO_URL,
      timezone: 'Europe/Bratislava',
    });
  });
});

describe('record-parity-fixtures CLI', () => {
  it('parses arguments', () => {
    const today = new Date('2026-11-09T10:00:00Z');
    expect(parseRecordArgs(['--earliest', '2017-11'], today)).toEqual({
      earliest: '2017-11',
      now: today,
      out: undefined,
      delayMs: 1000,
    });
    expect(
      parseRecordArgs([
        '--earliest',
        '2017-11',
        '--now',
        '2026-12-01',
        '--out',
        'f.json',
        '--delay-ms',
        '0',
      ]),
    ).toEqual({
      earliest: '2017-11',
      now: new Date('2026-12-01T12:00:00Z'),
      out: 'f.json',
      delayMs: 0,
    });
    expect(() => parseRecordArgs([])).toThrow('--earliest');
    expect(() =>
      parseRecordArgs(['--earliest', '2017-11', '--now', 'tomorrow']),
    ).toThrow('--now');
    expect(() => parseRecordArgs(['--earliest'])).toThrow('needs a value');
    expect(() =>
      parseRecordArgs(['--earliest', '2017-11', '--delay-ms', '-1']),
    ).toThrow('--delay-ms');
    expect(() => parseRecordArgs(['--x'])).toThrow('Unknown argument');
  });

  it('needs the secret and the SSO settings; Toggl defaults to the real API', () => {
    const env = {
      ANONYMIZE_SECRET: SECRET,
      SSO_URI: 'u',
      SSO_USERNAME: 'n',
      SSO_PASSWORD: 'p',
    };
    expect(recordEnv(env).togglBaseUrl).toBe(TOGGL_DEFAULT_BASE_URL);
    expect(() => recordEnv({ ...env, ANONYMIZE_SECRET: '' })).toThrow(
      'ANONYMIZE_SECRET',
    );
    expect(() => recordEnv({ ...env, SSO_PASSWORD: undefined })).toThrow(
      'SSO_PASSWORD is required',
    );
  });

  describe('runRecord', () => {
    let dir: string;
    beforeEach(async () => {
      dir = await mkdtemp(join(tmpdir(), 'leaves-record-'));
    });
    afterEach(() => rm(dir, { recursive: true, force: true }));

    it('writes only the pseudonymized set (mode 0600)', async () => {
      const out = join(dir, 'sso-toggl-fixtures.json');
      const lines: string[] = [];
      const code = await runRecord({
        earliest: '2026-10',
        now: new Date('2026-11-09T12:00:00Z'),
        out,
        delayMs: 0,
        secret: SECRET,
        ssoUri: REAL.ssoUri,
        ssoUsername: REAL.ssoUsername,
        ssoPassword: REAL.ssoPassword,
        togglBaseUrl: REAL.togglBaseUrl,
        fetch: fakeRealServices(),
        log: (l) => lines.push(l),
      });
      expect(code).toBe(0);
      const text = await readFile(out, 'utf8');
      const set = JSON.parse(text) as FixtureSet;
      expect(set.sso.username).toBe('PARITY_SSO_USER');
      expect(set.toggl.some((f) => f.key.startDate === '2026-12-01')).toBe(
        true,
      );
      expect(text).not.toContain(REAL.tokenJana);
      expect(text).not.toContain('Jana');
      expect((await stat(out)).mode & 0o777).toBe(0o600);
      expect(lines.at(-1)).toContain('--now 2026-11-09');
      expect(lines).toContain(
        'Email case collisions: 0 (every distinct SSO email keeps its own pseudonym)',
      );
    });
  });
});
