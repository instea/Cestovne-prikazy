import { describe, expect, it } from 'vitest';
import { migrationEnv, parseArgs, reportTimestamp, UsageError } from './runner';

describe('parseArgs', () => {
  it('defaults', () => {
    expect(parseArgs([])).toEqual({
      dryRun: false,
      replace: false,
      reportDir: undefined,
    });
  });

  it('reads all flags', () => {
    expect(
      parseArgs(['--dry-run', '--replace', '--report-dir', 'out']),
    ).toEqual({ dryRun: true, replace: true, reportDir: 'out' });
    expect(parseArgs(['--report-dir=x/y']).reportDir).toBe('x/y');
  });

  it.each([['--nope'], ['--report-dir'], ['--report-dir', '--dry-run']])(
    'rejects %j',
    (...argv) => {
      expect(() => parseArgs(argv)).toThrow(UsageError);
    },
  );
});

describe('migrationEnv', () => {
  it('requires LEGACY_MONGO_URL', () => {
    expect(() => migrationEnv({})).toThrow('LEGACY_MONGO_URL is required');
  });

  it('defaults MONGO_URL outside production and the timezone', () => {
    expect(
      migrationEnv({ LEGACY_MONGO_URL: 'mongodb://h/cestaky_legacy' }),
    ).toEqual({
      legacyMongoUrl: 'mongodb://h/cestaky_legacy',
      mongoUrl: 'mongodb://localhost:27017/cestaky',
      timezone: 'Europe/Bratislava',
    });
  });

  it('requires MONGO_URL in production', () => {
    expect(() =>
      migrationEnv({
        NODE_ENV: 'production',
        LEGACY_MONGO_URL: 'mongodb://h/l',
      }),
    ).toThrow('MONGO_URL is required');
  });

  it('validates the timezone', () => {
    expect(() =>
      migrationEnv({
        LEGACY_MONGO_URL: 'mongodb://h/l',
        DEFAULT_TIMEZONE: 'Mars/Base',
      }),
    ).toThrow(UsageError);
  });
});

describe('reportTimestamp', () => {
  it('is a safe directory name', () => {
    expect(reportTimestamp(new Date('2026-11-06T10:15:02.123Z'))).toBe(
      '2026-11-06T10-15-02Z',
    );
  });
});
