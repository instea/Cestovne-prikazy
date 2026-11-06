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
