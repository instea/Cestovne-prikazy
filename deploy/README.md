# Deployment and operations

Operator guide for the Leaves app on the Instea MicroK8s cluster: first
deployment, secrets, Keel, releases, health checks, backup and restore,
migration, troubleshooting, CI. Local development is in the root
[`README.md`](../README.md); the app's environment variables are listed
there ([Environment variables](../README.md#environment-variables)).

All commands run on the MicroK8s host in namespace `default`, from a
checkout of this repository (`/opt/instea/cestaky` in the examples).

## Contents

- [Architecture](#architecture)
- [First-time setup](#first-time-setup)
- [Release and rollout](#release-and-rollout)
- [Health check and probes (OPS-01)](#health-check-and-probes-ops-01)
- [Database backup and restore (OPS-02)](#database-backup-and-restore-ops-02)
- [Migration and cutover](#migration-and-cutover)
- [Promote an admin (AUTH-04)](#promote-an-admin-auth-04)
- [GDPR anonymization (NFR-08)](#gdpr-anonymization-nfr-08)
- [Troubleshooting](#troubleshooting)
- [CI and branch protection (NFR-09)](#ci-and-branch-protection-nfr-09)
- [Runtime and library versions (NFR-12)](#runtime-and-library-versions-nfr-12)

## Architecture

```text
browser ─ https://cestaky.instea.co
  → host nginx (TLS, unchanged)
  → MicroK8s ingress controller, class `public`
  → Ingress `cestaky-ingress`: path /cestaky/?(.*) rewritten to /$1
  → Service `cestaky-leaves-service` :80
  → Pod of Deployment `cestaky-leaves-deployment` :4100
      one container: NestJS API (/api/**, /health-check) + the SPA (/)
  → Service `mongo8-service` :27017
  → StatefulSet `mongo8-sfset` (MongoDB 8, single-member replica set rs0,
    PVC `mongo8-pvc` 2Gi, headless Service `mongo8-headless`)
```

Manifests are in [`k8s/`](k8s/) (OPS-03):

| File                                               | Objects                                                                                       |
| -------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| [`k8s/mongo8.yml`](k8s/mongo8.yml)                 | PVC `mongo8-pvc`, Services `mongo8-headless` and `mongo8-service`, StatefulSet `mongo8-sfset` |
| [`k8s/mongo8-rs-init.yml`](k8s/mongo8-rs-init.yml) | ConfigMap `mongo8-rs-init-script`, Job `mongo8-rs-init` (replica set and app user)            |
| [`k8s/config.yml`](k8s/config.yml)                 | ConfigMap `cestaky-leaves-config` (non-secret settings)                                       |
| [`k8s/app.yml`](k8s/app.yml)                       | Deployment `cestaky-leaves-deployment` (Keel annotations), Service `cestaky-leaves-service`   |
| [`k8s/ingress.yml`](k8s/ingress.yml)               | Ingress `cestaky-ingress` (applied at cutover, MIG-04)                                        |
| [`k8s/keel/values.yaml`](k8s/keel/values.yaml)     | Helm values of Keel                                                                           |
| [`k8s/secrets.example.md`](k8s/secrets.example.md) | Secret names and keys (no values)                                                             |

Images come from `registry.instea.co/cestaky-leaves` (pull secret
`instea-registry`). Keel (namespace `keel`) rolls out new `latest` images.
The names differ from the old app's (`cestaky-deployment`, `mongo3-*`,
image `cestovne-prikazy`), so the old manifests stay usable for a rollback
until the cutover is complete.

## First-time setup

### 1. Check the host CPU (AVX)

MongoDB 5.0 and later need AVX on x86_64. Before the cutover, on the VPS
host:

```sh
grep -m1 -o -w avx /proc/cpuinfo          # must print: avx
docker run --rm mongo:8.0 mongod --version # must print the version
```

No output from `grep`, or `Illegal instruction` from `mongod`, means no AVX:
MongoDB 8 cannot run on this host and the cutover is blocked.

### 2. Create the Secrets

Secret values never go into the repository. Create the Secrets by hand
before you apply the manifests; key names and their use are in
[`k8s/secrets.example.md`](k8s/secrets.example.md).

| Secret                   | Keys                                                                                                                           |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| `mongo8-secrets`         | `MONGO_INITDB_ROOT_USERNAME`, `MONGO_INITDB_ROOT_PASSWORD`, `MONGO_APP_USERNAME`, `MONGO_APP_PASSWORD`, `keyfile` (file)       |
| `cestaky-leaves-secrets` | `MONGO_URL`, `JWT_ACCESS_SECRET`, `SMTP_USER`, `SMTP_PASSWORD`, `M2M_USERNAME`, `M2M_PASSWORD`, `SSO_USERNAME`, `SSO_PASSWORD` |
| `instea-registry`        | registry credentials for `registry.instea.co` (already exists in the cluster)                                                  |

Run the commands in a shell that does not keep history (for example, start
with `set +o history`), or type the values at a prompt. Set `APP_PW` first,
for example `APP_PW="$(openssl rand -hex 24)"` (hex, so it needs no URL
encoding). Replace every `<…>` with the real value.

```sh
openssl rand -base64 756 > keyfile

microk8s kubectl create secret generic mongo8-secrets \
  --from-literal=MONGO_INITDB_ROOT_USERNAME=root \
  --from-literal=MONGO_INITDB_ROOT_PASSWORD="$(openssl rand -hex 24)" \
  --from-literal=MONGO_APP_USERNAME=cestaky \
  --from-literal=MONGO_APP_PASSWORD="$APP_PW" \
  --from-file=keyfile=./keyfile

microk8s kubectl create secret generic cestaky-leaves-secrets \
  --from-literal=MONGO_URL="mongodb://cestaky:$APP_PW@mongo8-service:27017/cestaky?authSource=cestaky&replicaSet=rs0" \
  --from-literal=JWT_ACCESS_SECRET="$(openssl rand -base64 48)" \
  --from-literal=SMTP_USER=<SMTP user> \
  --from-literal=SMTP_PASSWORD=<SMTP password> \
  --from-literal=M2M_USERNAME=<attendance M2M user> \
  --from-literal=M2M_PASSWORD=<attendance M2M password> \
  --from-literal=SSO_USERNAME=<SSO meta API user> \
  --from-literal=SSO_PASSWORD=<SSO meta API password>

rm keyfile
```

`MONGO_URL` format: `mongodb://<app user>:<password>@mongo8-service:27017/cestaky?authSource=cestaky&replicaSet=rs0`
(URL-encode special characters). At cutover, `M2M_USERNAME` /
`M2M_PASSWORD` keep the old values so the attendance consumer needs no
change. To change a value of `cestaky-leaves-secrets` later (except the
password inside `MONGO_URL`, see below): `microk8s kubectl create secret
generic cestaky-leaves-secrets … --dry-run=client -o yaml | microk8s kubectl
apply -f -`, then `microk8s kubectl rollout restart deployment
cestaky-leaves-deployment`.

#### Changing the MongoDB passwords

The MongoDB users live in the database, not in the Secret: MongoDB reads
`MONGO_INITDB_ROOT_*` only when it starts on an empty data directory, and
Job `mongo8-rs-init` only creates the app user when it is missing (it never
changes an existing user). Editing `mongo8-secrets` alone therefore changes
no password. Change it in MongoDB first, then in the Secrets.

App user (`MONGO_APP_USERNAME`, `cestaky` above; it is defined in database
`cestaky`, hence `authSource=cestaky`):

1. Open a root shell (it reads the current root password from the pod):

   ```sh
   microk8s kubectl exec -it mongo8-sfset-0 -c mongo8 -- sh -c \
     'mongosh -u "$MONGO_INITDB_ROOT_USERNAME" -p "$MONGO_INITDB_ROOT_PASSWORD" --authenticationDatabase admin'
   ```

   and run (open connections of the app stay authenticated, new ones fail
   until step 3):

   ```js
   db.getSiblingDB('cestaky').changeUserPassword(
     'cestaky',
     '<new app password>',
   );
   ```

2. Put the new password into both Secrets: `MONGO_APP_PASSWORD` in
   `mongo8-secrets` (so a re-created database gets the same one) and the
   password part of `MONGO_URL` in `cestaky-leaves-secrets`. Re-create each
   Secret with all its keys (commands as in step 2 above) and apply it over
   the existing one:

   ```sh
   microk8s kubectl create secret generic <name> … --dry-run=client -o yaml \
     | microk8s kubectl apply -f -
   ```

3. `microk8s kubectl rollout restart deployment/cestaky-leaves-deployment`
   and check `/health-check` (see [The app](#4-the-app)).

Root user (`MONGO_INITDB_ROOT_USERNAME`, `root` above, defined in database
`admin`):

1. In the root shell above:

   ```js
   db.getSiblingDB('admin').changeUserPassword('root', '<new root password>');
   ```

2. Update `MONGO_INITDB_ROOT_PASSWORD` in `mongo8-secrets` the same way.
   MongoDB uses it only to create the root user on a fresh data directory,
   but `deploy/backup.sh`, `deploy/restore.sh` and the root shell read it
   from the environment of the `mongo8` container.
3. `microk8s kubectl rollout restart statefulset/mongo8-sfset` so the pod
   gets the new value (short database outage: one member), then run
   `deploy/backup.sh` once to check it.

Non-secret settings (`BASE_URL`, `GOOGLE_CLIENT_ID`, SMTP host, mail
addresses, `SSO_URI`, …) are in [`k8s/config.yml`](k8s/config.yml);
change them there, commit, apply, and restart the Deployment.

### 3. MongoDB and the replica-set init Job

```sh
cd /opt/instea/cestaky/deploy/k8s
microk8s kubectl apply -f mongo8.yml
microk8s kubectl rollout status statefulset mongo8-sfset --timeout=180s

microk8s kubectl apply -f mongo8-rs-init.yml
microk8s kubectl wait --for=condition=complete job/mongo8-rs-init --timeout=300s
microk8s kubectl logs job/mongo8-rs-init
```

Job `mongo8-rs-init` is idempotent: it initiates replica set `rs0` with the
member `mongo8-sfset-0.mongo8-headless.default.svc.cluster.local:27017`
when it is not initiated yet, waits for PRIMARY, and creates the app user
(`readWrite` on `cestaky`, `read` on `cestaky_legacy`) when missing. It
only creates, never updates: an existing app user keeps its password and
roles (to change the password, see
[Changing the MongoDB passwords](#changing-the-mongodb-passwords)). To run
it again (for example after the app user was dropped):

```sh
microk8s kubectl delete job mongo8-rs-init
microk8s kubectl apply -f mongo8-rs-init.yml
```

Check the replica set: `rs.status()` shows one member in state `PRIMARY`
(see [Troubleshooting](#troubleshooting) for a `mongosh` shell).

### 4. The app

```sh
microk8s kubectl apply -f config.yml
microk8s kubectl apply -f app.yml
microk8s kubectl rollout status deployment cestaky-leaves-deployment --timeout=180s

microk8s kubectl port-forward service/cestaky-leaves-service 10082:80
curl -i http://localhost:10082/health-check   # in a second shell: 200 {"checkMongo":"ok"}
```

Then promote the first admin (after that person signed in once), see
[Promote an admin](#promote-an-admin-auth-04).

### 5. The ingress

`ingress.yml` replaces the old app's Ingress `cestaky-ingress` (same name,
class `public`, `/cestaky` prefix) and is applied only at cutover (MIG-04,
step 14): `microk8s kubectl apply -f ingress.yml`. The host nginx forwards
`https://cestaky.instea.co` to the ingress controller and stays unchanged.

### 6. Keel (auto-deploy)

Keel is already installed in the cluster for the old app; these steps are
for a new cluster or a reinstall. Flow: a green `master` build pushes the
image → the registry sends a push notification to Keel → Keel rolls out
`cestaky-leaves-deployment` (annotations in [`k8s/app.yml`](k8s/app.yml):
`keel.sh/policy: force`, `keel.sh/match-tag: 'true'`, `keel.sh/trigger:
poll`, `keel.sh/pollSchedule: '@every 10m'`). If the webhook gets lost,
Keel polls the registry every 10 minutes.

Install Keel (Helm values: [`k8s/keel/values.yaml`](k8s/keel/values.yaml):
Keel 0.22.4, polling, ClusterIP `10.152.183.200:9300`, no Helm provider):

```sh
sudo microk8s enable helm3
sudo microk8s kubectl get svc -A | grep 10.152.183.200    # must print nothing: the IP is reserved for Keel
sudo microk8s helm3 repo add keel https://charts.keel.sh
sudo microk8s helm3 repo update
sudo microk8s helm3 upgrade --install keel keel/keel -n keel --create-namespace -f keel/values.yaml
sudo microk8s kubectl -n keel rollout status deploy/keel
sudo microk8s kubectl apply -f app.yml
sudo microk8s kubectl -n keel logs deploy/keel | grep -i cestaky-leaves   # image is tracked
```

Send push notifications from the registry (verify on the host): by
default the registry notifies nobody, so add a `notifications` endpoint
pointing to Keel. `/v1/webhooks/registry` has no authentication, so it must
stay on the ClusterIP (not reachable from the internet). **Merge** this
`notifications` block into the registry's existing config file; do not
mount a file with only this block over it, because the file replaces the
whole configuration (storage, auth, HTTP settings):

```yaml
notifications:
  endpoints:
    - name: keel
      url: http://10.152.183.200:9300/v1/webhooks/registry
      timeout: 3s
      threshold: 5
      backoff: 10s
      ignore:
        actions:
          - pull
```

Where the registry reads its config file depends on its version (check
the image tag in the registry's `docker-compose.yml`, and whether it
already mounts a config file there):

- `registry:2` (Docker Distribution 2.x): `/etc/docker/registry/config.yml`;
- `registry:3` (Distribution 3.x): `/etc/distribution/config.yml` (the path
  the official image passes in its `CMD`).

If the registry runs on the image's built-in config, copy that file out of
the container first (for example `docker compose cp
<registry service>:/etc/distribution/config.yml ./config.yml`), add the
block, mount the merged file read-only at the same path and recreate the
registry container. Then push an image and check that Keel logs the
webhook (`microk8s kubectl -n keel logs deploy/keel --since=5m`).

## Release and rollout

Versions follow semantic versioning, bumped by release-please from the
Conventional Commit messages on `master` (NFR-11;
`release-please-config.json`, `.release-please-manifest.json`).

### Flow

1. A PR passes all required checks (see
   [CI and branch protection](#ci-and-branch-protection-nfr-09)) and is
   squash-merged; the PR title becomes the Conventional Commit on `master`.
2. The push to `master` runs `ci.yml` again on the merged commit. `master`
   runs queue in merge order (never cancelled by a newer push; a newer
   pending run replaces an older pending one).
3. When every gate passes, job `release` calls `release.yml`:
   release-please opens / updates the release PR (or, for a merged release
   PR, creates tag `vX.Y.Z` and the GitHub release), then the image is built
   with `APP_VERSION` and pushed as
   `registry.instea.co/cestaky-leaves:sha-<7 char sha>` (plus `:X.Y.Z` and
   `:X.Y` on a release). A final step points `:latest` at that image
   **only if the run's commit is still the head of `master`**. Re-running a
   superseded `master` run (for example after a flaky failure) pushes its
   `sha-<7>` tag but leaves `latest` unchanged, so it cannot roll
   production back. Releases and tags are never deleted or recreated.
4. Keel sees the new `latest` digest (webhook within seconds, polling
   within 10 minutes) and rolls out `cestaky-leaves-deployment`:
   RollingUpdate with `maxSurge: 1`, `maxUnavailable: 0`, so the old pod
   serves until the new one is Ready (readiness probe, see
   [Health check and probes](#health-check-and-probes-ops-01)).

A red CI run on `master` pushes no image, so nothing is deployed.

Watch a rollout:

```sh
microk8s kubectl -n keel logs deploy/keel --since=15m | grep -i cestaky-leaves
microk8s kubectl rollout status deployment cestaky-leaves-deployment
microk8s kubectl get pods -l app=cestaky-leaves -o wide
```

### Rollback

Pin the Deployment to an earlier image (Keel `match-tag` keeps it there
until the Deployment points at `latest` again):

```sh
microk8s kubectl set image deployment/cestaky-leaves-deployment \
  cestaky-leaves=registry.instea.co/cestaky-leaves:sha-<7 char sha>
microk8s kubectl rollout status deployment cestaky-leaves-deployment
```

Return to auto-deploy by applying `app.yml` again (image `:latest`) once a
fixed build is on `master`. A rollback of the app does not roll back the
database (restore a backup for that, see
[Restore](#restore)).

### First release and repository settings

- **First release.** `release-as: 1.0.0` in `release-please-config.json`
  forces the cutover release to `1.0.0`. **Remove that line in the first PR
  after `v1.0.0` is released**, otherwise every later release PR is pinned
  to `1.0.0` again. `bootstrap-sha` (the last commit of the old app) makes
  the first changelog start at the rewrite; it is ignored once a release
  exists and may be removed together with `release-as`.
- **Repository settings** (GitHub → Settings):
  - Actions → General → "Allow GitHub Actions to create and approve pull
    requests" must be on, or release-please cannot open the release PR. The
    image is still pushed (`sha-<7>`, and `latest` as above) when it fails.
  - Release PRs opened with the default `GITHUB_TOKEN` do not trigger other
    workflows, so they get no CI checks and cannot be merged once checks are
    required on `master` (NFR-09). Add a repository secret
    `RELEASE_PLEASE_TOKEN` (GitHub App token or fine-grained PAT with
    Contents and Pull requests read/write on this repository);
    `release.yml` uses it instead of `GITHUB_TOKEN` when it is set.
  - Code security → Dependabot security updates: on.

## Health check and probes (OPS-01)

`GET /health-check` (also `HEAD`; no auth, outside `/api`) pings MongoDB
with a 2 s timeout:

- `200 {"checkMongo":"ok"}`;
- `500 {"checkMongo":"<error>"}` when MongoDB is not connected or does not
  answer.

Probes in [`k8s/app.yml`](k8s/app.yml):

| Probe     | Check                     | Timing                                                                |
| --------- | ------------------------- | --------------------------------------------------------------------- |
| readiness | `GET /health-check` :4100 | initial delay 5 s, every 5 s, timeout 3 s, 3 failures → not Ready     |
| liveness  | TCP socket :4100          | initial delay 30 s, every 20 s (restarts a hung process; no DB check) |

Fail fast: when MongoDB is unreachable at startup (10 s server selection)
the process logs `Connect to database failed -> exiting` and exits with
status 255; when the connection is lost later it logs `Disconnected from
the database -> exiting` and exits with 254. Kubernetes then restarts the
pod (`CrashLoopBackOff` while MongoDB stays down). SIGTERM shuts down
gracefully (exit 0). MongoDB itself has an `exec` readiness probe
(`db.adminCommand('ping')`).

Check from the host:

```sh
microk8s kubectl port-forward service/cestaky-leaves-service 10082:80
curl -i http://localhost:10082/health-check
curl -i https://cestaky.instea.co/health-check   # after cutover
```

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

   ```sh
   microk8s kubectl exec "$POD" -c mongo8 -- sh -c 'mongosh --quiet \
     -u "$MONGO_INITDB_ROOT_USERNAME" -p "$MONGO_INITDB_ROOT_PASSWORD" \
     --authenticationDatabase admin \
     --eval "printjson(db.getSiblingDB(\"cestaky-restore\").dropDatabase())"'
   ```

5. Record the date and result in the ops log.

Tests: `pnpm lint:sh` (shellcheck) and
`apps/api/test/ops/backup-restore.int-spec.ts` (runs both scripts against a
mongo container through a fake `kubectl`).

## Migration and cutover

- **Migration tool (MIG-01):** `node dist/migration/migrate-legacy.js
[--dry-run] [--replace] [--report-dir <path>]` in the app image (dev:
  `pnpm --filter @leaves/api migrate:legacy`), reading the restored old
  database from `LEGACY_MONGO_URL` (`cestaky_legacy`) into `MONGO_URL`.
- **Rehearsal (MIG-02):** anonymized production dump and recorded SSO /
  Toggl fixtures: runbook in
  [`apps/api/test/parity/README.md`](../apps/api/test/parity/README.md#mig-02-rehearsal-runbook).
- **Cutover runbook (MIG-04):** the step-by-step production cutover
  (announcement, maintenance page, final dump, removal of the old stack,
  deployment as in [First-time setup](#first-time-setup), migration,
  smoke test, ingress switch, rollback) is written by task MIG-04 as
  `deploy/CUTOVER.md` (rewrite step 15) and linked here when it exists.
  Until then the ingress (`k8s/ingress.yml`) is not applied.

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
not found / deactivated / database error, `2` usage (`node dist/cli.js`
exits with these; through pnpm any failure is 1). A promotion writes a
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

## Troubleshooting

State and logs:

```sh
microk8s kubectl get pods -o wide                       # app, mongo8, jobs
microk8s kubectl describe pod -l app=cestaky-leaves     # events: image pull, probes, OOMKilled
microk8s kubectl logs deploy/cestaky-leaves-deployment --tail=200
microk8s kubectl logs deploy/cestaky-leaves-deployment --previous   # the crashed container
microk8s kubectl logs mongo8-sfset-0 -c mongo8 --tail=100
microk8s kubectl get events --sort-by=.lastTimestamp | tail -30
microk8s kubectl top pod                                # memory vs limit (app 512Mi, mongo8 1Gi)
```

The app logs JSON lines (one per request, with `x-request-id`); startup
logs the version and `NODE_ENV`.

Reach the app or MongoDB directly:

```sh
microk8s kubectl port-forward service/cestaky-leaves-service 10082:80
curl -i http://localhost:10082/health-check

microk8s kubectl exec -it mongo8-sfset-0 -c mongo8 -- sh -c \
  'mongosh -u "$MONGO_INITDB_ROOT_USERNAME" -p "$MONGO_INITDB_ROOT_PASSWORD" --authenticationDatabase admin'
# then: rs.status().members.map(m => m.stateStr)   → [ 'PRIMARY' ]
```

| Symptom                                                    | Likely cause and fix                                                                                                                                                                                                                                     |
| ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pod `CrashLoopBackOff`, log `Invalid configuration: …`     | A required variable is missing or invalid (the log lists each). Fix the ConfigMap or Secret, then `rollout restart`.                                                                                                                                     |
| Pod `CreateContainerConfigError`                           | A Secret or one of its keys is missing (`describe pod` names it). Every key in [`k8s/secrets.example.md`](k8s/secrets.example.md) must exist.                                                                                                            |
| Log `Connect to database failed -> exiting` (exit 255)     | MongoDB not Ready, wrong `MONGO_URL`, app user missing (re-run `mongo8-rs-init`) or replica set not initiated.                                                                                                                                           |
| Log `Disconnected from the database -> exiting` (exit 254) | MongoDB restarted or was OOM-killed; the app restarts by itself. Check the `mongo8` logs and `kubectl top pod`.                                                                                                                                          |
| Pod not Ready, readiness probe 500                         | `/health-check` cannot ping MongoDB; see the two rows above.                                                                                                                                                                                             |
| `ImagePullBackOff`                                         | Secret `instea-registry` missing or the tag does not exist in `registry.instea.co/cestaky-leaves`.                                                                                                                                                       |
| New build not deployed                                     | Keel: `microk8s kubectl -n keel logs deploy/keel`. Was `latest` moved (the release run was the head of `master`, see [Release and rollout](#release-and-rollout))? Is the Deployment pinned to a `sha-` tag?                                             |
| `mongod` exits with `Illegal instruction`                  | The CPU has no AVX, see [First-time setup](#1-check-the-host-cpu-avx).                                                                                                                                                                                   |
| 404 for the whole site through the public URL              | Ingress or host nginx. `microk8s kubectl get ingress cestaky-ingress -o yaml`; controller logs: `microk8s kubectl -n ingress logs -l name=nginx-ingress-microk8s --tail=100`; shell: `microk8s kubectl -n ingress exec -it <controller pod> -- /bin/sh`. |
| Sign-in fails with "wrong domain" for everyone             | `HOSTED_DOMAIN` in `k8s/config.yml` does not match the Google Workspace domain.                                                                                                                                                                          |
| No emails                                                  | `SMTP_*` and `MAIL_SENDER` values; check the app log for mail errors.                                                                                                                                                                                    |
| Attendance API 401                                         | Wrong M2M credentials of the caller, or `M2M_USERNAME` / `M2M_PASSWORD` changed in the Secret.                                                                                                                                                           |

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
`ci.yml`, and the PR title check exists only in `pr-title.yml`. Every job
that installs dependencies (in `ci.yml`, `e2e.yml`, `security.yml` and
`parity.yml`) uses `pnpm install --frozen-lockfile` (`--ignore-scripts` in
`audit`), Node from `engines.node` (`node-version-file: package.json`) and
the pnpm store cache of `actions/setup-node`. `pr-title.yml` (one action on
the PR title) and `release.yml` (release-please and a Docker build) install
neither Node nor dependencies.

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
  [First release and repository settings](#first-release-and-repository-settings)).
- Actions → General → Fork pull request workflows: keep "Require approval"
  for outside contributors. Fork PRs never get the secrets (`pull_request`
  event) and never reach the release job (push only).
- `security / dependency-review` needs the dependency graph (Settings →
  Code security); on a private repository it also needs GitHub Code
  Security. Without it the job fails; then drop it from the required checks
  and record the decision here.

### Release and deploy flow

See [Release and rollout](#release-and-rollout).

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
- [ ] Re-run of a superseded `master` run → its `sha-<7>` tag is pushed,
      `latest` is unchanged (notice in the job log).
- [ ] Screenshot of the branch protection settings added above.

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
