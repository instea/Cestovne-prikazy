import { describe, expect, it } from 'vitest';
import type { Finding, MigrationResult } from './legacy-mapping';
import {
  buildReport,
  exitCodeFor,
  redactDetails,
  renderDecisionsCsv,
  renderMarkdown,
} from './report';

const finding = (over: Partial<Finding>): Finding => ({
  severity: 'info',
  code: 'LEAVE_NUMDAYS_CHANGED',
  collection: 'leaves',
  sourceObjectId: 'abc',
  recordId: 'L1',
  message: 'Leave numDays recomputed',
  details: { old: 2, new: 1 },
  action: 'migrated',
  ...over,
});

const result = (findings: Finding[]): MigrationResult => ({
  users: [],
  placeholderUserIds: [],
  leaves: [],
  findings,
  source: { users: 3, leaves: 4 },
  skipped: { users: 1, leaves: 1 },
  droppedFields: { degreesNonEmpty: 1, addressNonEmpty: 0 },
});

const meta = {
  startedAt: new Date('2026-11-06T10:00:00.000Z'),
  finishedAt: new Date('2026-11-06T10:00:05.000Z'),
  dryRun: true,
  timezone: 'Europe/Bratislava',
};

const findings = [
  finding({}),
  finding({
    severity: 'error',
    code: 'USER_DUPLICATE_EMAIL',
    collection: 'users',
    recordId: 'g-1',
    message: 'Several source users have this email',
    details: { email: 'jana.nova@instea.co' },
    action: 'skipped',
  }),
  finding({
    severity: 'warning',
    code: 'USER_PLACEHOLDER_CREATED',
    collection: 'users',
    sourceObjectId: null,
    recordId: 'X1',
    message: 'placeholder, "quoted"',
    details: { leaveIds: ['L1'] },
    action: 'placeholder-created',
  }),
];

describe('buildReport', () => {
  it('has the MIG-01 report.json shape', () => {
    const report = buildReport(result(findings), meta);
    expect(Object.keys(report)).toEqual([
      'startedAt',
      'finishedAt',
      'dryRun',
      'timezone',
      'source',
      'migrated',
      'skipped',
      'droppedFields',
      'findingsByCode',
      'findings',
    ]);
    expect(report).toMatchObject({
      startedAt: '2026-11-06T10:00:00.000Z',
      finishedAt: '2026-11-06T10:00:05.000Z',
      dryRun: true,
      migrated: { users: 0, placeholderUsers: 0, leaves: 0 },
      findingsByCode: {
        LEAVE_NUMDAYS_CHANGED: 1,
        USER_DUPLICATE_EMAIL: 1,
        USER_PLACEHOLDER_CREATED: 1,
      },
    });
    expect(Object.keys(report.findings[0]!)).toEqual([
      'severity',
      'code',
      'collection',
      'sourceObjectId',
      'recordId',
      'message',
      'details',
      'action',
    ]);
  });
});

describe('exitCodeFor', () => {
  it('is 3 with any error, else 0', () => {
    expect(exitCodeFor({ findings })).toBe(3);
    expect(exitCodeFor({ findings: [findings[0]!, findings[2]!] })).toBe(0);
    expect(exitCodeFor({ findings: [] })).toBe(0);
  });
});

describe('renderMarkdown', () => {
  const md = renderMarkdown(buildReport(result(findings), meta));

  it('contains no email addresses', () => {
    expect(md).not.toMatch(/@/);
    expect(md).toContain('[redacted]');
  });

  it('lists errors first, then warnings, then info', () => {
    const order = [
      'USER_DUPLICATE_EMAIL',
      'USER_PLACEHOLDER_CREATED',
      'LEAVE_NUMDAYS_CHANGED',
    ];
    const idx = order.map((c) => md.indexOf(`## ${c}`));
    expect(idx.every((i) => i > 0)).toBe(true);
    expect([...idx].sort((a, b) => a - b)).toEqual(idx);
  });

  it('shows counts', () => {
    expect(md).toContain('| Source | 3 | 4 |');
  });

  it('says so when there are no findings', () => {
    expect(renderMarkdown(buildReport(result([]), meta))).toContain(
      'No findings.',
    );
  });
});

describe('redactDetails', () => {
  it('masks emails anywhere and name keys', () => {
    expect(
      redactDetails({ firstName: 'Jana', note: 'mail a.b@x.co now' }),
    ).toBe('{"firstName":"[redacted]","note":"mail [email] now"}');
    expect(redactDetails(null)).toBe('');
  });
});

describe('renderDecisionsCsv', () => {
  it('pre-fills every error and warning, errors first', () => {
    expect(renderDecisionsCsv(buildReport(result(findings), meta))).toBe(
      'code,recordId,decision,decidedBy,note\n' +
        'USER_DUPLICATE_EMAIL,g-1,,,\n' +
        'USER_PLACEHOLDER_CREATED,X1,,,\n',
    );
  });
});
