import { describe, expect, it } from 'vitest';
import {
  type AppResponse,
  diffBodies,
  diffJson,
  diffRequests,
  diffResponses,
  isOrderOnly,
  jsonEqual,
  type OutgoingRequest,
} from './compare.mts';

const res = (
  status: number,
  body: string,
  contentType = 'application/json; charset=utf-8',
): AppResponse => ({
  kind: 'response',
  status,
  contentType,
  acao: null,
  body,
  ms: 1,
});

const toggl = (userIds: unknown[], first?: number): OutgoingRequest => ({
  service: 'toggl',
  method: 'POST',
  path: '/reports/api/v3/workspace/111/search/time_entries',
  auth: 'Basic x',
  body: {
    start_date: '2024-03-01',
    end_date: '2024-03-31',
    user_ids: userIds,
    ...(first ? { first_row_number: first } : {}),
  },
});
const sso: OutgoingRequest = {
  service: 'sso',
  method: 'GET',
  path: '/sso',
  auth: 'Basic s',
  body: undefined,
};

describe('diffBodies (MIG-03 steps 2–3)', () => {
  it('byte-equal bodies have no diff', () => {
    expect(diffBodies('{"a":1}', '{"a":1}')).toEqual([]);
  });

  it('reports a key-order-only change as order-only', () => {
    const diffs = diffBodies(
      '{"start":"2024-03-01","end":"2024-03-31","attendence":{"Boris":1,"Anna":2}}',
      '{"start":"2024-03-01","end":"2024-03-31","attendence":{"Anna":2,"Boris":1}}',
    );
    expect(diffs).toEqual([
      {
        kind: 'order',
        path: 'attendence',
        old: ['Boris', 'Anna'],
        new: ['Anna', 'Boris'],
      },
    ]);
    expect(isOrderOnly(diffs)).toBe(true);
  });

  it('reports number formatting as a format diff', () => {
    const diffs = diffBodies('{"total":1.0}', '{"total":1}');
    expect(diffs).toHaveLength(1);
    expect(diffs[0]!.kind).toBe('format');
    expect(isOrderOnly(diffs)).toBe(false);
  });

  it('reports a changed float as a value diff', () => {
    expect(
      diffBodies('{"total":0.8333333333333334}', '{"total":0.83}'),
    ).toEqual([
      { kind: 'value', path: 'total', old: 0.8333333333333334, new: 0.83 },
    ]);
  });

  it('reports value, missing and extra entries by path', () => {
    const diffs = diffBodies(
      '{"attendence":{"Anna":{"days":[{"logged_time":0,"leave":"D8"},{"logged_time":0,"leave":""}],"total":0,"contractType":"TPP"}}}',
      '{"attendence":{"Anna":{"days":[{"logged_time":0,"leave":"D7"}],"total":0,"x":1}}}',
    );
    expect(diffs).toEqual([
      {
        kind: 'value',
        path: 'attendence.Anna.days.0.leave',
        old: 'D8',
        new: 'D7',
      },
      {
        kind: 'missing',
        path: 'attendence.Anna.days.1',
        old: { logged_time: 0, leave: '' },
      },
      { kind: 'missing', path: 'attendence.Anna.contractType', old: 'TPP' },
      { kind: 'extra', path: 'attendence.Anna.x', new: 1 },
    ]);
  });

  it('compares non-JSON bodies as bytes', () => {
    expect(diffBodies('', 'x')).toEqual([
      { kind: 'body-bytes', path: '$', old: '', new: 'x' },
    ]);
  });

  it('jsonEqual ignores key order only', () => {
    expect(
      jsonEqual({ a: 1, b: [1, { c: 2 }] }, { b: [1, { c: 2 }], a: 1 }),
    ).toBe(true);
    expect(jsonEqual([1, 2], [2, 1])).toBe(false);
    expect(jsonEqual({ a: null }, { a: undefined })).toBe(false);
  });

  it('diffJson treats arrays by index', () => {
    expect(diffJson([1], [1, 2])).toEqual([
      { kind: 'extra', path: '1', new: 2 },
    ]);
  });
});

describe('diffResponses (MIG-03 step 1)', () => {
  it('compares status, content type and body', () => {
    expect(diffResponses(res(200, '{}'), res(400, '{}', 'text/html'))).toEqual([
      { kind: 'status', path: '$status', old: 200, new: 400 },
      {
        kind: 'content-type',
        path: '$header.content-type',
        old: 'application/json; charset=utf-8',
        new: 'text/html',
      },
    ]);
  });

  it('reports a timeout against a response as an outcome diff', () => {
    const diffs = diffResponses(
      { kind: 'timeout', ms: 120_000 },
      res(200, '{}'),
    );
    expect(diffs).toEqual([
      {
        kind: 'outcome',
        path: '$',
        old: 'timeout after 120000 ms',
        new: '200 {}',
      },
    ]);
  });
});

describe('diffRequests (MIG-03 step 4)', () => {
  it('equal ordered lists have no diff', () => {
    expect(diffRequests([sso, toggl([20])], [sso, toggl([20])])).toEqual([]);
  });

  it('reports requests only one app sent', () => {
    expect(
      diffRequests([sso, toggl([null]), toggl([20])], [sso, toggl([20])]),
    ).toEqual([
      { kind: 'request-old-only', path: '$requests.old.1', old: toggl([null]) },
    ]);
    expect(diffRequests([sso], [sso, toggl([20], 4)])).toEqual([
      {
        kind: 'request-new-only',
        path: '$requests.new.1',
        new: toggl([20], 4),
      },
    ]);
  });

  it('reports the same requests in another order once', () => {
    const diffs = diffRequests(
      [sso, toggl([20]), toggl([35])],
      [sso, toggl([35]), toggl([20])],
    );
    expect(diffs).toHaveLength(1);
    expect(diffs[0]!.kind).toBe('request-order');
  });

  it('compares the body with its key order and the auth header', () => {
    const reordered: OutgoingRequest = {
      ...toggl([20]),
      body: {
        user_ids: [20],
        start_date: '2024-03-01',
        end_date: '2024-03-31',
      },
    };
    expect(diffRequests([toggl([20])], [reordered]).map((d) => d.kind)).toEqual(
      ['request-old-only', 'request-new-only'],
    );
    expect(diffRequests([sso], [{ ...sso, auth: 'Basic y' }])).toHaveLength(2);
  });
});
