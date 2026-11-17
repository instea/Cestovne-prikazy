#!/usr/bin/env bash
#
# OPS-02: restore a backup archive made by deploy/backup.sh into a database
# of the MongoDB 8 pod. Insert-only unless --drop is given (mongorestore
# behaviour). Credentials come from the pod's Secret-backed environment.
#
# Usage: deploy/restore.sh [--drop] [--force-live] <archive> [target-db]
#   target-db     default: cestaky-restore
#   --drop        drop each collection before restoring it
#   --force-live  required to restore into the live database "cestaky";
#                 asks for a typed confirmation

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
# Database name inside the archive (the live database)
MONGO_DATABASE="cestaky"
# Default restore target
DEFAULT_TARGET="cestaky-restore"
#=====================================================================

POD_ARCHIVE="/tmp/restore.dump.gz"

kc() {
  # shellcheck disable=SC2086 # KUBECTL is a command plus arguments
  $KUBECTL "$@"
}

fail() {
  echo "$*" >&2
  exit 1
}

usage() {
  echo "Usage: $0 [--drop] [--force-live] <archive> [target-db]" >&2
  exit 2
}

DROP=""
FORCE_LIVE=false
ARGS=()
while [ $# -gt 0 ]; do
  case "$1" in
    --drop) DROP="--drop" ;;
    --force-live) FORCE_LIVE=true ;;
    -h | --help) usage ;;
    -*) echo "Unknown option: $1" >&2; usage ;;
    *) ARGS+=("$1") ;;
  esac
  shift
done

[ "${#ARGS[@]}" -ge 1 ] && [ "${#ARGS[@]}" -le 2 ] || usage
ARCHIVE="${ARGS[0]}"
TARGET="${ARGS[1]:-$DEFAULT_TARGET}"

[ -f "$ARCHIVE" ] || fail "Archive not found: $ARCHIVE"
[[ "$TARGET" =~ ^[A-Za-z0-9_-]+$ ]] || fail "Invalid target database name: $TARGET"

if [ "$TARGET" = "$MONGO_DATABASE" ]; then
  if [ "$FORCE_LIVE" != true ]; then
    fail "Refusing to restore into the live database $MONGO_DATABASE without --force-live"
  fi
  read -r -p "Restoring into the LIVE database. Type $MONGO_DATABASE to confirm: " ANSWER || ANSWER=""
  [ "$ANSWER" = "$MONGO_DATABASE" ] || fail "Confirmation did not match; nothing restored"
fi

POD="$(kc get pod -l "app=$POD_LABEL" -o jsonpath='{.items[0].metadata.name}' 2>/dev/null || true)"
if [ -z "$POD" ]; then
  fail "No pod found with label app=$POD_LABEL"
fi
echo "Restoring $ARCHIVE into database $TARGET on pod $POD${DROP:+ (with --drop)}"

cleanup() {
  kc exec "$POD" -c "$POD_CONTAINER" -- rm -f "$POD_ARCHIVE" >/dev/null 2>&1 || true
}
trap cleanup EXIT

kc cp -c "$POD_CONTAINER" "$ARCHIVE" "$POD:$POD_ARCHIVE"

# Single quotes: the credentials expand inside the pod.
# shellcheck disable=SC2016
kc exec "$POD" -c "$POD_CONTAINER" -- sh -c \
  'mongorestore --username "$MONGO_INITDB_ROOT_USERNAME" --password "$MONGO_INITDB_ROOT_PASSWORD" --authenticationDatabase admin --nsFrom "$0.*" --nsTo "$1.*" ${2:+"$2"} --gzip --archive=/tmp/restore.dump.gz' \
  "$MONGO_DATABASE" "$TARGET" "$DROP"

echo "Restore complete: database $TARGET"
