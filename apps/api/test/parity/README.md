# Attendance parity harness (MIG-03)

Compares `GET /api/attendence/:year/:month` of the **old** app (current
production) and the **new** app on the same data and the same SSO / Toggl
answers, and reports every difference. Runs locally or in CI only — never in
the production cluster.

## Run

```sh
pnpm parity                                  # synthetic dataset (CI)
pnpm parity --keep                           # leave the stack running for debugging
PARITY_NEW_IMAGE=cestaky-leaves:parity pnpm parity   # reuse a built new image
```

Needs docker (compose v2), git and openssl. The report is written to
`parity-report/parity-report.{md,json}` (git-ignored) together with the
MIG-01 `migration-report.json`. Exit code: `0` passed, `1` diffs, errors or
unmatched mock requests, `2` refused (bad arguments, secrets in fixtures,
missing consumer confirmation).

Options: `--report-dir <dir>`, `--timeout <s>` (default 120),
`--now YYYY-MM-DD` (defines the current month), `--keep`,
`--old-image <ref>` / `PARITY_OLD_IMAGE`, `--old-ref <git ref>`,
`--new-image <ref>` / `PARITY_NEW_IMAGE`.

Tests:

```sh
pnpm vitest run --project api-unit apps/api/test/parity        # comparison, classes, mock, fixtures
pnpm vitest run --project api-integration apps/api/test/parity # self-tests (two in-process new apps)
```

## What runs

`docker-compose.parity.yml` (profile `parity`), started by `run.mts`:

| Service     | What                                                                                                                                       |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `old-mongo` | MongoDB 3.6 with the dataset in `cestaky` (in memory)                                                                                      |
| `new-mongo` | MongoDB 8 (same image as k8s), dataset in `cestaky_legacy`, migrated by MIG-01 into `cestaky` (in memory)                                  |
| `mock`      | `mock-server.mts`: SSO + Toggl for both apps, one port per app, HTTPS for the old app's hard-coded `api.track.toggl.com` (harness CA)      |
| `migrate`   | the new image's `node dist/migration/migrate-legacy.js`                                                                                    |
| `old-app`   | `PARITY_OLD_IMAGE`, else built from the old source (`old-app.Dockerfile`, git `193b89f`: exact yarn.lock deps, node 12.22, no SPA bundles) |
| `new-app`   | `PARITY_NEW_IMAGE`, else built from the repo `Dockerfile`                                                                                  |

The production image `registry.instea.co/cestovne-prikazy:latest` needs
registry credentials (`docker login registry.instea.co`, then
`PARITY_OLD_IMAGE=registry.instea.co/cestovne-prikazy:latest`); without them
the harness builds the old server from source.

Requests: every month from the earliest leave to the current month + 1, plus
`YYYY/0`, `YYYY/13`, `YYYY/1.5`, `Infinity/1`, `1e20/3`, `abc/1`, `2024/abc`.
Per request: status, `Content-Type`, body bytes, then a structural diff
(value / missing / extra / key order / number format), then the ordered
outgoing SSO and Toggl requests of each app (method, path, body, auth).

## Expected-diff classes

Reported, but do not fail the run (`classify.mts`):

| Class                    | Meaning                                                                                                     |
| ------------------------ | ----------------------------------------------------------------------------------------------------------- |
| `HOLIDAY_REFRESH`        | `leave` differs on a date whose working-day status differs between old `date-holidays` 1.2.0 SK and WD-01   |
| `HANG_FIX`               | old request hangs (employee without `togglUserId` with an APPROVED leave on a working day); new returns 200 |
| `MIGRATION_REPORT`       | `leave` differs on a leave / user the MIG-01 report lists as skipped or changed                             |
| `NO_TOGGL_ID_SKIPPED`    | old sent a Toggl request with `user_ids: [null]`; new sends none                                            |
| `LEAVE_YEAR_CHECK`       | `leave` differs for a user with a leave spanning more than 11 months (old checked the month only)           |
| `NON_FINITE_PARAM`       | `Infinity`-like params, and finite params outside the JS Date range (`1e20`): new 400 with the old text     |
| `UNEXPECTED_ERROR_500`   | old hangs on another internal error, new returns 500 `{"message":"Internal server error"}`                  |
| `TIMEOUT_REDIRECT_LIMIT` | a fixture injected latency or redirects, new returns the old SSO / Toggl 500 text                           |
| `CORS_HEADERS`           | old `Access-Control-Allow-Origin: *`, new none — a header note only, never changes a request's status       |

Any other diff is `DIFF` and fails the run; a request no fixture matches
answers 599 and fails the run naming the request.

## Rehearsal run (MIG-02 / MIG-04)

```sh
pnpm parity --dump cestaky-anonymized.gz --fixtures ./recorded \
  --consumer-confirmed-by "Jana Nová, 2026-12-01"
```

- `--dump`: `mongodump --gzip --archive` of the old database, restored into
  the old MongoDB 3.6 and (users + leaves only) into the new server's
  `cestaky_legacy`, exactly as MIG-01 describes.
- `--fixtures`: a directory with `sso.json` and `toggl.json` (format in
  `fixtures.mts`). Every token and credential must be a placeholder
  (`PARITY_…` / `REDACTED…`); the harness refuses to run otherwise. Keep the
  recorded set offline with the dump (encrypted company drive), never commit
  it.
- `--consumer-confirmed-by`: the M2M consumer owner's confirmation that the
  consumer calls the endpoint server-side (the new route sends no CORS
  headers); written into the report.

Recording the fixtures against real SSO / Toggl is not automated yet
(TODO(MIG-02)): capture the parity months' answers, replace every
`togglApiToken` and `Authorization` value with a placeholder, and include
answers for the old app's known-bad requests (`user_ids: [null]`,
`-0NaN--NaN--NaN` date ranges for non-finite years).
