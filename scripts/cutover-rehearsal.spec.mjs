import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  decidedCodes,
  goNoGo,
  main,
  manifestPiece,
  oldAppJwt,
  parseOptions,
} from './cutover-rehearsal.mjs';

// MIG-04: helpers of the local cutover rehearsal (scripts/cutover-rehearsal.sh).

const report = (over = {}) => ({
  dryRun: false,
  source: { users: 3, leaves: 5 },
  migrated: { users: 3, placeholderUsers: 1, leaves: 5 },
  skipped: { users: 0, leaves: 0 },
  findingsByCode: { USER_PLACEHOLDER_CREATED: 1, LEAVE_TYPE_DEFAULTED: 2 },
  findings: [
    { severity: 'warning', code: 'USER_PLACEHOLDER_CREATED' },
    { severity: 'info', code: 'LEAVE_TYPE_DEFAULTED' },
    { severity: 'info', code: 'LEAVE_TYPE_DEFAULTED' },
  ],
  ...over,
});

const failed = (result) =>
  result.checks.filter((c) => !c.ok).map((c) => c.name);

describe('goNoGo (MIG-04 step 12)', () => {
  it('is GO for exit 0, no errors, matching counts and the dry run codes', () => {
    const result = goNoGo(report(), {
      exitCode: 0,
      dryRun: report({ dryRun: true }),
      decided: new Set(['USER_PLACEHOLDER_CREATED']),
    });
    expect(result.ok).toBe(true);
  });

  it('is NO-GO for an exit code other than 0', () => {
    expect(failed(goNoGo(report(), { exitCode: 3 }))).toEqual([
      'migration exit code 0',
    ]);
  });

  it('is NO-GO for an error finding', () => {
    const r = report({
      findings: [{ severity: 'error', code: 'LEAVE_END_BEFORE_START' }],
    });
    expect(failed(goNoGo(r))).toEqual(['0 error findings']);
  });

  it('is NO-GO when migrated + skipped differs from source', () => {
    const r = report({
      migrated: { users: 2, placeholderUsers: 0, leaves: 5 },
    });
    expect(failed(goNoGo(r))).toEqual(['users: migrated + skipped = source']);
  });

  it('is NO-GO for an undecided warning code', () => {
    expect(failed(goNoGo(report(), { decided: new Set() }))).toEqual([
      'every warning code decided (decisions.csv)',
    ]);
  });

  it('is NO-GO when the run has other codes than the dry run, or is a dry run', () => {
    const dry = report({ dryRun: true, findingsByCode: { X: 1 } });
    expect(failed(goNoGo(report(), { dryRun: dry }))).toEqual([
      'same finding codes as the dry run',
    ]);
    expect(failed(goNoGo(report({ dryRun: true })))).toEqual([
      'not a dry-run report',
    ]);
  });
});

describe('decidedCodes', () => {
  it('collects codes with a non-empty decision, skipping the header', () => {
    const csv =
      'code,recordId,decision,decidedBy,note\n' +
      'USER_PLACEHOLDER_CREATED,x,accept,PO,\n' +
      'LEAVE_STATE_DEFAULTED,y,,,\n';
    expect([...decidedCodes(csv)]).toEqual(['USER_PLACEHOLDER_CREATED']);
  });
});

describe('oldAppJwt', () => {
  it('signs an HS256 token with the old app key and the user id as sub', () => {
    const token = oldAppJwt('1001', 'k3y', Date.UTC(2026, 0, 1));
    const [h, p, s] = token.split('.');
    expect(JSON.parse(Buffer.from(h, 'base64url').toString())).toEqual({
      alg: 'HS256',
      typ: 'JWT',
    });
    expect(JSON.parse(Buffer.from(p, 'base64url').toString()).sub).toBe('1001');
    expect(s).toBe(
      createHmac('sha256', 'k3y').update(`${h}.${p}`).digest('base64url'),
    );
  });
});

describe('manifest pieces and CLI', () => {
  it('reads the committed Job script, init.js and mongo image', () => {
    expect(manifestPiece('job-script')).toContain(
      'node dist/migration/migrate-legacy.js "$@" --report-dir "$dir"',
    );
    expect(manifestPiece('rs-init-js')).toContain('rs.initiate');
    expect(manifestPiece('mongo-image')).toMatch(/^mongo:8\.0@sha256:/);
  });

  it('parses --name value pairs and refuses a missing value', () => {
    expect(parseOptions(['a.json', '--exit-code', '0'])).toEqual({
      options: { 'exit-code': '0' },
      positional: ['a.json'],
    });
    expect(() => parseOptions(['--decisions'])).toThrow('needs a value');
  });

  it('exits 2 on usage errors', async () => {
    expect(await main(['nope'])).toBe(2);
    expect(await main(['manifest', 'nope'])).toBe(2);
  });
});
