# Deployment and operations

Kubernetes manifests are in [`k8s/`](k8s/) (OPS-03). The full dev and ops
guide follows in DOC-03.

## Database backup and restore (OPS-02)

Both scripts run on the MicroK8s host and talk to the `mongo8` pod with
`microk8s kubectl`. They contain no credentials: `mongodump` /
`mongorestore` run inside the pod with the root user from Secret
`mongo8-secrets` (`MONGO_INITDB_ROOT_USERNAME` / `_PASSWORD`). Settings are
constants at the top of each script.

### Backup

```sh
deploy/backup.sh
```

- Dumps database `cestaky` as a gzip archive to
  `/opt/instea/backup/mongo/dumps/mongo8/cestaky-<YYYY-MM-DD-HHMM>.gz`.
- Verifies the archive with `gzip -t`; a corrupt archive is not kept.
- Deletes `*.gz` files in that directory older than 14 days.
- Exits non-zero on any failure (pod not found, dump or copy failed).

Backups are manual, as before. Optional daily host cron line (root crontab):

```cron
30 2 * * * /opt/instea/cestaky/deploy/backup.sh >> /var/log/cestaky-backup.log 2>&1
```

### Restore

```sh
deploy/restore.sh [--drop] [--force-live] <archive> [target-db]
```

- Default target is `cestaky-restore`; collections are renamed
  `cestaky.* → <target-db>.*`.
- Without `--drop`, mongorestore only inserts (existing documents with the
  same `_id` are kept). With `--drop`, each collection is dropped first.
- Restoring into the live database `cestaky` needs `--force-live` and a
  typed confirmation `cestaky`. Stop the app first
  (`microk8s kubectl scale deployment cestaky-leaves-deployment --replicas=0`) and
  normally add `--drop`.

### Quarterly restore test

1. `deploy/backup.sh` and note the archive path.
2. `deploy/restore.sh --drop <archive>` (into `cestaky-restore`).
3. Compare document counts of the live and the restored database:

   ```sh
   POD=$(microk8s kubectl get pod -l app=mongo8 -o jsonpath='{.items[0].metadata.name}')
   microk8s kubectl exec "$POD" -c mongo8 -- sh -c 'mongosh --quiet \
     -u "$MONGO_INITDB_ROOT_USERNAME" -p "$MONGO_INITDB_ROOT_PASSWORD" \
     --authenticationDatabase admin --eval "
       for (const name of [\"cestaky\", \"cestaky-restore\"]) {
         const d = db.getSiblingDB(name);
         print(name, JSON.stringify(Object.fromEntries(
           d.getCollectionNames().sort().map(c => [c, d[c].countDocuments()]))));
       }"'
   ```

   The counts must match (allow for writes since the backup).

4. Drop the test database:
   `... --eval 'db.getSiblingDB("cestaky-restore").dropDatabase()'`.
5. Record the date and result in the ops log.

Tests: `pnpm lint:sh` (shellcheck) and
`apps/api/test/ops/backup-restore.int-spec.ts` (runs both scripts against a
mongo container through a fake `kubectl`).

## Releases (NFR-11)

Versions are bumped by release-please from Conventional Commit messages
(`release-please-config.json`, `.release-please-manifest.json`).

- **First release.** `release-as: 1.0.0` in `release-please-config.json`
  forces the cutover release to `1.0.0`. **Remove that line in the first PR
  after `v1.0.0` is released**, otherwise every later release PR is pinned
  to `1.0.0` again. `bootstrap-sha` (the last commit of the old app) makes
  the first changelog start at the rewrite; it is ignored once a release
  exists and may be removed together with `release-as`.
- **Repository settings** (GitHub → Settings):
  - Actions → General → "Allow GitHub Actions to create and approve pull
    requests" must be on, or release-please cannot open the release PR. The
    image is still pushed as `latest` / `sha-<7>` when it fails.
  - Release PRs opened with the default `GITHUB_TOKEN` do not trigger other
    workflows, so they get no CI checks and cannot be merged once checks are
    required on `master` (NFR-09). Add a repository secret
    `RELEASE_PLEASE_TOKEN` (GitHub App token or fine-grained PAT with
    Contents and Pull requests read/write on this repository);
    `release.yml` uses it instead of `GITHUB_TOKEN` when it is set.
  - Code security → Dependabot security updates: on.

## CI and branch protection (NFR-09)

### Workflows

| Workflow                         | Trigger                                                  | What it runs                                                                                                                            |
| -------------------------------- | -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `.github/workflows/ci.yml`       | PR to `master`, push to `master`                         | All merge gates below; on a green push to `master` also the release (job `release` calls `release.yml`).                                |
| `.github/workflows/e2e.yml`      | called by `ci.yml`, manual                               | Playwright E2E against the production image (TST-03).                                                                                   |
| `.github/workflows/security.yml` | called by `ci.yml`, weekly (Monday 06:00 UTC), manual    | `audit`, `dependency-review` (PR only), `image-scan` (NFR-04).                                                                          |
| `.github/workflows/release.yml`  | called by `ci.yml` only                                  | release-please, image build and push.                                                                                                   |
| `.github/workflows/pr-title.yml` | PR to `master` opened, edited, synchronized, reopened    | `commitlint`: the PR title is a Conventional Commit (NFR-11). Separate so a title edit re-runs only this check, not the whole pipeline. |
| `.github/workflows/parity.yml`   | PR to `master` touching attendance-related paths, manual | MIG-03 old vs new parity. Path-filtered, so **not** a required check (a required check that does not run stays pending).                |

Nothing runs twice per PR: `e2e.yml` and `security.yml` have no
`pull_request` / `push` trigger of their own, the OpenAPI checks moved into
`ci.yml`, and the PR title check exists only in `pr-title.yml`. Every
workflow uses `pnpm install --frozen-lockfile`, Node from `engines.node`
(`node-version-file: package.json`) and the pnpm store cache of
`actions/setup-node`.

Jobs and their check names (as GitHub shows them; a job of a called
workflow is shown as `<caller job> / <called job>`):

| Check                          | Runs                                                                                                                                                                                      |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `lint`                         | `pnpm lint`, `pnpm format:check`, `pnpm lint:md`, `pnpm lint:links`, `pnpm lint:sh`, `pnpm test:k8s` (kubeconform)                                                                        |
| `typecheck`                    | `pnpm typecheck`                                                                                                                                                                          |
| `unit`                         | `pnpm test:unit` (coverage thresholds, TST-01; report uploaded as artifact `coverage-unit`), `pnpm test:tz`                                                                               |
| `integration`                  | `pnpm test`: integration tests (MongoDB 8 and Mailpit via Testcontainers, TST-02) plus unit tests, to enforce the merged apps/api coverage threshold (TST-01; artifact `coverage-merged`) |
| `e2e / e2e`                    | production image build, compose stack, `pnpm e2e` (Chromium); report and traces uploaded on failure or flake                                                                              |
| `openapi`                      | `pnpm openapi:check`, `pnpm openapi:lint` (DOC-02)                                                                                                                                        |
| `security / audit`             | `pnpm audit` (prod: high, dev: critical), deprecated-dependency check, NFR-05 secrets lint                                                                                                |
| `security / dependency-review` | `actions/dependency-review-action` (fail on high); PR only, shown as skipped on push                                                                                                      |
| `security / image-scan`        | Trivy secret and misconfig scan of the repo, image build and Trivy image scan, Node 24 assertion, container smoke test                                                                    |
| `commitlint`                   | PR title check (`pr-title.yml`); PR only                                                                                                                                                  |

The release job (`release / release-please`, `release / image`) runs only
on push to `master`; it is shown as skipped on PRs and is not a required
check.

### Branch protection settings for `master`

Not applied yet: an admin of `instea/Cestovne-prikazy` must set them
(they cannot be set from the repository files).

- Require a pull request before merging (0 approvals required, unless the
  team wants reviews).
- Require status checks to pass before merging, with exactly these checks
  (source: GitHub Actions):
  - `lint`
  - `typecheck`
  - `unit`
  - `integration`
  - `e2e / e2e`
  - `openapi`
  - `security / audit`
  - `security / dependency-review`
  - `security / image-scan`
  - `commitlint`
- Require branches to be up to date before merging.
- Require linear history (follows from squash merge only).
- Do not allow force pushes; do not allow deletions.
- Do not allow bypassing the above settings (include administrators).
- Repository → General → Pull Requests: allow squash merging only (untick
  merge commits and rebase merging), default squash commit message "Pull
  request title and description", so the squash commit is the checked PR
  title.

GitHub UI: Settings → Branches → Add branch protection rule (classic) →
branch name pattern `master` → tick the settings above; under "Require
status checks to pass" search and add each check name. A check appears in
the search only after it has run once in the repository, so open the first
PR with these workflows before adding them. Then Settings → General → Pull
Requests for the merge methods.

Equivalent API calls (run by an admin with `gh auth login`; not run as part
of NFR-09). `app_id` 15368 is GitHub Actions, so only Actions can satisfy
the checks:

```sh
gh api -X PUT repos/instea/Cestovne-prikazy/branches/master/protection \
  -H "Accept: application/vnd.github+json" --input - <<'EOF'
{
  "required_status_checks": {
    "strict": true,
    "checks": [
      { "context": "lint", "app_id": 15368 },
      { "context": "typecheck", "app_id": 15368 },
      { "context": "unit", "app_id": 15368 },
      { "context": "integration", "app_id": 15368 },
      { "context": "e2e / e2e", "app_id": 15368 },
      { "context": "openapi", "app_id": 15368 },
      { "context": "security / audit", "app_id": 15368 },
      { "context": "security / dependency-review", "app_id": 15368 },
      { "context": "security / image-scan", "app_id": 15368 },
      { "context": "commitlint", "app_id": 15368 }
    ]
  },
  "enforce_admins": true,
  "required_pull_request_reviews": { "required_approving_review_count": 0 },
  "restrictions": null,
  "required_linear_history": true,
  "allow_force_pushes": false,
  "allow_deletions": false
}
EOF

gh api -X PATCH repos/instea/Cestovne-prikazy \
  -F allow_squash_merge=true -F allow_merge_commit=false \
  -F allow_rebase_merge=false \
  -f squash_merge_commit_title=PR_TITLE \
  -f squash_merge_commit_message=PR_BODY
```

Check afterwards with
`gh api repos/instea/Cestovne-prikazy/branches/master/protection` and add a
screenshot of the settings page to this section (NFR-09 test).

Other repository settings the pipeline needs:

- Secrets `DOCKER_REGISTRY_USERNAME`, `DOCKER_REGISTRY_PASSWORD` (existing,
  registry `registry.instea.co`) and `RELEASE_PLEASE_TOKEN` (see
  [Releases](#releases-nfr-11)).
- Actions → General → Fork pull request workflows: keep "Require approval"
  for outside contributors. Fork PRs never get the secrets (`pull_request`
  event) and never reach the release job (push only).
- `security / dependency-review` needs the dependency graph (Settings →
  Code security); on a private repository it also needs GitHub Code
  Security. Without it the job fails; then drop it from the required checks
  and record the decision here.

### Release and deploy flow

1. A PR passes all required checks and is squash-merged; the PR title
   becomes the Conventional Commit on `master`.
2. The push to `master` runs `ci.yml` again on the merged commit. `master`
   runs queue in merge order (never cancelled by a newer push; a newer
   pending run replaces an older pending one).
3. When every gate passes, job `release` calls `release.yml`:
   release-please opens / updates the release PR (or, for a merged release
   PR, creates tag `vX.Y.Z` and the GitHub release), then the image is built
   with `APP_VERSION` and pushed as
   `registry.instea.co/cestaky-leaves:latest` and `:sha-<7 char sha>` (plus
   `:X.Y.Z` and `:X.Y` on a release). Releases and tags are never deleted or
   recreated.
4. Keel (`keel.sh/policy: force`, `match-tag`, registry webhook, poll every
   10 minutes as fallback) sees the new `latest` digest and rolls out
   `cestaky-leaves-deployment` (OPS-03). Roll back by pinning the
   Deployment to an earlier `sha-<7>` tag.

A red CI run on `master` pushes no image, so nothing is deployed.

### Verification plan (not yet done)

To do by the team once the workflows are on GitHub and the protection rule
is set: one throwaway PR per failure type (closed afterwards). Each must
show the named check red and the merge button blocked.

- [ ] Lint error (unused variable) → `lint` fails.
- [ ] Bad formatting / broken Markdown link → `lint` fails.
- [ ] Type error → `typecheck` fails.
- [ ] Failing unit test, and coverage below threshold → `unit` fails.
- [ ] Failing integration test, and apps/api coverage below threshold →
      `integration` fails.
- [ ] Failing E2E spec → `e2e / e2e` fails, Playwright report uploaded.
- [ ] Changed DTO without regenerating `openapi.json` → `openapi` fails.
- [ ] Known-vulnerable dependency (`lodash@4.17.4`) → `security / audit`
      and `security / dependency-review` fail.
- [ ] Committed fake private key → `security / image-scan` fails.
- [ ] PR title `update stuff` → `commitlint` fails; fixing the title
      re-runs only `commitlint`.
- [ ] PR from a fork → checks run, no secrets, no image push.
- [ ] Green PR merged → `release` runs, image `latest` and `sha-<7>` in the
      registry, release-please release PR updated, Keel rolls out.
- [ ] Second push to `master` → no release or tag deleted.
- [ ] Screenshot of the branch protection settings added above.

## Promote an admin (AUTH-04)

Bootstrap of the first admin, and the recovery path when no admin is left
(user administration has no last-admin guard). The user must have signed in
once. The email is matched case-insensitively.

```sh
microk8s kubectl exec deploy/cestaky-leaves-deployment -- \
  node dist/cli.js promote-admin --email=jan.novak@instea.co
```

Locally: `pnpm --filter @leaves/api cli promote-admin --email=<email>` (uses
`MONGO_URL` from `.env`). Exit codes: `0` promoted or already an admin, `1`
not found / deactivated / database error, `2` usage. A promotion writes a
`USER_ROLE_CHANGED` audit entry with actor `CLI`.

## GDPR anonymization (NFR-08)

An admin anonymizes a user on `/users` ("Anonymize", confirmed by typing the
email). It is blocked while the SSO directory still lists the email (remove
the person from SSO first) and fails when SSO is unreachable. It is
irreversible. It replaces the email and names in the app database only,
including the names in the user's audit entries. Copies outside the database
are not erased:

- backup dumps keep the old data until the 14-day rotation deletes them;
- stdout logs follow the cluster log rotation;
- emails already sent and earlier GDPR export files (NFR-07) are outside the
  system.

## Runtime and library versions (NFR-12)

- **Node 24 LTS** everywhere: `engines.node` (`>=24 <25`, also read by CI), the
  Docker base image `node:24-slim` (pinned by digest; Dependabot proposes
  new digests, Node majors are ignored). The CI `image-scan` job asserts
  Node 24 inside the built image.
- **pnpm**: exact version in the root `packageManager` field (Corepack).
- **MongoDB 8.0**: the k8s StatefulSet and the test containers use the same
  digest-pinned `mongo:8.0` image (asserted by
  `apps/api/test/ops/manifests.int-spec.ts`); docker-compose uses `mongo:8.0`.
- **Deprecated packages**: the CI `audit` job runs
  `scripts/check-deprecated.mjs`; a deprecated direct production dependency
  fails it, deprecated transitive ones are reported as warnings.
- Before each release, review `pnpm outdated -r` (informational).

Direct dependencies intentionally kept one major behind the latest release:

| Package       | Kept on | Latest | Reason                                                                                                                              |
| ------------- | ------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| `mongoose`    | 8.x     | 9.x    | The rewrite spec fixes Mongoose 8 (target stack); upgrade is a separate decision.                                                   |
| `@types/node` | 24.x    | 26.x   | Types must match the Node 24 LTS runtime.                                                                                           |
| `typescript`  | 6.0.x   | 7.x    | TypeScript 7 (native compiler) is adopted once `typescript-eslint` and the Nest CLI build support it; re-check before each release. |

## Migration rehearsal (MIG-02)

Anonymized production dump and recorded SSO / Toggl fixtures: runbook in
[`apps/api/test/parity/README.md`](../apps/api/test/parity/README.md#mig-02-rehearsal-runbook).
