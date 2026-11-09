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
    workflows. Once checks are required on `master` (NFR-09), give
    release-please a GitHub App or fine-grained PAT token (`token:` input)
    so its PRs get checks.
  - Code security → Dependabot security updates: on.

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
