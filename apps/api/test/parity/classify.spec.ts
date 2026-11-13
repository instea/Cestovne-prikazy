import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  APPROVED_CHANGES,
  type ClassifyContext,
  classify,
  type ClassifyInput,
  corsNote,
  DIFF_CLASSES,
  type LeavePrediction,
  EMPTY_CONTEXT,
  statusOf,
} from './classify.mts';
import type { AppResponse, Diff, OutgoingRequest } from './compare.mts';
import type { MockRecord } from './mock-server.mts';
import { request } from './months.mts';

const ok = (body = '{}', acao: string | null = null): AppResponse => ({
  kind: 'response',
  status: 200,
  contentType: 'application/json; charset=utf-8',
  acao,
  body,
  ms: 1,
});
const res = (status: number, body: string): AppResponse => ({
  kind: 'response',
  status,
  contentType: 'application/json; charset=utf-8',
  acao: null,
  body,
  ms: 1,
});
const timeout: AppResponse = { kind: 'timeout', ms: 120_000 };

const leaveDiff = (
  name: string,
  day: number,
  old: string,
  now: string,
): Diff => ({
  kind: 'value',
  path: `attendence.${name}.days.${day - 1}.leave`,
  old,
  new: now,
});

const record = (
  app: string,
  userIds: unknown[],
  extra: Partial<MockRecord> = {},
): MockRecord => ({
  seq: 1,
  app,
  service: 'toggl',
  method: 'POST',
  path: '/reports/api/v3/workspace/111/search/time_entries',
  auth: 'Basic x',
  body: { start_date: '2024-03-01', end_date: '2024-03-31', user_ids: userIds },
  status: 200,
  unmatched: false,
  ...extra,
});

function input(
  partial: Partial<ClassifyInput> & { diffs: Diff[] },
): ClassifyInput {
  return {
    request: request('2024', '3'),
    oldRes: ok(),
    newRes: ok(),
    oldRecords: [],
    newRecords: [],
    context: EMPTY_CONTEXT,
    ...partial,
  };
}

const ctx = (c: Partial<ClassifyContext>): ClassifyContext => ({
  ...EMPTY_CONTEXT,
  ...c,
});
const classes = (diffs: Diff[]) => diffs.map((d) => d.class ?? null);

describe('classify (MIG-03 expected-diff classes)', () => {
  it('leaves an unexplained diff unclassified (fails the run)', () => {
    const out = classify(input({ diffs: [leaveDiff('Anna', 4, 'D8', 'D7')] }));
    expect(classes(out)).toEqual([null]);
    expect(statusOf(out)).toBe('DIFF');
  });

  it('excuses a leave diff only when both values are exactly the predicted ones', () => {
    // Prediction per (name, date), as cells.mts would simulate it.
    const predictions: Record<string, LeavePrediction> = {
      'Anna 2025-09-01': { old: '', new: 'D8', reason: 'HOLIDAY_REFRESH' },
      'Dana 2025-09-02': {
        old: 'D8, D8',
        new: 'D8',
        reason: 'LEAVE_YEAR_CHECK',
      },
      'Ivan 2025-09-03': { old: 'I', new: 'D8', reason: 'MIGRATION_REPORT' },
      'Eva 2025-09-04': { old: '', new: 'D8', reason: null },
    };
    const out = classify(
      input({
        request: request('2025', '9'),
        diffs: [
          leaveDiff('Anna', 1, '', 'D8'),
          leaveDiff('Dana', 2, 'D8, D8', 'D8'),
          leaveDiff('Ivan', 3, 'I', 'D8'),
          // Right place, wrong value: still unexplained.
          leaveDiff('Anna', 1, '', 'PN'),
          leaveDiff('Dana', 2, 'D8, D8, D8', 'D8'),
          // Predicted values but no approved reason.
          leaveDiff('Eva', 4, '', 'D8'),
          // No prediction at all.
          leaveDiff('Filip', 5, '', 'D8'),
        ],
        context: ctx({
          predictLeave: (name, date) => predictions[`${name} ${date}`] ?? null,
        }),
      }),
    );
    expect(classes(out)).toEqual([
      'HOLIDAY_REFRESH',
      'LEAVE_YEAR_CHECK',
      'MIGRATION_REPORT',
      null,
      null,
      null,
      null,
    ]);
  });

  it('HANG_FIX: old timed out in a hang month, new answered 200', () => {
    const out = classify(
      input({
        request: request('2024', '6'),
        oldRes: timeout,
        newRes: ok(),
        diffs: [
          { kind: 'outcome', path: '$', old: 'timeout', new: '200' },
          { kind: 'request-new-only', path: '$requests.new.3', new: {} },
        ],
        context: ctx({ hangMonths: new Set(['2024-06']) }),
      }),
    );
    expect(classes(out)).toEqual(['HANG_FIX', 'HANG_FIX']);
    expect(statusOf(out)).toBe('EXPECTED_DIFF');
  });

  it('HANG_FIX does not cover a timeout in another month', () => {
    const out = classify(
      input({
        request: request('2024', '7'),
        oldRes: timeout,
        diffs: [{ kind: 'outcome', path: '$', old: 'timeout', new: '200' }],
        context: ctx({ hangMonths: new Set(['2024-06']) }),
      }),
    );
    expect(classes(out)).toEqual([null]);
  });

  it('UNEXPECTED_ERROR_500: old hung, new answers the generic 500', () => {
    const out = classify(
      input({
        oldRes: timeout,
        newRes: res(500, '{"message":"Internal server error"}'),
        diffs: [{ kind: 'outcome', path: '$', old: 'timeout', new: '500' }],
      }),
    );
    expect(classes(out)).toEqual(['UNEXPECTED_ERROR_500']);
  });

  it('UNEXPECTED_ERROR_500 does not cover a HANG_FIX month (new must answer 200 there)', () => {
    const out = classify(
      input({
        request: request('2024', '6'),
        oldRes: timeout,
        newRes: res(500, '{"message":"Internal server error"}'),
        diffs: [{ kind: 'outcome', path: '$', old: 'timeout', new: '500' }],
        context: ctx({ hangMonths: new Set(['2024-06']) }),
      }),
    );
    expect(classes(out)).toEqual([null]);
    expect(statusOf(out)).toBe('DIFF');
  });

  it('NO_TOGGL_ID_SKIPPED: old-only Toggl request with user_ids [null]', () => {
    const nullReq: OutgoingRequest = {
      service: 'toggl',
      method: 'POST',
      path: '/x',
      auth: null,
      body: { user_ids: [null] },
    };
    const other: OutgoingRequest = { ...nullReq, body: { user_ids: [20] } };
    const out = classify(
      input({
        diffs: [
          { kind: 'request-old-only', path: '$requests.old.2', old: nullReq },
          { kind: 'request-old-only', path: '$requests.old.3', old: other },
        ],
      }),
    );
    expect(classes(out)).toEqual(['NO_TOGGL_ID_SKIPPED', null]);
  });

  it('NO_TOGGL_ID_SKIPPED: old 500 Toggl caused by the [null] request, new 200', () => {
    const out = classify(
      input({
        oldRes: res(
          500,
          '{"message":"Cannot get data from Toggl, try again later."}',
        ),
        newRes: ok('{"start":"2024-03-01"}'),
        oldRecords: [record('old', [null], { status: 400 })],
        diffs: [
          { kind: 'status', path: '$status', old: 500, new: 200 },
          { kind: 'missing', path: 'message', old: 'Cannot…' },
        ],
      }),
    );
    expect(classes(out)).toEqual([
      'NO_TOGGL_ID_SKIPPED',
      'NO_TOGGL_ID_SKIPPED',
    ]);
  });

  it.each([
    ['Infinity', '1'],
    ['1e20', '3'],
    ['2024', '1e300'],
  ])('NON_FINITE_PARAM: %s/%s → new 400 with the old text', (y, m) => {
    const out = classify(
      input({
        request: request(y, m),
        oldRes: ok(
          '{"start":"Invalid date","end":"Invalid date","attendence":{}}',
        ),
        newRes: res(
          400,
          y === '2024'
            ? '{"message":"Month is not a number."}'
            : '{"message":"Year is not a number."}',
        ),
        diffs: [{ kind: 'status', path: '$status', old: 200, new: 400 }],
      }),
    );
    expect(classes(out)).toEqual(['NON_FINITE_PARAM']);
  });

  it('NON_FINITE_PARAM needs the old 400 text from the new app', () => {
    const out = classify(
      input({
        request: request('Infinity', '1'),
        newRes: res(400, '{"statusCode":400}'),
        diffs: [{ kind: 'status', path: '$status', old: 200, new: 400 }],
      }),
    );
    expect(classes(out)).toEqual([null]);
  });

  it('TIMEOUT_REDIRECT_LIMIT: injected latency/redirects, new answers the old upstream 500', () => {
    const out = classify(
      input({
        newRes: res(
          500,
          '{"message":"Cannot get data from SSO, try again later."}',
        ),
        newRecords: [
          record('new', [20], { service: 'sso', injected: 'delay' }),
        ],
        diffs: [{ kind: 'status', path: '$status', old: 200, new: 500 }],
      }),
    );
    expect(classes(out)).toEqual(['TIMEOUT_REDIRECT_LIMIT']);
  });

  it('CORS_HEADERS: old wildcard, new none (a note, not a diff)', () => {
    expect(corsNote(ok('{}', '*'), ok())).toMatchObject({
      class: 'CORS_HEADERS',
    });
    expect(corsNote(ok(), ok())).toBeNull();
    expect(corsNote(ok('{}', '*'), ok('{}', 'https://x'))).toMatchObject({
      class: undefined,
    });
  });

  it('statusOf: EQUAL without diffs, EXPECTED_DIFF when all are classified', () => {
    expect(statusOf([])).toBe('EQUAL');
    expect(
      statusOf([{ kind: 'value', path: 'x', class: 'HOLIDAY_REFRESH' }]),
    ).toBe('EXPECTED_DIFF');
  });
});

describe('approved changes (functional spec §10)', () => {
  const doc = (path: string) =>
    readFileSync(join(__dirname, '../../../..', path), 'utf8');
  const spec = doc('docs/functional-spec.md');
  const changes = spec.slice(spec.indexOf('## 10. Changes vs the old system'));
  const rows = new Map(
    [...changes.matchAll(/^\| (\d+) \| ([^|]+) \|/gm)].map((m) => [
      Number(m[1]),
      m[2]!.trim(),
    ]),
  );

  it('every class names at least one existing §10 row', () => {
    for (const cls of DIFF_CLASSES) {
      const nums = APPROVED_CHANGES[cls];
      expect(nums.length, cls).toBeGreaterThan(0);
      for (const n of nums) expect(rows.has(n), `${cls} → #${n}`).toBe(true);
    }
  });

  it('the README class table shows the same rows', () => {
    const readme = doc('apps/api/test/parity/README.md');
    for (const cls of DIFF_CLASSES) {
      const row = readme.split('\n').find((l) => l.startsWith(`| \`${cls}\``));
      const cited = [...(row ?? '').matchAll(/#(\d+)/g)].map((m) =>
        Number(m[1]),
      );
      expect(cited, cls).toEqual(APPROVED_CHANGES[cls]);
    }
  });
});
