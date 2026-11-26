# Preview at cestaky2.instea.co

Runs the rewrite (image `registry.instea.co/cestovne-prikazy:2.0.0`) next
to the old app, on its own MongoDB 8, with a migrated copy of the
production data. The old app (`cestaky-deployment`, `mongo3-sfset`,
`https://cestaky.instea.co`) is not touched: every object below has its
own name, and `:latest` is not pushed
([`README.md` › Image tags before the cutover](README.md#image-tags-before-the-cutover)).

The preview uses the production names of [`k8s/`](k8s/), so at the
[cutover](CUTOVER.md) the same stack becomes production (see
[From preview to cutover](#from-preview-to-cutover)).

Data written in the preview never reaches the old app, and the old app's
new data reaches the preview only through a [refresh](#refresh-the-data).

## Contents

- [Architecture](#architecture)
- [Before you start](#before-you-start)
- [1. Host, DNS, TLS and Google](#1-host-dns-tls-and-google)
- [2. Secrets](#2-secrets)
- [3. MongoDB 8 and the app](#3-mongodb-8-and-the-app)
- [4. Load the production data](#4-load-the-production-data)
- [5. Ingress and first admin](#5-ingress-and-first-admin)
- [Refresh the data](#refresh-the-data)
- [Emails from the preview](#emails-from-the-preview)
- [Remove the preview](#remove-the-preview)
- [From preview to cutover](#from-preview-to-cutover)

## Architecture

```text
browser ─ https://cestaky2.instea.co
  → host nginx (TLS; new server block, proxies to /cestaky2/)
  → MicroK8s ingress controller, class `public`
  → Ingress `cestaky2-ingress`: path /cestaky2/?(.*) rewritten to /$1
  → Service `cestaky-leaves-service` :80
  → Deployment `cestaky-leaves-deployment` (cestovne-prikazy:2.0.0, Keel)
  → Service `mongo8-service` → StatefulSet `mongo8-sfset` (MongoDB 8, rs0)
```

| Manifest                                                   | Preview                                                                                     |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| [`k8s/mongo8.yml`](k8s/mongo8.yml)                         | applied                                                                                     |
| [`k8s/mongo8-rs-init.yml`](k8s/mongo8-rs-init.yml)         | applied                                                                                     |
| [`k8s/config.yml`](k8s/config.yml)                         | applied (`BASE_URL: https://cestaky2.instea.co`)                                            |
| [`k8s/app.yml`](k8s/app.yml)                               | applied (`cestovne-prikazy:2.0.0`)                                                          |
| [`k8s/preview-ingress.yml`](k8s/preview-ingress.yml)       | applied                                                                                     |
| [`k8s/migrate-legacy-job.yml`](k8s/migrate-legacy-job.yml) | run for each data load                                                                      |
| [`k8s/ingress.yml`](k8s/ingress.yml)                       | **never** before the cutover: it is named `cestaky-ingress` and would replace the old app's |

## Before you start

- Image `registry.instea.co/cestovne-prikazy:2.0.0` exists: job
  `preview-image` of the `rewrite` PR passed
  ([`README.md` › Preview from the rewrite PR](README.md#preview-from-the-rewrite-pr)).
  Check on the host: `docker pull registry.instea.co/cestovne-prikazy:2.0.0`.
- A checkout of branch `rewrite` on the host (`$REPO` below; the examples
  use `/opt/instea/cestaky`):

  ```sh
  export REPO=/opt/instea/cestaky
  git -C "$REPO" fetch && git -C "$REPO" checkout rewrite && git -C "$REPO" pull
  ```

- Run the commands in bash, in a shell without history (`set +o history`):
  some read passwords from Secrets.

## 1. Host, DNS, TLS and Google

1. **Host check** for MongoDB 8 (AVX, kernel, the pinned image starts):
   [`README.md` › 1. Check the host CPU](README.md#1-check-the-host-cpu-avx).
   If it fails, stop: MongoDB 8 cannot run on this host.
2. **Capacity**: MongoDB 8 requests 512 MiB (limit 1 GiB), the app 256 MiB
   (limit 512 MiB); PVC `mongo8-pvc` 2 GiB on `microk8s-hostpath`. Check
   `free -h`, `df -h /var/snap/microk8s` and
   `microk8s kubectl describe node | grep -A8 'Allocated resources'`.
3. **DNS**: an `A` record `cestaky2.instea.co` to the same IP as
   `cestaky.instea.co`.
4. **TLS and host nginx**: copy the server block of `cestaky.instea.co` to
   a new site file for `cestaky2.instea.co` and change only:
   - `server_name cestaky.instea.co` → `server_name cestaky2.instea.co`;
   - the certificate paths → a certificate for `cestaky2.instea.co`
     (issued the same way as the one of `cestaky.instea.co`, for example
     `sudo certbot --nginx -d cestaky2.instea.co`);
   - the `/cestaky/` path in `proxy_pass` → `/cestaky2/`, so it reads
     `proxy_pass http://127.0.0.1:<ingress port>/cestaky2/;`.

   Then `sudo nginx -t && sudo systemctl reload nginx`. Until step 5 the
   site answers `404` from the ingress controller.

5. **Google sign-in**: Google Cloud console → APIs & Services → Credentials
   → OAuth client `914978031481-bk8e8bj1ur0vhq4qlh7n7875drin9r0e` →
   Authorized JavaScript origins: add `https://cestaky2.instea.co`. Keep
   `https://cestaky.instea.co`.

## 2. Secrets

Create `mongo8-secrets` and `cestaky-leaves-secrets` as in
[`README.md` › 2. Create the Secrets](README.md#2-create-the-secrets).
Values for the preview:

- `SMTP_USER`, `SMTP_PASSWORD`: the old app's, read from its Deployment
  (`microk8s kubectl get deployment cestaky-deployment -o
jsonpath='{.spec.template.spec.containers[0].env}'`); host and sender in
  [`k8s/config.yml`](k8s/config.yml) are already the old app's
  (`smtp.gmail.com`, `automation@instea.co`). See
  [Emails from the preview](#emails-from-the-preview).
- `M2M_USERNAME`, `M2M_PASSWORD`, `SSO_USERNAME`, `SSO_PASSWORD`: the old
  app's values (same place) if the attendance API of the preview should
  work; any value otherwise (the keys are required).
- `JWT_ACCESS_SECRET` and the MongoDB passwords: new, generated as in the
  README.

## 3. MongoDB 8 and the app

[`README.md` › First-time setup](README.md#first-time-setup) steps 3 and 4:

```sh
cd "$REPO/deploy/k8s"
microk8s kubectl apply -f mongo8.yml
microk8s kubectl rollout status statefulset mongo8-sfset --timeout=180s
microk8s kubectl apply -f mongo8-rs-init.yml
microk8s kubectl wait --for=condition=complete job/mongo8-rs-init --timeout=300s
microk8s kubectl logs job/mongo8-rs-init        # replica set rs0 initiated … user … created

microk8s kubectl apply -f config.yml
microk8s kubectl apply -f app.yml
microk8s kubectl rollout status deployment cestaky-leaves-deployment --timeout=180s
microk8s kubectl logs deploy/cestaky-leaves-deployment | grep -m1 'Leaves API'   # Leaves API 2.0.0 started (production) …
microk8s kubectl exec deploy/cestaky-leaves-deployment -- \
  node -e "fetch('http://localhost:4100/health-check').then(async r => console.log(r.status, await r.text()))"
# 200 {"checkMongo":"ok"}
```

Keel now follows `:2.0.0`: each green push to the `rewrite` PR is rolled
out within 10 minutes (`microk8s kubectl -n keel logs deploy/keel | grep
-i cestaky-leaves`).

## 4. Load the production data

Uses the cutover's commands ([`CUTOVER.md`](CUTOVER.md) steps 6, 10 and 11) without the downtime: the old app keeps running.

Working directory (personal data, mode 700) and the report directory of
the migration Job (uid 1000 = the image's `node` user):

```sh
export P=/opt/instea/preview/$(date +%F) && sudo install -d -m 0700 -o "$USER" "$P" && cd "$P"
sudo install -d -m 0700 -o 1000 -g 1000 /opt/instea/backup/cestaky-migration
```

**Dump** the old database with the MongoDB 3.6 tools of its pod, and count
the documents:

```sh
MONGO3_POD=$(microk8s kubectl get pod -l app=mongo3 -o jsonpath='{.items[0].metadata.name}')
microk8s kubectl exec "$MONGO3_POD" -- sh -c 'mongodump -u "$MONGO_INITDB_ROOT_USERNAME" \
  -p "$MONGO_INITDB_ROOT_PASSWORD" --authenticationDatabase admin \
  --db cestaky --gzip --archive' > "$P/cestaky.gz"
gzip -t "$P/cestaky.gz" && echo DUMP-OK
microk8s kubectl exec "$MONGO3_POD" -- sh -c 'mongo --quiet -u "$MONGO_INITDB_ROOT_USERNAME" \
  -p "$MONGO_INITDB_ROOT_PASSWORD" --authenticationDatabase admin cestaky \
  --eval "print(db.users.count() + \" \" + db.leaves.count())"'
```

**Restore** users and leaves into `cestaky_legacy` on MongoDB 8 (the
command of [`CUTOVER.md` step 10](CUTOVER.md#10-restore-the-legacy-data-into-mongodb-8--operator));
the count must equal the one above:

```sh
microk8s kubectl exec -i mongo8-sfset-0 -c mongo8 -- sh -c 'mongorestore \
  -u "$MONGO_INITDB_ROOT_USERNAME" -p "$MONGO_INITDB_ROOT_PASSWORD" --authenticationDatabase admin \
  --nsInclude "cestaky.users" --nsInclude "cestaky.leaves" --nsFrom "cestaky.*" --nsTo "cestaky_legacy.*" \
  --noIndexRestore --gzip --archive' < "$P/cestaky.gz"
microk8s kubectl exec mongo8-sfset-0 -c mongo8 -- sh -c 'mongosh --quiet \
  -u "$MONGO_INITDB_ROOT_USERNAME" -p "$MONGO_INITDB_ROOT_PASSWORD" --authenticationDatabase admin \
  cestaky_legacy --eval "print(db.users.countDocuments() + \" \" + db.leaves.countDocuments())"'
```

**Migrate** with the Job (secret and `wait_job` as in
[`CUTOVER.md` step 11](CUTOVER.md#11-migrate-k8s-job-with-the-new-image--operator)).
Secret `cestaky-migration-secrets` is created once and kept while the
preview runs:

```sh
APP_USER=$(microk8s kubectl get secret mongo8-secrets -o jsonpath='{.data.MONGO_APP_USERNAME}' | base64 -d)
APP_PW=$(microk8s kubectl get secret mongo8-secrets -o jsonpath='{.data.MONGO_APP_PASSWORD}' | base64 -d)
(umask 077 && printf 'LEGACY_MONGO_URL=mongodb://%s@mongo8-service:27017/cestaky_legacy?authSource=cestaky&replicaSet=rs0\n' \
  "$APP_USER:$APP_PW" > "$P/migration.env")
microk8s kubectl create secret generic cestaky-migration-secrets --from-env-file="$P/migration.env"
rm -f "$P/migration.env"; unset APP_PW

wait_job() {
  local i
  for i in $(seq 1 1000); do
    if microk8s kubectl get job migrate-legacy -o jsonpath='{.status.succeeded}{.status.failed}' | grep -q 1; then
      microk8s kubectl logs job/migrate-legacy
      return 0
    fi
    sleep 2
  done
  echo "TIMEOUT: Job migrate-legacy not finished after 2000 s" >&2
  return 1
}

cd "$REPO/deploy/k8s"
# dry run (the manifest's default mode)
microk8s kubectl apply -f migrate-legacy-job.yml
wait_job | tee "$P/migrate-dry-run.log"       # last line: migrate-legacy exit code: 0
microk8s kubectl delete job migrate-legacy
# real run
microk8s kubectl set env --local -o yaml -f migrate-legacy-job.yml MIGRATE_MODE=migrate \
  | microk8s kubectl apply -f -
wait_job | tee "$P/migrate-run.log"           # last line: migrate-legacy exit code: 0
microk8s kubectl delete job migrate-legacy
```

Expected: exit code `0`, 0 errors, `migrated + skipped = source` for users
and leaves. The local rehearsal of 2026-11-26 on the production dump gave
23 users (+4 placeholders for removed users), 422 leaves, 0 errors, and
the warning code `USER_PLACEHOLDER_CREATED`. A new error or warning code:
read `report.md` (in the log) and decide before people use the preview.

## 5. Ingress and first admin

```sh
microk8s kubectl apply -f "$REPO/deploy/k8s/preview-ingress.yml"
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:<ingress port>/cestaky2/health-check   # 200
curl -s -o /dev/null -w '%{http_code}\n' https://cestaky2.instea.co/health-check                  # 200
curl -s -o /dev/null -w '%{http_code}\n' https://cestaky.instea.co/health-check                   # 200, still the old app
```

Admins keep their role from the old data. To add one (the person signs in
once first):
[`README.md` › Promote an admin](README.md#promote-an-admin-auth-04).

Check in the browser at `https://cestaky2.instea.co`: Google sign-in as an
admin and as a normal user, the leave list (spot-check known leaves), the
calendar, `/approval`, `/users`, `/audit`.

## Refresh the data

Replaces all preview data (users, leaves, sessions, audit log) with a new
copy of production. Everyone is signed out; admins added in the preview
only must be promoted again.

1. Dump and count as in [step 4](#4-load-the-production-data) (new `$P`).
2. Empty `cestaky_legacy` (the restore does not overwrite), then restore:

   ```sh
   microk8s kubectl exec mongo8-sfset-0 -c mongo8 -- sh -c 'mongosh --quiet \
     -u "$MONGO_INITDB_ROOT_USERNAME" -p "$MONGO_INITDB_ROOT_PASSWORD" --authenticationDatabase admin \
     --eval "db.getSiblingDB(\"cestaky_legacy\").dropDatabase()"'
   ```

   and the restore and count commands of step 4.

3. Run the Job with `MIGRATE_MODE=replace` (empties the target first):

   ```sh
   cd "$REPO/deploy/k8s"
   microk8s kubectl set env --local -o yaml -f migrate-legacy-job.yml MIGRATE_MODE=replace \
     | microk8s kubectl apply -f -
   wait_job | tee "$P/migrate-replace.log"     # last line: migrate-legacy exit code: 0
   microk8s kubectl delete job migrate-legacy
   ```

Delete old working directories when they are no longer needed
(`sudo rm -rf /opt/instea/preview/<date>`): they hold personal data.

## Emails from the preview

The preview sends real emails with the old app's SMTP account:

- a new leave in the preview mails `APPROVAL_MAIL_RECEIVER`
  (`pm@instea.co`), exactly like the old app;
- approve / reject in the preview mails the **requester** (new in the
  rewrite, functional spec §10 #13), who is a real employee.

Tell `pm@instea.co` and the testers that preview mails exist, and test
approvals on the testers' own leaves. To send the new-leave mails to
someone else during the preview, change `APPROVAL_MAIL_RECEIVER` in
`config.yml`, apply it and run `microk8s kubectl rollout restart
deployment/cestaky-leaves-deployment`.

## Remove the preview

```sh
microk8s kubectl delete -f "$REPO/deploy/k8s/preview-ingress.yml"
microk8s kubectl delete deployment cestaky-leaves-deployment
microk8s kubectl delete service cestaky-leaves-service
microk8s kubectl delete configmap cestaky-leaves-config
microk8s kubectl delete job mongo8-rs-init --ignore-not-found
microk8s kubectl delete configmap mongo8-rs-init-script
microk8s kubectl delete statefulset mongo8-sfset
microk8s kubectl delete service mongo8-service mongo8-headless
microk8s kubectl delete pvc mongo8-pvc                     # deletes the preview data
microk8s kubectl delete secret cestaky-leaves-secrets mongo8-secrets cestaky-migration-secrets
```

Then remove the `cestaky2.instea.co` nginx site, its certificate, the DNS
record and the Google OAuth origin.

## From preview to cutover

With the preview running, [`CUTOVER.md`](CUTOVER.md) changes as follows
(everything else stays):

- **Step 9**: the new stack already runs; only check it (`rollout
status`, `/health-check`, port-forward for step 13). Secrets stay.
- **Step 10**: empty `cestaky_legacy` first (command in
  [Refresh the data](#refresh-the-data)), then restore the final dump.
- **Step 11**: the real run is `MIGRATE_MODE=replace` (the target holds the
  preview data; `migrate` would refuse with exit code `2`).
- **Step 14**: also set `BASE_URL: https://cestaky.instea.co` in
  [`k8s/config.yml`](k8s/config.yml) (merged before the window), apply it
  and `rollout restart` the Deployment, then apply `ingress.yml`.
- **Step 16**: also delete `cestaky2-ingress` (or keep
  `cestaky2.instea.co` as an alias until users moved), and remove its
  nginx site and OAuth origin when done.
