# Parity harness (MIG-03)

Compares the **old** app (current production) and the **new** app on the
same data and reports every difference:

- **Attendance**: `GET /api/attendence/:year/:month` with the same SSO /
  Toggl answers.
- **Leave list**: the old GraphQL `getLeaves` against the new
  `GET /api/leaves`, as several users ([Leave list](#leave-list)).
- **Write scenarios**: the same create / delete / approve / reject steps on
  both apps, comparing answers, emails and the resulting data
  ([Write scenarios](#write-scenarios)).

Runs locally or in CI only — never in the production cluster.

## Run

```sh
pnpm parity                                  # synthetic dataset (CI)
pnpm parity --keep                           # leave the stack running for debugging
PARITY_NEW_IMAGE=cestaky-leaves:parity pnpm parity   # reuse a built new image
```

Needs docker (compose v2), git and openssl. The report is written to
`parity-report/parity-report.{md,json}` (git-ignored) together with the
MIG-01 `migration-report.json`. Exit code: `0` passed, `1` diffs, errors,
unmatched mock requests or nothing compared, `2` refused (bad arguments, secrets in fixtures,
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

## Leave list

After the attendance requests, `list-harness.mts` asks both apps for the
leave list (`leave-list.mts`). Both apps verify HS256 session tokens with a
secret the harness generates per run (old `secrets/key.pem`, new
`JWT_ACCESS_SECRET`), so the harness signs in as any user without Google
(`tokens.mts`; `tokens.spec.ts` checks the new token against the app's own
`AccessTokenService`).

- Old: `POST /graphql` with the old Angular client's `LeavesQuery`, verbatim.
- New: `GET /api/leaves`, and `?state=` for each state.

The answers have different shapes, so both are reduced to the leave model
the old client built (`fromGraphQl` in `angular/src/app/leaves/leave.ts` at
`193b89f`) and compared leave by leave (by id), then for order:

| Field                   | Old answer → model                              | New answer → model        |
| ----------------------- | ----------------------------------------------- | ------------------------- |
| `startDate`, `endDate`  | instant → calendar date in the default timezone | as is                     |
| `type`, `state`         | missing → `ANNUAL`, `PENDING` (old client)      | as is                     |
| `isHalfDay`             | truthy                                          | as is                     |
| `numDays`               | as stored (client value)                        | as is (MIG-01 recomputed) |
| `requester`, `approver` | `id`, `firstName`, `surname`                    | same fields               |

Every field the old answer carried must also be in the new one
(`$fields.leave.<f>`, `$fields.user.<f>`): the only expected gap is user
`email` (§10 #31, `USER_EMAIL_REMOVED`). New-only fields (`createdAt`,
`updatedAt`, `active`, `anonymized`) are additions and not compared;
`createdAt` is used to check the exact list order. `?state=` is compared
with the old list filtered on the client, as the old approval screen did.
A refused request expects one exact new code: no session `AUTH_REQUIRED`,
forged signature and unknown user `ACCESS_TOKEN_INVALID`, removed user
`USER_DEACTIVATED`.

Requests (`listRequests`): the list as every admin, every unapproved user
and two other users; each `?state=` as the first of them; and the denied
cases: no session, a forged signature, an unknown user id and every removed
user (a MIG-01 placeholder). A run in which no request returned a list on
both apps fails as "nothing compared".

## Write scenarios

Last (they change the data), `scenario-harness.mts` runs the steps of
`scenario()` in `scenarios.mts` on both apps, each as its step's user (the
first admin, two approved users, an unapproved user, a removed user, no
session; picked from the dataset by id). Old: the old client's GraphQL
mutations, verbatim, with the payload it sent (dates as local-midnight
instants, its own `numDays`). New: the REST routes. After every step:

1. **Answer**: success or refusal, and for approve / reject the fields the
   old client read (`id`, `state`, `approver`). Created leaves get an alias
   (`@u1`), since each app makes its own ids.
2. **Emails**: each app sends to its own Mailpit (`mailpit-old`,
   `mailpit-new`), emptied before the step. Emails are matched by subject
   and recipient and compared field by field: heading, every
   `<b>Label: </b>value` pair, link.
3. **Data**: the whole leave list of both apps, as in [Leave list](#leave-list),
   aliases included.

A step that hits an approved change names it and the new app's exact
answer (`change: { class, status, code }`). The difference is excused only
when the new app answers exactly that and the old app shows the old
behavior; everything else in the step is still compared. Steps: creates
(annual, half-day, sickness, own leave of the admin), three invalid
creates (end before start, half-day over two days, longer than 2 years),
delete of another user's leave, approve by a non-admin, approve, the same
approve again, reject, approve of an unknown id, approve of a migrated
PENDING leave, delete of an own approved leave and again, admin delete of
another user's leave, create by a removed user and without a session, and
reject without a session.

`pnpm parity --suites list,scenarios` skips the attendance months (faster
while working on these).

## How exact the classes are

A class never covers a whole request where the old app gave an answer:
every diff (one per JSON path) is classified on its own, and a class
predicts the exact values, not just where a difference may occur.

- **Attendance `leave` values** (`cells.mts`): the harness simulates the
  `leave` value of every day for both apps from the data each app reads
  (old: legacy data in natural order, month number only, old holidays,
  walking instants; new: migrated data in `_id` order, year and month,
  WD-01). A diff is excused only if the old value equals the simulated old
  value, the new value the simulated new value, and the simulations differ
  for an approved reason: the year check (`LEAVE_YEAR_CHECK`), else a
  holiday change on that date (`HOLIDAY_REFRESH`), else a MIG-01 finding on
  a leave of that user covering the date (`MIGRATION_REPORT`).
- **Months where the old app gave no data** (`HANG_FIX`, and
  `NO_TOGGL_ID_SKIPPED` when the old app answered 500): the harness asks
  the **old baseline app** (`old-base`: same old app and data, SSO answer
  without the employees with `employee: '1'` and no `togglUserId`, the
  ones the new app skips) and compares the new answer with it in full,
  like with the old app. These diffs have the path prefix `baseline:`.
- **List order**: the exact LST-01 order with both tie-breakers.
- **Refusals, write steps, emails**: the exact predicted code or email
  (see [Leave list](#leave-list) and [Write scenarios](#write-scenarios)).

## Expected-diff classes

Reported, but do not fail the run (`classify.mts`). Each class hides only
a decided change: "Approved change" is the row of
[functional spec §10](../../../../docs/functional-spec.md#10-changes-vs-the-old-system)
(`APPROVED_CHANGES` in `classify.mts`; `classify.spec.ts` fails when a class
has no existing row or this table disagrees). A new class needs a §10 row
first.

| Class                      | Meaning                                                                                                                                                          | Approved change |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- |
| `HOLIDAY_REFRESH`          | `leave` differs on a date whose working-day status differs between old `date-holidays` 1.2.0 SK and WD-01; both values exactly as simulated                      | #6              |
| `HANG_FIX`                 | old request hangs (employee without `togglUserId` with an APPROVED leave on a working day); new returns 200, compared in full with the old baseline app          | #24             |
| `MIGRATION_REPORT`         | `leave` differs on a leave / user the MIG-01 report lists as skipped or changed, both values exactly as simulated; a leave MIG-01 skipped is missing in the list | #28, #29        |
| `NO_TOGGL_ID_SKIPPED`      | old sent a Toggl request with `user_ids: [null]`; new sends none (an old 500 from it: new compared in full with the old baseline app)                            | #24             |
| `LEAVE_YEAR_CHECK`         | `leave` differs because old checked the month number only (codes from the same month of another year of a long leave); both values exactly as simulated          | #25             |
| `NON_FINITE_PARAM`         | `Infinity`-like params, and finite params outside the JS Date range (`1e20`): new 400 with the old text                                                          | #26             |
| `UNEXPECTED_ERROR_500`     | old hangs on another internal error (not a `HANG_FIX` month), new returns 500 `{"message":"Internal server error"}`                                              | #26             |
| `TIMEOUT_REDIRECT_LIMIT`   | a fixture injected latency or redirects, new returns the old SSO / Toggl 500 text                                                                                | #30             |
| `CORS_HEADERS`             | old `Access-Control-Allow-Origin: *`, new none — a header note only, never changes a request's status                                                            | #27             |
| `LIST_ORDER`               | leave list: same leaves, new order exactly LST-01 (`startDate` desc, `createdAt` desc, `id` asc; old: MongoDB natural order)                                     | #19             |
| `NUMDAYS_RECOMPUTED`       | leave list: `numDays` differs exactly as the MIG-01 finding `LEAVE_NUMDAYS_CHANGED` of that leave records                                                        | #2, #28         |
| `DENIED_EXPLICIT_ERROR`    | leave list: old `getLeaves: null`, new 401 with the request's exact code; scenarios: old `null`, new the step's exact 401 / 403 / 404                            | #9              |
| `VALIDATION_REJECTED`      | scenarios: old stored an invalid leave, new answers the step's exact 400 code; that leave and its new-leave email are then missing in the new app                | #1, #3          |
| `UNKNOWN_ID_404`           | scenarios: approve / reject of an unknown id: old built an empty leave GraphQL could not return, new 404 `LEAVE_NOT_FOUND`                                       | #10             |
| `REQUESTER_DECISION_EMAIL` | scenarios: a new-only email equal to the predicted approved / rejected email (recipient, subject, every field, link)                                             | #13             |
| `NEW_LEAVE_EMAIL_WORDING`  | scenarios: in the new-leave email exactly the heading typo fix, the readable type label (§4) or the `/approval` link                                             | #14             |
| `USER_EMAIL_REMOVED`       | leave list / approve answer: the old answer carried user `email`, the new one does not (one diff per answer)                                                     | #31             |

Any other diff is `DIFF` and fails the run; a request no fixture matches
answers 599 and fails the run naming the request. So does a request with
credentials that do not match the fixture contract (SSO Basic credentials
other than the fixture set's, Toggl auth other than `<token>:api_token`):
the mock answers 401 and records it as unmatched, since both apps would
otherwise return the same SSO error and compare EQUAL. A run where no mock
request of an app got a 2xx answer fails as "nothing compared".

## Rehearsal run (MIG-02 / MIG-04)

```sh
pnpm parity --dump cestaky-anon-2026-12-01.gz \
  --fixtures sso-toggl-fixtures-2026-12-01.json --now 2026-12-01 \
  --consumer-confirmed-by "Jana Nová, 2026-12-01"
```

- `--dump`: `mongodump --gzip --archive` of the old database (in a
  rehearsal: the anonymized dump below), restored into the old MongoDB 3.6
  and (users + leaves only) into the new server's `cestaky_legacy`, exactly
  as MIG-01 describes.
- `--fixtures`: the recorder's `sso-toggl-fixtures-<date>.json` (one
  `FixtureSet`), or a directory with `sso.json` and `toggl.json` (format in
  `fixtures.mts`). Every token and credential must be a placeholder
  (`PARITY_…` / `REDACTED…`; a missing token's `undefined` is allowed); the
  harness refuses to run otherwise. Keep the set offline with the dump
  (encrypted company drive), never commit it.
- `--now`: the date the fixtures were recorded with (it defines the month
  set; another month gives unmatched Toggl requests).
- `--consumer-confirmed-by`: the M2M consumer owner's confirmation that the
  consumer calls the endpoint server-side (the new route sends no CORS
  headers); written into the report.

## MIG-02 rehearsal runbook

Goal: rehearse MIG-01 on an anonymized production dump until the report is
clean or every finding is decided. No personal data leaves the server host
un-anonymized. Steps 1–7 are **operator-only, on the server host**; steps
8–10 run on a developer machine; the sign-off belongs to the operator and
feeds the MIG-04 go/no-go.

Tools, both in the new image (`dist/migration/`); from a checkout:
`pnpm --filter @leaves/api anonymize:legacy` / `record:parity-fixtures`.

- `anonymize-legacy.js [--replace] [--allow-finding-drift]` — env
  `ANONYMIZE_SECRET`, `LEGACY_MONGO_URL` (restored prod dump, read only),
  `ANONYMIZED_MONGO_URL` (output), `DEFAULT_TIMEZONE`.
- `record-parity-fixtures.js --earliest YYYY-MM [--now YYYY-MM-DD]
[--out <file>] [--delay-ms 1000]` — env `ANONYMIZE_SECRET` (the same
  value), `SSO_URI`, `SSO_USERNAME`, `SSO_PASSWORD`, `TOGGL_REPORTS_BASE_URL`
  (default: real Toggl).
- Exit codes of both: 0 written, 1 failure, 2 refused (e.g. no secret,
  non-empty output without `--replace`), 3 check failed (nothing written).

What the anonymizer does (HMAC-SHA256 with `ANONYMIZE_SECRET`):

- `users.id`, `leaves.requesterId` / `approverId` → `anon-` + 16 hex of
  HMAC(id): references stay intact, missing users stay missing.
- `email` → `user-` + 12 hex of HMAC(trimmed lowercased email) `@` original
  domain; `User-…` when the original local part has an uppercase letter
  (`A@x` / `a@x` stay distinct but collide lowercased); invalid emails stay
  invalid.
- `firstName` / `surname` → `First<n>` / `Last<n>` (n = rank of the
  pseudonymized id); blank names stay blank. `degrees` / `address` → `''`
  when non-empty, missing stays missing (so `droppedFields` in the MIG-01
  report shows 0). Unknown fields: strings → `redacted-<hex>`, numbers
  (JS and BSON `Double` / `Int32` / `Long` / `Decimal128`) → a fake number
  of the same type; a numeric id or name gets a fake number too (the same
  value for the same number, so numeric references stay intact).
- Unchanged: `_id`, leave `id`, dates, `state`, `type`, `isHalfDay`,
  `numDays`, `approved`, `isAdmin`, `__v`, field presence, BSON types,
  natural order.
- Before writing it checks that no original id / email / name / degrees /
  address / unknown-field value (strings and numbers) remains anywhere, and that MIG-01 (pure mapping, in memory) finds
  the same number of findings per code as on the original. It writes into a
  separate database `cestaky`, so the dump restores exactly like a prod dump
  (`cestaky.*`: the harness and MIG-01 restore commands work unchanged; a
  MongoDB 8 `mongodump` archive restores into MongoDB 3.6, see
  `test/migration/rehearsal-restore.int-spec.ts`).

The recorder fetches the SSO meta answer and the Toggl Reports v3 answers
the old app would request (every employee with a workspace, including
`user_ids: [null]` and the non-finite `-0NaN--NaN--NaN` range) for the
harness month set, page by page, 1 s apart, in memory only. It writes the
pseudonymized set:

- SSO credentials → the compose file's `PARITY_SSO_USER` /
  `PARITY_SSO_PASSWORD`: the mock answers 401 (recorded as unmatched, the
  run fails) to any other credentials, so a hand-made set must use exactly
  these too.
- emails / names with the same HMAC as the dump (the SSO email ↔ user match
  keeps working, exact and lowercased);
- `togglApiToken` → `PARITY_TOGGL_TOKEN_<hex>`, workspace ids → fake
  numbers, the same values in the SSO answer and in the Toggl keys (the mock
  keys on the token the app sends: otherwise 599 or 401);
- other SSO attributes → `redacted-<hex>` (numbers → fake numbers), a
  numeric `togglApiToken` → the same `PARITY_TOGGL_TOKEN_<hex>` string as
  its string form (what the apps send), Toggl descriptions → `entry-<n>`,
  usernames → the name pseudonym; hours, dates, Toggl numbers,
  `togglUserId`, `employee`, `contractType` and paging headers stay.

It refuses to write when any original value (string or number) survives.

Email case collisions (both tools): the email rule keeps only "has an
uppercase letter", so distinct emails that differ only in letter case
beyond that (`HANA@x` / `Hana@x`) get the same pseudonym. Both tools print
`Email case collisions: 0 …` or a `WARNING: <n> pair(s) …` line listing the
pairs by path only (`users[<_id>].email`, `sso.body[<i>].email`), within
their own source. A non-zero count means the rehearsal parity run is blind
for those users: the old app matches the SSO email to the stored email
exactly (case-sensitively), and a difference the old app would show can
disappear (or a new match appear) on the anonymized data. Record the pairs
in the decisions file and compare those users' raw emails on the host by
hand. Pairs across the two sources (stored email vs SSO email of the same
person) are not detected by either tool, see step 8.

### On the server host (operator)

1. Throwaway MongoDB 8 without published ports, latest prod dump
   (`/opt/instea/backup/mongo/dumps/mongo3`, from `backup.cestaky.sh`):

   ```sh
   docker run -d --name rehearsal-mongo mongo:8.0
   docker cp <prod-dump>.gz rehearsal-mongo:/tmp/prod.gz
   docker exec rehearsal-mongo mongorestore --nsInclude 'cestaky.users' \
     --nsInclude 'cestaky.leaves' --nsFrom 'cestaky.*' \
     --nsTo 'cestaky_legacy.*' --noIndexRestore --gzip --archive=/tmp/prod.gz
   ```

2. A new random secret per rehearsal, only in this shell (start with
   `set +o history`), never written to a file or the repo:
   `export ANONYMIZE_SECRET="$(openssl rand -hex 32)"`.
3. Anonymize (new image, sharing the container's network):

   ```sh
   docker run --rm --network container:rehearsal-mongo -e ANONYMIZE_SECRET \
     -e LEGACY_MONGO_URL=mongodb://localhost:27017/cestaky_legacy \
     -e ANONYMIZED_MONGO_URL=mongodb://localhost:27017/cestaky \
     registry.instea.co/cestaky-leaves:<version> node dist/migration/anonymize-legacy.js
   ```

   Exit 3 lists only paths and codes, never values. A finding drift comes
   from data the pseudonyms cannot reproduce (known: removed-user ids that
   differ only in letter case, or that make an invalid placeholder email);
   record it in the decisions file before rerunning with
   `--allow-finding-drift`.

4. Check MIG-01 once on the host (finding counts equal): run
   `node dist/migration/migrate-legacy.js --dry-run --report-dir <dir>` the
   same way with `LEGACY_MONGO_URL` = `…/cestaky_legacy`, then `…/cestaky`
   (`MONGO_URL` = an empty database, e.g. `…/dryrun`), and compare
   `jq -S .findingsByCode <dir>/report.json` of both runs. Keep the original
   run's report on the host (it contains real ids and emails).
5. Earliest leave month (local time) for the recorder:

   ```sh
   docker exec rehearsal-mongo mongosh --quiet cestaky_legacy --eval \
     'const d = db.leaves.find({ startDate: { $type: "date" } }).sort({ startDate: 1 }).limit(1).next().startDate;
      print(d.toLocaleDateString("sv-SE", { timeZone: "Europe/Bratislava" }).slice(0, 7))'
   ```

6. Record the fixtures (SSO credentials of the old app exported in the same
   shell):

   ```sh
   docker run --rm --user "$(id -u)" -v "$PWD:/out" -e ANONYMIZE_SECRET \
     -e SSO_URI -e SSO_USERNAME -e SSO_PASSWORD \
     registry.instea.co/cestaky-leaves:<version> node dist/migration/record-parity-fixtures.js \
     --earliest <YYYY-MM> --now <YYYY-MM-DD> --out /out/sso-toggl-fixtures-<date>.json
   ```

7. Dump, clean up, move offline:

   ```sh
   docker exec rehearsal-mongo mongodump --db cestaky --gzip --archive=/tmp/anon.gz
   docker cp rehearsal-mongo:/tmp/anon.gz cestaky-anon-<date>.gz
   sha256sum cestaky-anon-<date>.gz sso-toggl-fixtures-<date>.json > SHA256SUMS
   docker rm -f rehearsal-mongo
   unset ANONYMIZE_SECRET
   ```

   Copy the two files and `SHA256SUMS` to the encrypted company drive; never
   commit them (`.gitignore` covers the default names).

### On a developer machine

8. Parity: `pnpm parity --dump cestaky-anon-<date>.gz --fixtures
sso-toggl-fixtures-<date>.json --now <date> --consumer-confirmed-by "<name, date>"`.
   Diffs other than the expected classes are findings for the decisions
   file. Known limit: the email case rule maps `HANA@x` and `Hana@x` to the
   same `User-…`, so an old-app exact-match difference between the stored
   and the SSO email of one person can disappear in the rehearsal.
9. Migration loop: restore the anonymized dump into the local compose
   MongoDB with the MIG-01 command (step 1), `pnpm --filter @leaves/api
migrate:legacy --dry-run`, review `report.md`, fill the generated
   `decisions.csv`, change the script or plan source fixes, repeat.
10. Decisions file: `decisions.csv`, generated by MIG-01 next to the report
    with one row per error and warning. Keep it in the private ops folder,
    never in the repo (it contains record ids). Template:

    ```csv
    code,recordId,decision,decidedBy,note
    LEAVE_END_BEFORE_START,<leave id>,fix-in-source-before-cutover,<name>,swap dates (MIG-04 step 10 script)
    USER_PLACEHOLDER_CREATED,<user id>,accept,<name>,removed employee
    ```

    `decision` is one of `accept`, `fix-in-source-before-cutover`,
    `fix-in-script`, `drop`. Source fixes run in MIG-04 step 10 as a reviewed
    `mongosh` script on `cestaky_legacy`, never on the old database.

### Exit criterion and sign-off (operator, MIG-04)

The last rehearsal report has 0 errors, every warning code has a decision,
the parity report shows only expected diffs, and `migrated.users +
skipped.users = source.users` (same for leaves). The sign-off note in the
ops folder records:

```text
Rehearsal sign-off: <date>
Prod dump date: <date>          Anonymized dump sha256: <sum>
Report: source users/leaves …, migrated …, skipped …, errors 0, warnings … (all decided)
Parity: EQUAL <n>, EXPECTED_DIFF <n>, DIFF 0; consumer server-side confirmed by <name, date>
Approved by: <name>
```
