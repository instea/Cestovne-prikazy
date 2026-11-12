# Leaves

Annual and sick leave management for Instea employees: employees sign in
with their Google Workspace account, request leaves and see the company
calendar; admins approve or reject leaves and manage users. An M2M endpoint
(`GET /api/attendence/:year/:month`) gives the attendance system the
monthly work and leave hours, combined with SSO and Toggl data.

Stack: pnpm monorepo, NestJS API (`apps/api`), React + Vite SPA
(`apps/web`), shared rules and types (`packages/shared`), MongoDB 8. In
production one Docker image serves the API and the SPA on MicroK8s.

This file is the developer guide. Operations (deploy, Keel, backup and
restore, CI, releases) are in [`deploy/README.md`](deploy/README.md).

## Contents

- [Prerequisites](#prerequisites)
- [Set up](#set-up)
- [Configure the .env file](#configure-the-env-file)
- [Run the app](#run-the-app)
- [Sign in locally](#sign-in-locally)
- [Tests](#tests)
- [Code quality](#code-quality)
- [Commits and releases](#commits-and-releases)
- [Data migration from the old app](#data-migration-from-the-old-app)
- [Repository layout](#repository-layout)
- [Environment variables](#environment-variables)
- [Further documentation](#further-documentation)

## Prerequisites

- **Node 24.** The only source of the version is `engines.node` in
  [`package.json`](package.json) (CI reads it from there; there is
  deliberately no `.nvmrc`).
- **pnpm via Corepack.** The exact version is pinned in the
  `packageManager` field; `corepack enable` installs it. Do not install pnpm
  globally with npm.
- **Docker** with Compose v2: local MongoDB and Mailpit, integration tests
  (Testcontainers), the E2E stack and the production image.
- `openssl` (generating a local session secret).

The [devcontainer](#devcontainer-recommended) ships all of this.

## Set up

### Devcontainer (recommended)

The repository's devcontainer ([`.devcontainer/`](.devcontainer/)) is the
team standard. Open the folder in VS Code ("Reopen in Container") or start
it with the devcontainer CLI. It provides:

- Node 24, Docker (docker-in-docker) and the GitHub CLI;
- on create: `corepack enable` and `pnpm install --frozen-lockfile`;
- on every start: `docker compose up -d mongo mailpit` (MongoDB 8 replica
  set and Mailpit, see [Local services](#local-services));
- ports `5173` (web) and `8025` (Mailpit UI) published to the host's
  loopback (`appPort`), so `http://localhost:5173` works in the host
  browser. VS Code also forwards `4100` (API); with the devcontainer CLI,
  reach the API through the web port (`http://localhost:5173/api/...`, Vite
  proxies `/api`).
- `DEV_HOST=0.0.0.0`, so Vite and the Mailpit UI listen on all interfaces
  inside the container (otherwise the published ports would not reach
  them).

MongoDB runs as uid/gid `1000` (the `vscode` user) and keeps its data in
`./.data/mongo` on the workspace, so it survives container rebuilds.

Then continue with [Configure the .env file](#configure-the-env-file).

### On the host

```sh
git clone https://github.com/instea/Cestovne-prikazy.git
cd Cestovne-prikazy
corepack enable
pnpm install
```

#### Local services

```sh
docker compose up -d        # MongoDB 8 + Mailpit (docker-compose.yml)
docker compose ps           # mongo must become "healthy"
```

- **MongoDB 8** on `127.0.0.1:27017`, no auth (loopback only), single-member
  replica set `rs0` like production (transactions work); the health check
  initiates the replica set on first start. Data in `./.data/mongo`. The
  container runs as uid/gid `1000`; if your user has another uid, set
  `MONGO_UID` and `MONGO_GID` (for example `export MONGO_UID=$(id -u)
MONGO_GID=$(id -g)`) before `docker compose up`.
- **Mailpit** (mail catcher): SMTP `127.0.0.1:1025`, web UI
  `http://localhost:8025`. It accepts any SMTP user and password.
- `docker compose down` stops them; delete `./.data/mongo` to start with an
  empty database.

The compose project is named `leaves`. `docker compose --profile full up
--build` also runs the production image as service `app` on
`http://localhost:4100` (needs `JWT_ACCESS_SECRET` in `.env`; it runs with
`NODE_ENV=production` and always with `AUTH_GOOGLE_VERIFIER=google`, so it
needs a real Google client id to sign in, and it uses port 4100 like
`pnpm dev`).

## Configure the .env file

```sh
cp .env.example .env
```

`pnpm dev` and the CLIs load the repository-root `.env` (never in
production; variables already set in the shell win). Fill in:

- `JWT_ACCESS_SECRET`: required, at least 32 bytes; the API does not start
  without it. Generate one with `openssl rand -base64 48`.
- `GOOGLE_CLIENT_ID`: a Google OAuth client id for the real "Sign in with
  Google" button, or keep the placeholder and use the fake verifier (see
  [Sign in locally](#sign-in-locally)).
- `SMTP_PASSWORD`: any value (for example `mailpit`) to send mail to
  Mailpit; empty disables mail (one warning log line per skipped email).
- `MONGO_URL`: leave empty to use the compose MongoDB
  (`mongodb://localhost:27017/cestaky`).

All other values in `.env.example` are working local defaults. Never commit
`.env`; secret values never go into the repository (NFR-05). Every variable
is described in [Environment variables](#environment-variables).

## Run the app

```sh
pnpm dev
```

Runs the `dev` script of every package in parallel: `packages/shared`
(`tsc --watch`), `apps/api` (`nest start --watch`, port 4100) and
`apps/web` (Vite, port 5173). Vite proxies `/api` and `/health-check` to
the API.

| What                | URL                                                                                                    |
| ------------------- | ------------------------------------------------------------------------------------------------------ |
| Web app             | `http://localhost:5173`                                                                                |
| API                 | `http://localhost:4100` (also via `http://localhost:5173/api/...`)                                     |
| Swagger UI          | `http://localhost:4100/api/docs` or `http://localhost:5173/api/docs` (not in production)               |
| OpenAPI JSON        | `http://localhost:4100/api/docs-json`; committed copy [`docs/api/openapi.json`](docs/api/openapi.json) |
| Health check        | `http://localhost:4100/health-check` (`{"checkMongo":"ok"}`)                                           |
| Mailpit (sent mail) | `http://localhost:8025`                                                                                |

`pnpm build` builds shared, API and web (`apps/web/dist`); the production
image (root [`Dockerfile`](Dockerfile)) serves the SPA from the API.

## Sign in locally

The app has no passwords: users sign in with a Google ID token, and an
unknown account of `HOSTED_DOMAIN` is registered as a normal user on first
sign-in. Two ways locally:

### Real Google sign-in

Create an OAuth client of type "Web application" in a Google Cloud project
with authorized JavaScript origin `http://localhost:5173`, put its client id
in `GOOGLE_CLIENT_ID`, keep `AUTH_GOOGLE_VERIFIER=google`, and sign in with
an account of `HOSTED_DOMAIN`.

### Fake verifier (no Google client needed)

`AUTH_GOOGLE_VERIFIER=fake` makes the API accept ID tokens signed with the
**test-only** key in `packages/shared/test-fixtures/google/` instead of
Google's keys (the same verifier the integration and E2E tests use). All
other rules (hosted domain, registration, deactivation, session) are
unchanged. The API refuses to start with `fake` when `NODE_ENV=production`.
It works only with `pnpm dev`: the compose `full` profile sets
`AUTH_GOOGLE_VERIFIER=google` for service `app` (overriding `.env`), so that
service always uses the real verifier.

1. In `.env`: `AUTH_GOOGLE_VERIFIER=fake`. `GOOGLE_CLIENT_ID` can stay the
   placeholder; it is only the token audience. Restart `pnpm dev`.
2. Create a token for any address of `HOSTED_DOMAIN` (other domains are
   refused):

   ```sh
   pnpm dev:login --email=jana.nova@instea.co
   ```

   It prints a one-line `fetch(...)` snippet (token valid for one hour).

3. Open `http://localhost:5173/login`, open the browser's developer console,
   paste the snippet and press Enter. It signs in (the refresh cookie is set
   in the browser) and opens `/leaves`; the session then lasts like a real
   one (`REFRESH_TOKEN_TTL_SECONDS`). The Google button on the login page
   does not work with the placeholder client id; ignore it.
4. "Add" creates a leave; the approver email appears in Mailpit when
   `SMTP_PASSWORD` is set.

`--given=` and `--family=` set the name (default: from the address).

### First admin

Admins are made with the operator CLI (AUTH-04). The user must have signed
in once; the email is matched case-insensitively.

```sh
pnpm --filter @leaves/api cli promote-admin --email=jana.nova@instea.co
```

It builds the API, then uses only `MONGO_URL` from `.env` (default: the
compose MongoDB). Exit codes: `0` promoted or already an admin, `1` not
found, deactivated or database error, `2` usage (through pnpm any failure
exits with 1; the `ELIFECYCLE` line shows the CLI's code). A promotion writes a
`USER_ROLE_CHANGED` audit entry with actor `CLI`. Reload the page to see
the admin pages (roles are read from the database on every request). In production
the same CLI runs in the pod, see
[`deploy/README.md`](deploy/README.md#promote-an-admin-auth-04).

## Tests

| Command                 | What                                                                                                                                                               |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `pnpm test:unit`        | Vitest projects `shared`, `api-unit`, `web`, `docs` with coverage (thresholds for shared and web, TST-01). No Docker.                                              |
| `pnpm test:integration` | `apps/api` integration tests (`*.int-spec.ts`) against MongoDB 8 and Mailpit started by Testcontainers (TST-02). Needs Docker.                                     |
| `pnpm test`             | Unit and integration tests together with the merged `apps/api` coverage threshold (what CI enforces).                                                              |
| `pnpm test:tz`          | `shared` tests under `TZ=UTC` and `TZ=Pacific/Auckland` (date rules must not depend on the machine time zone).                                                     |
| `pnpm e2e:stack`        | Playwright E2E (TST-03): builds the production image, starts the E2E stack (`e2e/docker-compose.yml`, project `leaves-e2e`), runs all specs, tears the stack down. |
| `pnpm e2e`              | Playwright only, against an already running E2E stack (`E2E_BASE_URL`, `E2E_MONGO_URL`, `MAILPIT_API_URL`).                                                        |
| `pnpm parity`           | MIG-03 attendance parity of the old and the new app in Docker ([parity README](apps/api/test/parity/README.md)).                                                   |
| `pnpm test:image`       | Builds the production image and runs its integration test (OPS-03).                                                                                                |
| `pnpm test:k8s`         | Validates `deploy/k8s/*.yml` with kubeconform (Docker).                                                                                                            |
| `pnpm lint:sh`          | shellcheck of `deploy/backup.sh` and `deploy/restore.sh` (Docker).                                                                                                 |

Notes:

- On a machine with little memory, limit Vitest workers, for example
  `pnpm test:unit --maxWorkers=2`.
- One file or project: `pnpm vitest run --project api-unit
apps/api/src/leaves`.
- Integration tests reuse running services instead of containers when
  `MONGO_TEST_URL` (a MongoDB 8 replica-set member, e.g.
  `mongodb://localhost:27017/cestaky-test?directConnection=true`) and
  `MAILPIT_API_URL` (e.g. `http://localhost:8025`) are set.
- E2E: install the browser once with `pnpm exec playwright install
chromium`. The E2E stack uses its own ports (app `4100`, MongoDB `27018`,
  Mailpit API `8026`) and never touches the dev database. While `pnpm dev`
  runs, move the app port: `E2E_APP_PORT=4101 pnpm e2e:stack`. One spec:
  `pnpm e2e:stack login.spec.ts`. Other knobs (`E2E_MONGO_PORT`,
  `E2E_MAILPIT_PORT`, `E2E_SKIP_BUILD=1`, `E2E_KEEP_STACK=1`) are described
  in [`scripts/e2e-stack.sh`](scripts/e2e-stack.sh).

## Code quality

| Command                 | What                                                                                      |
| ----------------------- | ----------------------------------------------------------------------------------------- |
| `pnpm lint`             | ESLint, zero warnings                                                                     |
| `pnpm format`           | Prettier, writes                                                                          |
| `pnpm format:check`     | Prettier, checks only                                                                     |
| `pnpm typecheck`        | `tsc --noEmit` for every package and the E2E suite                                        |
| `pnpm lint:md`          | markdownlint of the maintained docs (`.markdownlint-cli2.jsonc`)                          |
| `pnpm lint:links`       | relative links and anchors of the maintained docs (`scripts/check-md-links.mjs`)          |
| `pnpm openapi:generate` | regenerates [`docs/api/openapi.json`](docs/api/openapi.json) from the API (DOC-02)        |
| `pnpm openapi:check`    | fails when the committed `openapi.json` is out of date: run `openapi:generate` and commit |
| `pnpm openapi:lint`     | Redocly lint of `openapi.json`                                                            |

CI runs all of these plus the tests on every pull request; the jobs and
required checks are listed in
[`deploy/README.md`](deploy/README.md#ci-and-branch-protection-nfr-09).

## Commits and releases

- Commit messages follow [Conventional Commits](https://www.conventionalcommits.org/)
  (`feat: …`, `fix: …`, `docs: …`, `chore: …`; `!` or a `BREAKING CHANGE:`
  footer for breaking changes). Husky runs commitlint on `commit-msg` and
  lint-staged (ESLint and Prettier on staged files) on `pre-commit`; they
  are installed by `pnpm install` (NFR-10). Body lines are limited to 100
  characters.
- Pull requests to `master` are squash-merged; the PR title becomes the
  commit, so CI checks the title too (NFR-11): check `commitlint` in
  `.github/workflows/pr-title.yml` runs `amannn/action-semantic-pull-request`
  with the Conventional Commits types (not the commitlint CLI).
- release-please derives the version and `CHANGELOG.md` from these commits
  and opens a release PR; merging it tags `vX.Y.Z`. Every green `master`
  build pushes an image that Keel deploys (NFR-11). Details:
  [`deploy/README.md`](deploy/README.md#release-and-rollout).

## Data migration from the old app

The one-off migration of the old MongoDB 3.6 data (MIG-01) runs as

```sh
pnpm --filter @leaves/api migrate:legacy --dry-run   # report only
pnpm --filter @leaves/api migrate:legacy             # migrate
```

with `LEGACY_MONGO_URL` pointing at the restored old database
(`cestaky_legacy`) and `MONGO_URL` at the new one; options `--replace` and
`--report-dir <path>`. The rehearsal on an anonymized production dump
(MIG-02) is in the
[MIG-02 rehearsal runbook](apps/api/test/parity/README.md#mig-02-rehearsal-runbook);
the production cutover runbook (MIG-04) is linked from
[`deploy/README.md`](deploy/README.md#migration-and-cutover).

## Repository layout

| Path              | What                                                                  |
| ----------------- | --------------------------------------------------------------------- |
| `apps/api`        | NestJS API, CLI (`promote-admin`), migration tools, integration tests |
| `apps/web`        | React SPA (Vite, Tailwind, i18n en / sk)                              |
| `packages/shared` | work-day and holiday rules, DTO types, error codes, test fixtures     |
| `e2e`             | Playwright suite and its compose stack                                |
| `deploy`          | k8s manifests, backup and restore scripts, ops guide                  |
| `docs`            | functional specification, OpenAPI document                            |
| `scripts`         | repository tooling (link check, E2E stack, dev sign-in token)         |

## Environment variables

Only the API reads environment variables (the web app gets
`GOOGLE_CLIENT_ID` and `HOSTED_DOMAIN` from `GET /api/auth/config`). The
API validates them at startup and exits with status 1 listing every
problem. In production, non-secret values come from ConfigMap
`cestaky-leaves-config` and secrets from Secret `cestaky-leaves-secrets`
([`deploy/k8s/secrets.example.md`](deploy/k8s/secrets.example.md)).

"Used by": `api` = the API server (and the `promote-admin` CLI for
`MONGO_URL`); `migration` = `migrate:legacy`; `tests` = test tooling only
(never read by the app); `k8s Mongo` = the MongoDB StatefulSet and its
init Job only. "Default" is the value used when the variable is unset
outside production. The table is checked against the config schema
(`apps/api/src/config/env.schema.ts`) by `apps/api/test/readme-env.spec.ts`.

| Name                         | Used by        | Required in production | Default                                                       | Description                                                                                                                                |
| ---------------------------- | -------------- | ---------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `NODE_ENV`                   | api            | no (k8s sets it)       | `development`                                                 | `production`, `development` or `test`. `production` enables the production rules (required variables, no Swagger, SPA serving, JSON logs). |
| `PORT`                       | api            | no                     | `4100`                                                        | HTTP port.                                                                                                                                 |
| `BASE_URL`                   | api            | yes                    | `http://localhost:5173`                                       | Public URL of the app: links in emails, the only CORS origin, refresh cookie path. Production `https://cestaky.instea.co`.                 |
| `MONGO_URL`                  | api, migration | yes                    | `mongodb://localhost:27017/cestaky`                           | MongoDB connection string (target database of the migration). k8s: Secret (contains the password).                                         |
| `HOSTED_DOMAIN`              | api            | yes                    | none (required everywhere)                                    | Google Workspace domain; only accounts whose `hd` matches can sign in.                                                                     |
| `GOOGLE_CLIENT_ID`           | api            | yes                    | none (required everywhere)                                    | Google OAuth client id (ID token audience); sent to the SPA by `/api/auth/config`.                                                         |
| `JWT_ACCESS_SECRET`          | api            | yes                    | none (required everywhere)                                    | Access token signing secret, at least 32 bytes. k8s: Secret. Local: `openssl rand -base64 48`.                                             |
| `ACCESS_TOKEN_TTL_SECONDS`   | api            | no                     | `900`                                                         | Access token lifetime in seconds.                                                                                                          |
| `REFRESH_TOKEN_TTL_SECONDS`  | api            | no                     | `604800`                                                      | Refresh token (session) lifetime in seconds, sliding.                                                                                      |
| `AUTH_GOOGLE_VERIFIER`       | api            | no                     | `google`                                                      | `google` or `fake` (test-only key, see [Sign in locally](#sign-in-locally)); `fake` is refused in production.                              |
| `SMTP_HOST`                  | api            | yes                    | `localhost`                                                   | SMTP server.                                                                                                                               |
| `SMTP_PORT`                  | api            | yes                    | `1025`                                                        | SMTP port.                                                                                                                                 |
| `SMTP_SECURE`                | api            | yes                    | `false`                                                       | `true` = TLS from connect (port 465); anything else = plain connect with STARTTLS when offered.                                            |
| `SMTP_USER`                  | api            | yes                    | none                                                          | SMTP user. Mail is sent only when host, port, user and password are all set. k8s: Secret.                                                  |
| `SMTP_PASSWORD`              | api            | yes                    | none                                                          | SMTP password. k8s: Secret.                                                                                                                |
| `MAIL_SENDER`                | api            | yes                    | `leaves@localhost`                                            | From address of all emails; required whenever SMTP is configured.                                                                          |
| `APPROVAL_MAIL_RECEIVER`     | api            | yes                    | `approver@localhost`                                          | Recipient of new-leave notifications.                                                                                                      |
| `DEFAULT_TIMEZONE`           | api, migration | no                     | `Europe/Bratislava`                                           | IANA time zone for dates in emails and attendance, and for migrating old timestamps.                                                       |
| `M2M_USERNAME`               | api            | yes                    | none                                                          | Basic-auth user of the attendance API; unset = every attendance call gets 401. k8s: Secret.                                                |
| `M2M_PASSWORD`               | api            | yes                    | none                                                          | Basic-auth password of the attendance API. k8s: Secret.                                                                                    |
| `SSO_URI`                    | api            | yes                    | none                                                          | SSO meta API URL (employee directory with Toggl ids), used by attendance and the GDPR anonymization check.                                 |
| `SSO_USERNAME`               | api            | yes                    | none                                                          | SSO meta API basic-auth user. k8s: Secret.                                                                                                 |
| `SSO_PASSWORD`               | api            | yes                    | none                                                          | SSO meta API basic-auth password. k8s: Secret.                                                                                             |
| `TOGGL_REPORTS_BASE_URL`     | api            | no                     | `https://api.track.toggl.com/reports/api/v3`                  | Toggl Reports API base URL; overridable for mocks.                                                                                         |
| `LOG_LEVEL`                  | api            | no                     | `debug` in development, else `info`                           | `fatal`, `error`, `warn`, `info`, `debug` or `trace`.                                                                                      |
| `APP_VERSION`                | api            | no                     | `0.0.0-dev`                                                   | App version in logs; set by the image build.                                                                                               |
| `LEGACY_MONGO_URL`           | migration      | no (migration: yes)    | none                                                          | Restored old database (`cestaky_legacy`) read by `migrate:legacy`.                                                                         |
| `MONGO_TEST_URL`             | tests          | n/a                    | none (Testcontainers starts MongoDB)                          | Integration tests: use this MongoDB 8 replica-set member instead of a container.                                                           |
| `E2E_MONGO_URL`              | tests          | n/a                    | `mongodb://localhost:27018/cestaky-e2e?directConnection=true` | E2E: direct MongoDB connection used to empty the E2E database before the run; any database other than `cestaky-e2e` is refused.            |
| `MAILPIT_API_URL`            | tests          | n/a                    | E2E: `http://localhost:8026`; integration: none               | Mailpit HTTP API the tests read mail from (integration tests: reuse this Mailpit instead of a container).                                  |
| `E2E_BASE_URL`               | tests          | n/a                    | `http://localhost:4100`                                       | E2E: URL of the app under test.                                                                                                            |
| `MONGO_INITDB_ROOT_USERNAME` | k8s Mongo      | yes                    | none                                                          | MongoDB root user (Secret `mongo8-secrets`); also used by the backup and restore scripts inside the pod.                                   |
| `MONGO_INITDB_ROOT_PASSWORD` | k8s Mongo      | yes                    | none                                                          | MongoDB root password (Secret `mongo8-secrets`).                                                                                           |
| `MONGO_APP_USERNAME`         | k8s Mongo      | yes                    | none                                                          | App database user created by Job `mongo8-rs-init` (Secret `mongo8-secrets`); must match the user in `MONGO_URL`.                           |
| `MONGO_APP_PASSWORD`         | k8s Mongo      | yes                    | none                                                          | Password of the app database user (Secret `mongo8-secrets`).                                                                               |

Not in the table because they are tool settings, not app configuration:
`DEV_HOST`, `MONGO_UID` / `MONGO_GID` (devcontainer and compose, see
[Set up](#set-up)); `E2E_APP_PORT`, `E2E_MONGO_PORT`, `E2E_MAILPIT_PORT`,
`E2E_SKIP_BUILD`, `E2E_KEEP_STACK`, `LEAVES_IMAGE` (E2E stack);
`PARITY_*` (parity harness); `ANONYMIZE_SECRET` and `ANONYMIZED_MONGO_URL`
(MIG-02 anonymizer: the pseudonymization secret and the target database the
anonymized `users` / `leaves` are written to, see its runbook). Old names
that are no longer read: `CLIENT_ID` (now `GOOGLE_CLIENT_ID`),
`REACT_APP_*` / `VITE_*`, `secrets/key.pem`.

## Further documentation

- [`docs/functional-spec.md`](docs/functional-spec.md): what the app does
  (rules, screens, emails, attendance).
- [`docs/api/openapi.json`](docs/api/openapi.json): the REST API (also
  Swagger UI at `/api/docs` outside production).
- [`deploy/README.md`](deploy/README.md): deployment, secrets, Keel,
  backup and restore, CI, releases, troubleshooting.
- [`apps/api/test/parity/README.md`](apps/api/test/parity/README.md):
  attendance parity harness and the MIG-02 rehearsal runbook.
