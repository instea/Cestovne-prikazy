import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Response } from 'supertest';
import { describe, expect, it } from 'vitest';
import { useHttpFakes } from '../mocks/http-fakes';
import { useTestApp } from '../support/app';
import { m2mAuth } from '../support/m2m';

/**
 * TST-04 attendance contract: `GET /api/attendence/:year/:month` bodies are
 * compared byte-for-byte with the golden files in `contract/attendance/`
 * (key order, number formatting, empty values). The worked example
 * (`worked-example.2024-03.json`) is checked by
 * `test/attendance/attendance-api.int-spec.ts` with its seeded leaves.
 *
 * Golden files change only by an explicit, reviewed update:
 * `UPDATE_GOLDEN=1 pnpm vitest run --project api-integration test/contract`
 * rewrites them; otherwise any difference fails.
 */
const fakes = useHttpFakes();
const ctx = useTestApp();

const GOLDEN_DIR = join(__dirname, 'attendance');
const JSON_TYPE = 'application/json; charset=utf-8';

function expectGolden(name: string, actual: string): void {
  const file = join(GOLDEN_DIR, name);
  if (process.env.UPDATE_GOLDEN === '1') writeFileSync(file, actual);
  expect(actual).toBe(readFileSync(file, 'utf8'));
}

const get = (path: string, auth = true) => {
  const req = ctx().request().get(path);
  return auth ? req.set('Authorization', m2mAuth()) : req;
};

function expectJsonGolden(res: Response, status: number, name: string) {
  expect(res.status).toBe(status);
  expect(res.headers['content-type']).toBe(JSON_TYPE);
  expectGolden(name, res.text);
}

describe('attendance JSON contract (golden files)', () => {
  it('empty SSO list', async () => {
    fakes.sso.serve([]);
    expectJsonGolden(
      await get('/api/attendence/2024/3'),
      200,
      'empty-sso.2024-03.json',
    );
  });

  it('month 13 (January of the next year, no leave codes)', async () => {
    fakes.toggl.servePages([[]]);
    expectJsonGolden(
      await get('/api/attendence/2024/13'),
      200,
      'month-13.2024-13.json',
    );
  });

  it('duplicate SSO names: one key, the later user, the first position', async () => {
    fakes.sso.serve('sso.duplicate-names.json');
    fakes.toggl.servePages([[]]);
    expectJsonGolden(
      await get('/api/attendence/2026/12'),
      200,
      'duplicate-names.2026-12.json',
    );
  });

  it('missing contractType: the key is omitted', async () => {
    fakes.sso.serve('sso.no-contract-type.json');
    fakes.toggl.servePages([[]]);
    expectJsonGolden(
      await get('/api/attendence/2026/12'),
      200,
      'no-contract-type.2026-12.json',
    );
  });

  it('NaN seconds: logged_time and total serialize as null', async () => {
    fakes.toggl.serve('toggl.nan-seconds.json');
    expectJsonGolden(
      await get('/api/attendence/2026/12'),
      200,
      'nan-seconds.2026-12.json',
    );
  });
});

describe('attendance error contract (golden files)', () => {
  it('400 month', async () => {
    expectJsonGolden(
      await get('/api/attendence/2024/abc'),
      400,
      'error.400-month.json',
    );
  });

  it('400 year', async () => {
    expectJsonGolden(
      await get('/api/attendence/abc/3'),
      400,
      'error.400-year.json',
    );
  });

  it('401 empty body, no WWW-Authenticate', async () => {
    const res = await get('/api/attendence/2024/3', false);
    expect(res.status).toBe(401);
    expect(res.headers['www-authenticate']).toBeUndefined();
    expectGolden('error.401.txt', res.text);
  });

  it('500 SSO', async () => {
    fakes.sso.fail({ status: 500 });
    expectJsonGolden(
      await get('/api/attendence/2024/3'),
      500,
      'error.500-sso.json',
    );
  });

  it('500 Toggl', async () => {
    fakes.toggl.fail({ status: 500 });
    expectJsonGolden(
      await get('/api/attendence/2024/3'),
      500,
      'error.500-toggl.json',
    );
  });
});
