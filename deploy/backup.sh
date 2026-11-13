#!/usr/bin/env bash
#
# OPS-02: back up the Leaves MongoDB 8 database from the k8s pod to the host
# as a gzip archive and delete backups older than the retention period.
#
# Manual run on the cluster host (see deploy/README.md for an optional cron
# line). Credentials never appear here: mongodump runs inside the pod and
# reads the root user from the pod's Secret-backed environment.
#
# Usage: deploy/backup.sh

set -euo pipefail

#=====================================================================
# Configuration
#=====================================================================
# kubectl command on the cluster host
KUBECTL="microk8s kubectl"
# Pod app label of the MongoDB 8 StatefulSet (deploy/k8s/mongo8.yml)
POD_LABEL="mongo8"
# Container running mongod inside the pod
POD_CONTAINER="mongo8"
# Database to back up
MONGO_DATABASE="cestaky"
# Backup directory on the host
BACKUPS_DIR="/opt/instea/backup/mongo/dumps/mongo8"
# Days to keep the backups
DAYS_TO_RETAIN="14"
#=====================================================================

POD_ARCHIVE="/tmp/backup.dump.gz"

kc() {
  # shellcheck disable=SC2086 # KUBECTL is a command plus arguments
  $KUBECTL "$@"
}

fail() {
  echo "$*" >&2
  exit 1
}

TIMESTAMP="$(date +%F-%H%M)"
BACKUP_FILE="$BACKUPS_DIR/$MONGO_DATABASE-$TIMESTAMP.gz"

echo "Backing up database $MONGO_DATABASE from pod label app=$POD_LABEL"

if ! mkdir -p "$BACKUPS_DIR"; then
  fail "Can't create backup directory in $BACKUPS_DIR"
fi

POD="$(kc get pod -l "app=$POD_LABEL" -o jsonpath='{.items[0].metadata.name}' 2>/dev/null || true)"
if [ -z "$POD" ]; then
  fail "No pod found with label app=$POD_LABEL"
fi
echo "Using pod $POD"

PARTIAL="$(mktemp "$BACKUPS_DIR/.backup-XXXXXX.partial")"
cleanup() {
  rm -f "$PARTIAL"
  kc exec "$POD" -c "$POD_CONTAINER" -- rm -f "$POD_ARCHIVE" >/dev/null 2>&1 || true
}
trap cleanup EXIT

# Single quotes: the variables expand inside the pod, so the password is
# neither in this script nor in the host's process list.
# shellcheck disable=SC2016
kc exec "$POD" -c "$POD_CONTAINER" -- sh -c \
  'mongodump --username "$MONGO_INITDB_ROOT_USERNAME" --password "$MONGO_INITDB_ROOT_PASSWORD" --authenticationDatabase admin --db "$0" --gzip --archive=/tmp/backup.dump.gz --quiet' \
  "$MONGO_DATABASE"

kc cp -c "$POD_CONTAINER" "$POD:$POD_ARCHIVE" "$PARTIAL"

if ! gzip -t "$PARTIAL"; then
  fail "Backup archive is corrupt; nothing kept"
fi

mv "$PARTIAL" "$BACKUP_FILE"

find "$BACKUPS_DIR" -type f -name '*.gz' -mtime +"$DAYS_TO_RETAIN" -delete

echo "Backup complete: $BACKUP_FILE ($(du -h "$BACKUP_FILE" | cut -f1))"
