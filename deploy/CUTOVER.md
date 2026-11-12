# Cutover runbook (MIG-04)

Moves production from the old app (`cestaky-deployment`, MongoDB 3.6
`mongo3-sfset`, image `registry.instea.co/cestovne-prikazy`) to the new
Leaves app (this repository) in **one announced downtime window**. The old
stack is removed before the new one is deployed; there is no side-by-side
run. Rollback is a redeploy of the old manifests (git tag `legacy-final`)
and the old image (`cestovne-prikazy:0.1.0`) with the final dump; data
written in the new app after the cutover is then lost (accepted).

The public URL `https://cestaky.instea.co`, the `/cestaky` ingress prefix,
the attendance URL `GET /api/attendence/<year>/<month>` and the M2M
credentials do not change.

First-time setup of the new stack (Secrets, MongoDB 8, replica-set init
Job, app, ingress, Keel) is described once, in
[`README.md` › First-time setup](README.md#first-time-setup); this runbook
refers to it instead of repeating it.

## Contents

- [Roles](#roles)
- [Conventions](#conventions)
- [Decision log](#decision-log)
- [Before the window](#before-the-window)
- [Timing](#timing)
- [Runbook](#runbook)
- [Abort (before step 8)](#abort-before-step-8)
- [Rollback (after step 8)](#rollback-after-step-8)
- [Local rehearsal](#local-rehearsal)

## Roles

| Role              | Who                                                     | Does                                                                                                                                                            |
| ----------------- | ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Operator**      | `<operator>` (shell on the MicroK8s host, root on host) | Runs every command; keeps the decision log; copies files to the encrypted drive.                                                                                |
| **Product owner** | `<product owner>`                                       | Announces the window and its end; decides go/no-go (step 12), Abort and Rollback; signs in as admin in the smoke test (step 13).                                |
| **User**          | `<repository owner>`                                    | Repository tasks before the window: MIG-02 sign-off, merge of the manifests, release `v1.0.0`, tag `legacy-final`; signs in as a normal user in the smoke test. |

The M2M consumer owner (`<M2M consumer owner>`) is informed in steps 1
and 15 and confirms the first successful call after the cutover.

## Conventions

- All commands run on the MicroK8s host in namespace `default`, as in
  [`README.md`](README.md). Replace every `<…>`; never paste a secret value
  into this file, a ticket or a chat.
- Run the window in one shell without history (`set +o history`) and a
  terminal log that is **not** kept (some commands print credentials of the
  old database).
- Variables used below (set once at the start of the window):

  ```sh
  set +o history
  export D="$(date +%F)"                     # date of the window, e.g. 2026-12-05
  export CUT="/opt/instea/cutover/$D"        # working directory on the host (personal data: mode 700)
  export REPO=/opt/instea/cestaky            # checkout of master at tag v1.0.0 (new manifests)
  export LEGACY=/opt/instea/cestaky-legacy   # checkout of tag legacy-final (old manifests and scripts)
  sudo install -d -m 0700 -o "$USER" "$CUT" && cd "$CUT"
  git -C "$REPO" fetch --tags && git -C "$REPO" checkout v1.0.0
  git -C "$REPO" worktree add "$LEGACY" legacy-final
  ```

- **Encrypted drive**: `<encrypted company drive>/cestaky-cutover-$D/`
  (final dump, download archive, `SHA256SUMS`, migration reports, exported
  old objects).
- **Ops folder** (private, not in git): `<ops folder>/cestaky-cutover/`
  (decision log, MIG-02 `decisions.csv` and sign-off, fix script, filled
  copies of the old scripts).

## Decision log

Every check result, count, timing and decision of the window goes to
`<ops folder>/cestaky-cutover/decision-log-$D.md` (private: it contains
record ids). Minimum entries: start and end time of each step; counts of
steps 6, 7, 10 and 11; dry-run vs. last rehearsal comparison; go/no-go
result and who decided; smoke test result; any deviation from this runbook
and why. The MIG-02 decisions file and sign-off note live in the same
folder.

## Before the window

| Done | Item                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Who                     |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- |
| [ ]  | **MIG-02 signed off**: last rehearsal report has 0 errors, every warning code decided in `decisions.csv`, `migrated + skipped = source`; sign-off note (date, dump date, counts, parity result, approver) in the ops folder. Fixes decided as `fix-in-source-before-cutover` are written as one reviewed `mongosh` script (`<ops folder>/cestaky-cutover/fix-cestaky-legacy.js`) or there are none.                                                        | User, product owner     |
| [ ]  | **MIG-03 parity green** on the last rehearsal: zero `DIFF`, or every `DIFF` decided in the decision log; the M2M consumer owner's confirmation that it calls the endpoint server-side is in the parity report.                                                                                                                                                                                                                                             | Operator                |
| [ ]  | **Rehearsal of steps 6–13 and of the Rollback** with the anonymized dump ([Local rehearsal](#local-rehearsal)); timings copied into [Timing](#timing); the announced duration is based on them.                                                                                                                                                                                                                                                            | Operator                |
| [ ]  | **AVX check** on the VPS passed ([`README.md` › 1. Check the host CPU](README.md#1-check-the-host-cpu-avx)).                                                                                                                                                                                                                                                                                                                                               | Operator                |
| [ ]  | **New manifests merged** to `master` (`deploy/k8s/*.yml`, including `migrate-legacy-job.yml`).                                                                                                                                                                                                                                                                                                                                                             | User                    |
| [ ]  | **Image `registry.instea.co/cestaky-leaves:1.0.0` built**: release PR `v1.0.0` merged (NFR-11), the release run pushed `:1.0.0` and moved `:latest` to it. Check: `docker pull registry.instea.co/cestaky-leaves:1.0.0` on the host.                                                                                                                                                                                                                       | User                    |
| [ ]  | **Git tag `legacy-final`** created on the last commit of the old app (the one with `kubernetes/cestaky.yml`, `mongo3.yml`, `backup.cestaky.sh`, `restore.sh`; `193b89f` unless the old app changed since) and pushed: `git tag -a legacy-final <commit> -m "Old app before the MIG-04 cutover"` and `git push origin legacy-final`. Never moved or deleted.                                                                                                | User                    |
| [ ]  | **Old image kept**: `registry.instea.co/cestovne-prikazy:0.1.0` exists and no registry clean-up removes it. Its digest equals the running pod's image: `microk8s kubectl get pod -l app=cestaky -o jsonpath='{.items[0].status.containerStatuses[0].imageID}'` vs. `docker pull registry.instea.co/cestovne-prikazy:0.1.0` (digest line). If they differ, note the running digest in the decision log and use `cestovne-prikazy@<digest>` in the Rollback. | Operator                |
| [ ]  | **Old credentials at hand** (ops folder, not in git): the mongo3 root user (`microk8s kubectl exec <mongo3 pod> -- printenv MONGO_INITDB_ROOT_USERNAME MONGO_INITDB_ROOT_PASSWORD`) for the filled local copies of `kubernetes/backup.cestaky.sh` and `kubernetes/restore.sh` (`backup.cestaky.local.sh`, `restore.local.sh`, mode 700, outside the repository).                                                                                           | Operator                |
| [ ]  | **New secret values prepared**: SMTP, SSO and the **unchanged** M2M credentials (from the running old Deployment: `microk8s kubectl get deployment cestaky-deployment -o jsonpath='{.spec.template.spec.containers[0].env}'`), a new `JWT_ACCESS_SECRET`, Mongo passwords generated in the window ([`README.md` › 2. Create the Secrets](README.md#2-create-the-secrets)).                                                                                 | Operator                |
| [ ]  | **Maintenance snippet** `/etc/nginx/snippets/cestaky-maintenance.conf` written (step 3) and the `cestaky.instea.co` server block file located: `<nginx site file>`, e.g. `/etc/nginx/sites-enabled/cestaky.instea.co`. Not included yet.                                                                                                                                                                                                                   | Operator                |
| [ ]  | **Report directory of the migration Job** on the host: `sudo install -d -m 0700 -o 1000 -g 1000 /opt/instea/backup/cestaky-migration` (uid 1000 = the image's `node` user). Docker works on the host (step 7 uses a throwaway `mongo:3.6` container; `docker pull mongo:3.6` beforehand). Enough disk for two copies of the dump.                                                                                                                          | Operator                |
| [ ]  | **Smoke-test sign-in through the port-forward**: `http://localhost:10082` added as an authorized JavaScript origin of the Google OAuth client `<GOOGLE_CLIENT_ID>` (removed in step 16). The product owner (admin) and the user (normal user) are available in the window, with an SSH tunnel to the host (`ssh -L 10082:localhost:10082 <host>`).                                                                                                         | Operator, product owner |
| [ ]  | **Announcement sent** (step 1) at T-5 working days.                                                                                                                                                                                                                                                                                                                                                                                                        | Product owner           |

## Timing

Expected durations come from the MIG-02 rehearsal on the anonymized
production dump (`scripts/cutover-rehearsal.sh --dump …`, which prints this
table for steps 6–13); steps without a local equivalent are estimates.
The synthetic run only proves the procedure (8 users, 24 leaves).

| Step | What                                            | Synthetic rehearsal, 2026-11-12 | MIG-02 rehearsal (prod dump) | Planned (window)  | Actual |
| ---- | ----------------------------------------------- | ------------------------------- | ---------------------------- | ----------------- | ------ |
| 3    | Maintenance page                                | n/a                             | n/a                          | 5 min             |        |
| 4    | Archive `server/download`                       | n/a                             | n/a                          | 5 min             |        |
| 5    | Freeze (scale old app to 0)                     | n/a                             | n/a                          | 2 min             |        |
| 6    | Final dump + `SHA256SUMS` (+ copy to drive)     | < 0.1 s                         | `<fill>`                     | `<fill>` + copy   |        |
| 7    | Verify restore into throwaway `mongo:3.6`       | 0.5 s                           | `<fill>`                     | `<fill>`          |        |
| 8    | Delete old objects                              | < 0.1 s                         | `<fill>`                     | 5 min             |        |
| 9    | Deploy the new stack, `/health-check` 200       | 5.2 s                           | `<fill>`                     | `<fill>` + 15 min |        |
| 10   | Restore into `cestaky_legacy` + fix script      | 0.5 s                           | `<fill>`                     | `<fill>`          |        |
| 11   | Migration Job: dry run + real run               | 0.9 s                           | `<fill>`                     | `<fill>` + 10 min |        |
| 12   | Go/no-go                                        | < 0.1 s                         | `<fill>`                     | 10 min            |        |
| 13   | Smoke test                                      | 16.4 s                          | `<fill>`                     | 30 min            |        |
| 14   | Ingress switch                                  | n/a                             | n/a                          | 5 min             |        |
| 15   | Remove maintenance page, final checks, announce | n/a                             | n/a                          | 15 min            |        |
|      | Rollback (R2–R4, old app serves the data)       | 3.8 s                           | `<fill>`                     | `<fill>`          |        |

Synthetic rehearsal: `scripts/cutover-rehearsal.sh --rollback` on a
developer machine, 2026-11-12, steps 6–13 in 23.9 s (step 13 = the API
smoke checks plus 20 TST-03 E2E tests); images already built. Production
timings are filled from the MIG-02 rehearsal; add the copy to the encrypted
drive, `kubectl` round trips and people (sign-ins, decisions) on top.

## Runbook

Each step: **who**, the commands, the check. Record each result in the
decision log. A failed check before step 8 leads to
[Abort](#abort-before-step-8); from step 8 on to
[Rollback](#rollback-after-step-8) (product owner decides).

### 1. Announce (T-5 working days) — product owner

To all employees and the M2M consumer owner:

```text
Subject: Leaves app upgrade on <date>, <start time>–<end time>

The Leaves app (https://cestaky.instea.co) moves to a new version on
<date> from <start time>. Expected downtime: <duration from the rehearsal>.
During the upgrade the app and the attendance API are unavailable
(HTTP 503). Please do not plan to enter leaves in that time. The URL, your
Google sign-in and the attendance API URL and credentials stay the same.
```

### 2. Attendance capture (T-1 day, before the freeze) — operator

Old app, current and previous month (month `1`–`12`); `curl -u <user>`
prompts for the password:

```sh
cd "$CUT"
for ym in <YYYY>/<previous month> <YYYY>/<current month>; do
  curl -sS -u '<M2M user>' -o "attendance-capture-${ym/\//-}.json" \
    -w "$ym: %{http_code}\n" "https://cestaky.instea.co/api/attendence/$ym"
done
```

Both must answer `200`. Keep the files for step 13 (they contain names:
host and ops folder only). Hours logged in Toggl after the capture make the
step-13 comparison differ for those days.

### 3. Maintenance page — operator

Snippet (prepared before the window), with the end time filled in:

```nginx
# /etc/nginx/snippets/cestaky-maintenance.conf
# MIG-04 maintenance page for cestaky.instea.co. Included at the top of the
# server block; every request (any method, incl. the attendance API) gets 503.
default_type text/html;
add_header Retry-After 7200 always;
add_header Cache-Control "no-store" always;
return 503 '<!doctype html><html lang="en"><meta charset="utf-8"><title>Leaves: upgrade in progress</title><body style="font-family:sans-serif;max-width:40em;margin:4em auto"><h1>Leaves app is being upgraded.</h1><p>Back at <time>.</p></body></html>\n';
```

Add `include snippets/cestaky-maintenance.conf;` as the first line inside
the `server { … }` block of `cestaky.instea.co` (HTTPS server; also the
HTTP one if it proxies instead of redirecting), then:

```sh
sudo nginx -t && sudo systemctl reload nginx
curl -sI https://cestaky.instea.co/ | head -1                                   # HTTP/1.1 503 …
curl -sI https://cestaky.instea.co/ | grep -i retry-after                       # Retry-After: 7200
curl -s -o /dev/null -w '%{http_code}\n' https://cestaky.instea.co/api/attendence/2026/1   # 503
```

Set `Retry-After` (seconds) to the planned remaining downtime.

### 4. Archive the generated xlsx files — operator

```sh
OLD_POD=$(microk8s kubectl get pod -l app=cestaky -o jsonpath='{.items[0].metadata.name}')
microk8s kubectl get pod "$OLD_POD" -o jsonpath='{.status.containerStatuses[0].imageID}{"\n"}'   # running image digest → decision log
microk8s kubectl cp "$OLD_POD:/opt/app/server/download" "$CUT/download-$D"
mkdir -p "$CUT/download-$D"                     # exists even when the folder was empty
find "$CUT/download-$D" -type f | wc -l         # file count → decision log
tar czf "$CUT/cestaky-download-$D.tar.gz" -C "$CUT" "download-$D"
```

Only files generated since the last pod restart exist (the folder is not on
a volume).

### 5. Freeze — operator

```sh
microk8s kubectl scale deployment cestaky-deployment --replicas=0
microk8s kubectl wait --for=delete pod -l app=cestaky --timeout=120s
microk8s kubectl get pods -l app=cestaky        # No resources found
```

### 6. Final dump — operator

Document counts in the old database first (input of step 7; the 3.6 shell
has `count()`, not `countDocuments()`):

```sh
MONGO3_POD=$(microk8s kubectl get pod -l app=mongo3 -o jsonpath='{.items[0].metadata.name}')
microk8s kubectl exec "$MONGO3_POD" -- sh -c 'mongo --quiet -u "$MONGO_INITDB_ROOT_USERNAME" \
  -p "$MONGO_INITDB_ROOT_PASSWORD" --authenticationDatabase admin cestaky \
  --eval "print(db.users.count() + \" \" + db.leaves.count())"' | tee "$CUT/counts-old.txt"
```

Dump with the old script (MongoDB 3.6 tools inside the `mongo3` pod), from
the filled local copy of `$LEGACY/kubernetes/backup.cestaky.sh` (it runs
with `set -x` and echoes the password: do not keep the terminal log):

```sh
cd "$CUT" && <ops folder>/cestaky-cutover/backup.cestaky.local.sh
DUMP=$(ls -t /opt/instea/backup/mongo/dumps/mongo3/cestaky-*.gz | head -1)
cp "$DUMP" "$CUT/" && DUMP="$CUT/$(basename "$DUMP")" && echo "$DUMP"
gzip -t "$DUMP"
cd "$CUT" && sha256sum "$(basename "$DUMP")" "cestaky-download-$D.tar.gz" > SHA256SUMS && cat SHA256SUMS
```

Copy the dump, the download archive and `SHA256SUMS` to the encrypted
drive and verify there:

```sh
cp "$DUMP" "$CUT/cestaky-download-$D.tar.gz" "$CUT/SHA256SUMS" "<encrypted drive>/cestaky-cutover-$D/"
(cd "<encrypted drive>/cestaky-cutover-$D" && sha256sum -c SHA256SUMS)   # both: OK
```

### 7. Verify the dump restores — operator

Throwaway `mongo:3.6` on the host (data in memory, removed afterwards):

```sh
docker run -d --name cutover-verify36 --tmpfs /data/db --tmpfs /data/configdb mongo:3.6
until docker exec cutover-verify36 mongo --quiet --eval 'db.adminCommand("ping").ok' >/dev/null 2>&1; do sleep 1; done
docker cp "$DUMP" cutover-verify36:/tmp/final.dump.gz
docker exec cutover-verify36 mongorestore --gzip --archive=/tmp/final.dump.gz
docker exec cutover-verify36 mongo --quiet cestaky \
  --eval 'print(db.users.count() + " " + db.leaves.count())' | tee "$CUT/counts-restored.txt"
diff "$CUT/counts-old.txt" "$CUT/counts-restored.txt" && echo "COUNTS MATCH"
docker rm -f cutover-verify36
```

Mismatch (or a restore error) → **[Abort](#abort-before-step-8)**.

### 8. Delete the old app and database objects — operator

Export the live objects first (they hold the real env values and the HMAC
key; needed for a Rollback), then copy them to the encrypted drive:

```sh
install -d -m 0700 "$CUT/old-objects"
for o in deployment/cestaky-deployment service/cestaky-service statefulset/mongo3-sfset \
         service/mongo3-service secret/cestaky-secrets ingress/cestaky-ingress pvc/mongo3-pvc; do
  microk8s kubectl get "$o" -o yaml > "$CUT/old-objects/${o/\//-}.yml"
done
cp -r "$CUT/old-objects" "<encrypted drive>/cestaky-cutover-$D/"
```

Delete (keep PVC `mongo3-pvc` and Ingress `cestaky-ingress`):

```sh
microk8s kubectl delete deployment cestaky-deployment
microk8s kubectl delete service cestaky-service
microk8s kubectl delete statefulset mongo3-sfset
microk8s kubectl delete service mongo3-service
microk8s kubectl delete secret cestaky-secrets
microk8s kubectl get pvc mongo3-pvc && microk8s kubectl get ingress cestaky-ingress   # both still exist
```

From here on, a failure leads to **[Rollback](#rollback-after-step-8)**.

### 9. Deploy the new stack — operator

Follow [`README.md` › First-time setup](README.md#first-time-setup) steps 2–4:
create Secrets `mongo8-secrets` and `cestaky-leaves-secrets` (M2M values
unchanged), apply `mongo8.yml`, run Job `mongo8-rs-init`, apply
`config.yml` and `app.yml`. **Do not apply `ingress.yml` yet.** Then:

```sh
microk8s kubectl rollout status deployment cestaky-leaves-deployment --timeout=180s
microk8s kubectl logs deploy/cestaky-leaves-deployment | grep -m1 -i version   # 1.0.0
microk8s kubectl port-forward service/cestaky-leaves-service 10082:80 &   # keep it for step 13
curl -i http://localhost:10082/health-check     # 200 {"checkMongo":"ok"}
```

### 10. Restore the legacy data into MongoDB 8 — operator

The MIG-01 restore command (users and leaves only, into `cestaky_legacy`).
The pod's `/tmp` is a 64 MiB volume; check `ls -lh "$DUMP"` first.

```sh
microk8s kubectl cp "$DUMP" mongo8-sfset-0:/tmp/legacy.dump.gz -c mongo8
microk8s kubectl exec mongo8-sfset-0 -c mongo8 -- sh -c 'mongorestore \
  -u "$MONGO_INITDB_ROOT_USERNAME" -p "$MONGO_INITDB_ROOT_PASSWORD" --authenticationDatabase admin \
  --nsInclude "cestaky.users" --nsInclude "cestaky.leaves" --nsFrom "cestaky.*" --nsTo "cestaky_legacy.*" \
  --noIndexRestore --gzip --archive=/tmp/legacy.dump.gz && rm /tmp/legacy.dump.gz'
microk8s kubectl exec mongo8-sfset-0 -c mongo8 -- sh -c 'mongosh --quiet \
  -u "$MONGO_INITDB_ROOT_USERNAME" -p "$MONGO_INITDB_ROOT_PASSWORD" --authenticationDatabase admin \
  cestaky_legacy --eval "print(db.users.countDocuments() + \" \" + db.leaves.countDocuments())"'   # = counts-old.txt
```

**Fix script slot**: the reviewed `mongosh` script for the findings decided
as `fix-in-source-before-cutover` in MIG-02 (skip when there are none). It
changes only `cestaky_legacy`, never the old database or the dump:

```sh
microk8s kubectl cp <ops folder>/cestaky-cutover/fix-cestaky-legacy.js mongo8-sfset-0:/tmp/fix.js -c mongo8
microk8s kubectl exec mongo8-sfset-0 -c mongo8 -- sh -c 'mongosh --quiet \
  -u "$MONGO_INITDB_ROOT_USERNAME" -p "$MONGO_INITDB_ROOT_PASSWORD" --authenticationDatabase admin \
  cestaky_legacy /tmp/fix.js; rc=$?; rm -f /tmp/fix.js; exit $rc'
```

Note the source PENDING count for step 13 (missing `state` migrates as
`PENDING`):

```sh
microk8s kubectl exec mongo8-sfset-0 -c mongo8 -- sh -c 'mongosh --quiet \
  -u "$MONGO_INITDB_ROOT_USERNAME" -p "$MONGO_INITDB_ROOT_PASSWORD" --authenticationDatabase admin \
  cestaky_legacy --eval "print(db.leaves.countDocuments({ \$or: [{ state: \"PENDING\" }, { state: null }] }))"'
```

### 11. Migrate (k8s Job with the new image) — operator

Job [`k8s/migrate-legacy-job.yml`](k8s/migrate-legacy-job.yml) runs
`node dist/migration/migrate-legacy.js` of `cestaky-leaves:1.0.0` with
`MONGO_URL` from `cestaky-leaves-secrets` and `LEGACY_MONGO_URL` from a
temporary Secret (same app user, database `cestaky_legacy`). It writes
`report.json`, `report.md` and `decisions.csv` to
`/opt/instea/backup/cestaky-migration/<UTC time>-<mode>/` on the host and
prints `report.md` and the exit code to its log.

```sh
APP_USER=$(microk8s kubectl get secret mongo8-secrets -o jsonpath='{.data.MONGO_APP_USERNAME}' | base64 -d)
APP_PW=$(microk8s kubectl get secret mongo8-secrets -o jsonpath='{.data.MONGO_APP_PASSWORD}' | base64 -d)
microk8s kubectl create secret generic cestaky-migration-secrets \
  --from-literal=LEGACY_MONGO_URL="mongodb://$APP_USER:$APP_PW@mongo8-service:27017/cestaky_legacy?authSource=cestaky&replicaSet=rs0"
unset APP_PW

# wait-job: until the Job succeeded or failed, then its log
wait_job() {
  until microk8s kubectl get job migrate-legacy -o jsonpath='{.status.succeeded}{.status.failed}' | grep -q 1; do sleep 2; done
  microk8s kubectl logs job/migrate-legacy
}
```

Dry run (the default mode of the manifest):

```sh
cd "$REPO/deploy/k8s"
microk8s kubectl apply -f migrate-legacy-job.yml
wait_job | tee "$CUT/migrate-dry-run.log"        # last line: migrate-legacy exit code: 0
```

Compare with the `report.json` of the last MIG-02 rehearsal (copied to the
ops folder as `rehearsal-report.json`): the same finding codes; counts
differ only by records created since the rehearsal dump.

```sh
sudo python3 - "$(sudo sh -c 'ls -d /opt/instea/backup/cestaky-migration/*-dry-run | tail -1')/report.json" \
  "<ops folder>/cestaky-cutover/rehearsal-report.json" <<'EOF'
import json, sys
now, reh = (json.load(open(p)) for p in sys.argv[1:3])
for k in ("source", "migrated", "skipped"):
    print(k, "window", now[k], "rehearsal", reh[k])
codes = sorted(set(now["findingsByCode"]) | set(reh["findingsByCode"]))
for c in codes:
    print(f'{c:34} window {now["findingsByCode"].get(c, 0):5}  rehearsal {reh["findingsByCode"].get(c, 0):5}')
print("SAME CODES" if set(now["findingsByCode"]) == set(reh["findingsByCode"]) else "CODES DIFFER")
EOF
```

A new code, or an exit code other than `0` → stop and decide (step 12).
Real run:

```sh
microk8s kubectl delete job migrate-legacy
microk8s kubectl set env --local -o yaml -f migrate-legacy-job.yml MIGRATE_MODE=migrate \
  | microk8s kubectl apply -f -
wait_job | tee "$CUT/migrate-run.log"             # last line: migrate-legacy exit code: 0
sudo tar czf "$CUT/migration-reports-$D.tar.gz" -C /opt/instea/backup/cestaky-migration .
cp "$CUT/migration-reports-$D.tar.gz" "$CUT"/migrate-*.log "<encrypted drive>/cestaky-cutover-$D/"
```

Exit `2` (target not empty: for example a second real run) is refused
without writing. Re-running after a fix is `MIGRATE_MODE=replace` (empties
the target `users`, `leaves`, `refreshtokens`, `auditlogs` first), only on
the product owner's decision.

### 12. Go/no-go — operator checks, product owner decides

All must hold, else **[Rollback](#rollback-after-step-8)** (or, on the
product owner's decision and within the window, fix in step 10 and re-run
step 11 with `MIGRATE_MODE=replace`):

- the real run's exit code is `0`;
- 0 findings with severity `error`;
- `migrated + skipped = source` for users and for leaves;
- every warning code was already decided in MIG-02 (`decisions.csv`).

```sh
sudo python3 - "$(sudo sh -c 'ls -d /opt/instea/backup/cestaky-migration/*-migrate | tail -1')/report.json" <<'EOF'
import json, sys
r = json.load(open(sys.argv[1]))
errors = [f for f in r["findings"] if f["severity"] == "error"]
print("dryRun", r["dryRun"], "| errors", len(errors))
for c in ("users", "leaves"):
    ok = r["migrated"][c] + r["skipped"][c] == r["source"][c]
    print(c, r["migrated"][c], "+", r["skipped"][c], "=", r["source"][c], "OK" if ok else "MISMATCH")
print("warning codes:", sorted({f["code"] for f in r["findings"] if f["severity"] == "warning"}))
EOF
```

Record GO / NO-GO, time and the product owner's name in the decision log.

### 13. Smoke test (port-forward, real data) — product owner, user, operator

Through the SSH tunnel, browser at `http://localhost:10082` (Chrome or
Firefox; `localhost` counts as a secure origin):

| Check                                                                                                                                                                                                    | Who                 |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- |
| Google sign-in as an admin works; the admin menu (Users, Audit) is shown.                                                                                                                                | Product owner       |
| Google sign-in as a normal user works.                                                                                                                                                                   | User                |
| `/leaves` shows the migrated leaves: `migrated.leaves` of the report (spot-check three known leaves, incl. the oldest); `db.leaves.countDocuments()` in `cestaky` equals it.                             | Product owner       |
| The calendar renders the current month with approved and pending leaves.                                                                                                                                 | User                |
| The user creates a leave in a future month and deletes it; the admin sees both entries for it in `/audit` (they stay). Tell `APPROVAL_MAIL_RECEIVER` that a test notification arrives.                   | User, product owner |
| `/approval` lists as many PENDING leaves as the source count of step 10.                                                                                                                                 | Product owner       |
| Attendance: `200` and equal to the step-2 capture, except the expected parity diffs of MIG-03 (`HOLIDAY_REFRESH`, `NO_TOGGL_ID_SKIPPED`, …, see the last parity report) and Toggl hours logged after it. | Operator            |

```sh
cd "$CUT"
for ym in <YYYY>/<previous month> <YYYY>/<current month>; do
  curl -sS -u '<M2M user>' -o "attendance-new-${ym/\//-}.json" -w "$ym: %{http_code}\n" \
    "http://localhost:10082/api/attendence/$ym"
  diff <(python3 -m json.tool --sort-keys "attendance-capture-${ym/\//-}.json") \
       <(python3 -m json.tool --sort-keys "attendance-new-${ym/\//-}.json") && echo "$ym EQUAL"
done
```

Every difference is explained in the decision log, or it is a no-go.

### 14. Route traffic to the new app — operator

```sh
microk8s kubectl apply -f "$REPO/deploy/k8s/ingress.yml"
microk8s kubectl get ingress cestaky-ingress \
  -o jsonpath='{.spec.rules[0].http.paths[0].backend.service.name}{"\n"}'   # cestaky-leaves-service
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:<ingress port>/cestaky/health-check     # 200 (the port host nginx proxies to)
kill %1 2>/dev/null   # the port-forward of step 9
```

### 15. Remove the maintenance page — operator, product owner

Remove the `include snippets/cestaky-maintenance.conf;` line from
`<nginx site file>`, then:

```sh
sudo nginx -t && sudo systemctl reload nginx
curl -s -o /dev/null -w '%{http_code}\n' https://cestaky.instea.co/health-check   # 200
curl -s -o /dev/null -w '%{http_code}\n' -u '<M2M user>' \
  "https://cestaky.instea.co/api/attendence/<YYYY>/<current month>"            # 200
```

Sign in at `https://cestaky.instea.co` (product owner). The M2M consumer
owner confirms the consumer's next call returned `200`. The product owner
announces completion (and that leaves entered after the freeze time must be
entered again only if a Rollback happens later).

### 16. The day after — operator

After a successful smoke test and one working day of normal use:

```sh
"$REPO/deploy/backup.sh"                                   # first new backup (OPS-02), same day as the clean-up
microk8s kubectl delete pvc mongo3-pvc                    # last old object; Rollback now needs a fresh PVC + restore
microk8s kubectl exec mongo8-sfset-0 -c mongo8 -- sh -c 'mongosh --quiet \
  -u "$MONGO_INITDB_ROOT_USERNAME" -p "$MONGO_INITDB_ROOT_PASSWORD" --authenticationDatabase admin \
  --eval "db.getSiblingDB(\"cestaky_legacy\").dropDatabase()"'
microk8s kubectl delete job migrate-legacy
microk8s kubectl delete secret cestaky-migration-secrets
```

Also:

- verify that the drive holds the dump, the download archive,
  `SHA256SUMS`, the migration reports and `old-objects/` (`sha256sum -c`),
  then delete the copies from the host: `$CUT`, the final dump in
  `/opt/instea/backup/mongo/dumps/mongo3/`, and
  `/opt/instea/backup/cestaky-migration/*` (reports contain emails);
- remove `http://localhost:10082` from the Google OAuth client's origins;
- remove `release-as: 1.0.0` from `release-please-config.json`
  ([`README.md` › First release](README.md#first-release-and-repository-settings));
- `git -C "$REPO" worktree remove "$LEGACY"`;
- close the decision log with the actual timings.

## Abort (before step 8)

No data has changed. Product owner decides; operator runs:

```sh
microk8s kubectl scale deployment cestaky-deployment --replicas=1
microk8s kubectl rollout status deployment cestaky-deployment --timeout=180s
```

Remove the maintenance page (step 15 commands), check
`https://cestaky.instea.co/health-check` → `200`, and announce a new date.
Record the reason in the decision log.

## Rollback (after step 8)

Decided by the product owner. Restores the old app with the data as of the
freeze; everything written in the new app after the cutover is lost.

1. **Maintenance page**: step 3.
2. **Stop the new app**:

   ```sh
   microk8s kubectl scale deployment cestaky-leaves-deployment --replicas=0
   ```

3. **Redeploy the old stack from `legacy-final`** with the old image pinned.
   The manifests in git hold `<username>` / `<password>` placeholders: make
   filled copies outside the repository from the objects exported in step 8
   (`old-objects/`, also on the drive).

   ```sh
   install -d -m 0700 "$CUT/rollback" && cd "$CUT/rollback"
   cp "$LEGACY/kubernetes/mongo3.yml" "$LEGACY/kubernetes/cestaky.yml" .
   # fill the placeholders from old-objects/statefulset-mongo3-sfset.yml and
   # old-objects/deployment-cestaky-deployment.yml, then pin the image:
   sed -i 's#registry.instea.co/cestovne-prikazy:latest#registry.instea.co/cestovne-prikazy:0.1.0#' cestaky.yml
   grep -n '<username>\|<password>\|:latest' mongo3.yml cestaky.yml    # must print nothing

   sed -n 's/^  server-private-key: //p' "$CUT/old-objects/secret-cestaky-secrets.yml" | base64 -d > key.pem
   microk8s kubectl create secret generic cestaky-secrets --from-file=server-private-key=key.pem
   rm key.pem

   microk8s kubectl apply -f mongo3.yml       # reuses PVC mongo3-pvc while it exists, else a fresh one
   microk8s kubectl rollout status statefulset mongo3-sfset --timeout=180s
   ```

   Use `cestovne-prikazy@<digest>` instead of `:0.1.0` if the pre-window
   check found a different digest.

4. **Restore the data** only if a fresh PVC was created (step 16 already
   ran): copy the final dump from the drive, verify `sha256sum -c`, and run
   the filled copy of `$LEGACY/kubernetes/restore.sh` with
   `RESTORE_DB=cestaky` (it reads `dump.gz` from the current directory):

   ```sh
   cd "$CUT/rollback" && cp "<encrypted drive>/cestaky-cutover-$D/cestaky-<timestamp>.gz" dump.gz
   <ops folder>/cestaky-cutover/restore.local.sh       # RESTORE_DB=cestaky
   ```

   Then compare `db.users.count()` / `db.leaves.count()` (step 6 command)
   with `counts-old.txt`.

5. **Old app and ingress**: `cestaky.yml` also contains the old Ingress
   `cestaky-ingress` (backend `cestaky-service`), so applying it routes
   traffic back:

   ```sh
   microk8s kubectl apply -f cestaky.yml
   microk8s kubectl rollout status deployment cestaky-deployment --timeout=180s
   microk8s kubectl get ingress cestaky-ingress \
     -o jsonpath='{.spec.rules[0].http.paths[0].backend.service.name}{"\n"}'   # cestaky-service
   ```

   Check the old app (health check `200`, sign-in, leave list), remove the
   maintenance page (step 15) and announce. Keep the new stack scaled to 0
   (and `mongo8-pvc`) for the analysis; record everything in the decision
   log.

## Local rehearsal

[`scripts/cutover-rehearsal.sh`](../scripts/cutover-rehearsal.sh) runs
steps 6–13 with docker on a developer machine (MIG-04 acceptance: "the
final MIG-02 rehearsal executes steps 6–13 with local equivalents") and
prints the timing table. It uses the same pieces as production: the
`mongo:8.0` image and the replica-set init script of
[`k8s/mongo8-rs-init.yml`](k8s/mongo8-rs-init.yml), the MIG-01 restore
command, the migration command of
[`k8s/migrate-legacy-job.yml`](k8s/migrate-legacy-job.yml) in the new
image, and the step-12 criteria.

```sh
pnpm install
# synthetic data (MIG-03 dataset), with the Rollback rehearsal:
scripts/cutover-rehearsal.sh --rollback
# MIG-02: anonymized production dump, decided fixes and decisions:
scripts/cutover-rehearsal.sh --dump cestaky-anon-<date>.gz \
  --fix-script <ops folder>/cestaky-cutover/fix-cestaky-legacy.js \
  --decisions <ops folder>/cestaky-cutover/decisions.csv --rollback
```

| Runbook step | Local equivalent                                                                                                                                                                                                                                                                                                                                                                |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| (setup)      | `mongo:3.6` with a root user, seeded with the synthetic data or `--dump`; source counts taken.                                                                                                                                                                                                                                                                                  |
| 6            | `mongodump --gzip --archive` with the 3.6 tools (as `backup.cestaky.sh`), `SHA256SUMS` + `sha256sum -c` (a stand-in download archive).                                                                                                                                                                                                                                          |
| 7            | Restore into a throwaway `mongo:3.6`, compare users / leaves counts.                                                                                                                                                                                                                                                                                                            |
| 8            | The "production" 3.6 container is removed.                                                                                                                                                                                                                                                                                                                                      |
| 9            | `mongo:8.0` with `--replSet rs0 --keyFile`, root user; the committed `init.js` creates the app user; the new app starts with that user, `/health-check` 200.                                                                                                                                                                                                                    |
| 10           | MIG-01 `mongorestore` into `cestaky_legacy`; fix script (`--fix-script`, or for the synthetic data a built-in fix of its one invalid leave).                                                                                                                                                                                                                                    |
| 11           | The Job's shell command in the new image (`--read-only`, uid 1000), `MIGRATE_MODE=dry-run`, then `migrate`; reports under `--out`.                                                                                                                                                                                                                                              |
| 12           | Exit 0, 0 errors, `migrated + skipped = source`, same codes as the dry run, every warning code decided (with `--decisions`).                                                                                                                                                                                                                                                    |
| 13           | API smoke on the migrated data (app in `NODE_ENV=test` with the fake Google verifier): health, sign-in as a migrated admin and user, leave count, PENDING count, create + delete + audit entries, attendance M2M auth; then the TST-03 E2E subset (`leave-list`, `leave-create`, `leave-delete`, `approval`) against a second app instance on `cestaky-e2e` via `E2E_BASE_URL`. |
| R2–R4        | `--rollback`: new app stopped, fresh `mongo:3.6`, restore of the final dump as `restore.sh` does, the old app (built from git `193b89f` like the parity harness) serves every restored user and leave.                                                                                                                                                                          |

Not covered locally: the maintenance page, `kubectl cp` from the old pod,
Secrets and `kubectl` itself, the real Google sign-in, the ingress switch,
and the attendance comparison (run `pnpm parity --dump <dump>` of MIG-03 on
the same dump for that). The old app image built from git has no web
bundles; production Rollback uses the real `cestovne-prikazy:0.1.0`.
