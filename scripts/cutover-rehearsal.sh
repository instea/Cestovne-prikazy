#!/usr/bin/env bash
# MIG-04 local cutover rehearsal: runs steps 6-13 of deploy/CUTOVER.md with
# docker containers instead of the cluster (mongo:3.6 for the old database,
# the mongo:8.0 image of deploy/k8s/mongo8.yml for the new one, the new app
# image) and prints a timing table. Optionally rehearses the Rollback with
# the old app built from git (no access to the production registry needed).
#
#   scripts/cutover-rehearsal.sh [options]
#
# Options:
#   --dump <file>         old mongodump --gzip --archive of database `cestaky`
#                         (MIG-02: the anonymized production dump). Default:
#                         the MIG-03 synthetic legacy dataset.
#   --fix-script <file>   mongosh script for findings decided as
#                         fix-in-source-before-cutover, run on cestaky_legacy
#                         (step 10). Default with the synthetic data: a
#                         built-in fix of its one invalid leave; else none.
#   --decisions <csv>     MIG-02 decisions.csv: step 12 then also requires a
#                         decision for every warning code.
#   --image <ref>         new app image (default: build cestaky-leaves:rehearsal
#                         from this checkout)
#   --old-image <ref>     old app image for --rollback (default
#                         cestaky-old:parity-193b89f, built from git 193b89f
#                         with apps/api/test/parity/old-app.Dockerfile)
#   --rollback            also rehearse the Rollback (old app + mongo:3.6 +
#                         final-dump restore)
#   --no-e2e              skip the TST-03 Playwright smoke subset
#   --hosted-domain <d>   HOSTED_DOMAIN of the app (default instea.co)
#   --out <dir>           where the dump, SHA256SUMS, migration reports and
#                         timings are kept (default
#                         cutover-rehearsal/<UTC timestamp>, git-ignored)
#   --keep                leave the containers running (prints how to remove)
#
# Requires docker, node 24 and `pnpm install` (helpers in
# scripts/cutover-rehearsal.mjs; the E2E subset needs Playwright Chromium).
# Uses its own container names, network and random localhost ports, so it
# never touches the dev stack (compose project `leaves`) or the E2E stack.
# Exit: 0 all checks passed, 1 a step failed (the table shows which).
set -euo pipefail

cd "$(dirname "$0")/.."
REPO="$PWD"
HELPER=(node "$REPO/scripts/cutover-rehearsal.mjs")

DUMP=""
FIX_SCRIPT=""
DECISIONS=""
IMAGE=""
OLD_IMAGE="cestaky-old:parity-193b89f"
OLD_REF="193b89f"
ROLLBACK=0
E2E=1
HOSTED_DOMAIN="instea.co"
OUT=""
KEEP=0

usage() {
  sed -n '2,/^set -euo/p' "$0" | sed -e '$d' -e 's/^# \{0,1\}//'
  exit 2
}

while [ $# -gt 0 ]; do
  case "$1" in
    --dump) DUMP="$(realpath "$2")"; shift 2 ;;
    --fix-script) FIX_SCRIPT="$(realpath "$2")"; shift 2 ;;
    --decisions) DECISIONS="$(realpath "$2")"; shift 2 ;;
    --image) IMAGE="$2"; shift 2 ;;
    --old-image) OLD_IMAGE="$2"; shift 2 ;;
    --rollback) ROLLBACK=1; shift ;;
    --no-e2e) E2E=0; shift ;;
    --hosted-domain) HOSTED_DOMAIN="$2"; shift 2 ;;
    --out) OUT="$2"; shift 2 ;;
    --keep) KEEP=1; shift ;;
    -h | --help) usage ;;
    *) echo "Unknown option: $1" >&2; usage ;;
  esac
done

RUN_ID="cutover-reh-$(openssl rand -hex 3)"
NET="$RUN_ID"
OUT="$(realpath -m "${OUT:-cutover-rehearsal/$(date -u +%Y%m%dT%H%M%SZ)}")"
WORK="$(mktemp -d "${TMPDIR:-/tmp}/$RUN_ID.XXXXXX")"
mkdir -p "$OUT/final" "$OUT/migration"

# Rehearsal-only credentials (random per run, never stored).
OLD_ROOT_PW="$(openssl rand -hex 16)"
NEW_ROOT_PW="$(openssl rand -hex 16)"
APP_USER="cestaky"
APP_PW="$(openssl rand -hex 16)"
M2M="rehearsal-m2m:$(openssl rand -hex 12)"
MONGO8_IMAGE="$("${HELPER[@]}" manifest mongo-image)"

log() { printf '\n[rehearsal] %s\n' "$*"; }
cname() { printf '%s-%s' "$RUN_ID" "$1"; }

# ---------------------------------------------------------------- timing
STEP_IDS=()
STEP_NAMES=()
STEP_MS=()
STEP_RESULTS=()
CURRENT=""
CURRENT_START=0

now_ms() {
  local t="${EPOCHREALTIME/[.,]/}"
  echo $((t / 1000))
}

step() {
  CURRENT="$1"
  CURRENT_START=$(now_ms)
  STEP_IDS+=("$1")
  STEP_NAMES+=("$2")
  STEP_MS+=("")
  STEP_RESULTS+=("FAILED")
  log "step $1: $2"
}

step_done() {
  local i=$((${#STEP_IDS[@]} - 1))
  STEP_MS[i]=$(($(now_ms) - CURRENT_START))
  STEP_RESULTS[i]="${1:-ok}"
  CURRENT=""
}

# milliseconds -> "1m 05.3s"
fmt() { printf '%dm %02d.%ds' $(($1 / 60000)) $(($1 % 60000 / 1000)) $(($1 % 1000 / 100)); }

timing_table() {
  local i ms main=0 rollback=0
  {
    echo "Cutover rehearsal $(date -u +%F), data: ${DUMP:-synthetic (MIG-03)}, image: $IMAGE"
    echo
    echo "| Step | What | Duration | Result |"
    echo "| ---- | ---- | -------- | ------ |"
    for i in "${!STEP_IDS[@]}"; do
      ms="${STEP_MS[i]}"
      if [ -z "$ms" ]; then ms=$(($(now_ms) - CURRENT_START)); fi
      case "${STEP_IDS[i]}" in
        prep) ;;
        R*) rollback=$((rollback + ms)) ;;
        *) main=$((main + ms)) ;;
      esac
      echo "| ${STEP_IDS[i]} | ${STEP_NAMES[i]} | $(fmt "$ms") | ${STEP_RESULTS[i]} |"
    done
    echo "| | **Steps 6-13** | **$(fmt "$main")** | |"
    if [ "$rollback" -gt 0 ]; then echo "| | **Rollback** | **$(fmt "$rollback")** | |"; fi
  } | tee "$OUT/timings.md"
}

# shellcheck disable=SC2329 # invoked by the EXIT trap
finish() {
  local status=$?
  set +e
  if [ "${#STEP_IDS[@]}" -gt 0 ]; then
    log "timings (also in $OUT/timings.md)"
    timing_table
  fi
  if [ "$KEEP" = "1" ]; then
    log "--keep: containers left running; remove with:"
    echo "  docker rm -f \$(docker ps -aq --filter name=^$RUN_ID-) && docker network rm $NET"
  else
    docker ps -aq --filter "name=^$RUN_ID-" | xargs -r docker rm -f >/dev/null
    docker network rm "$NET" >/dev/null 2>&1
  fi
  rm -rf "$WORK"
  if [ "$status" -eq 0 ]; then
    log "PASSED. Artifacts: $OUT"
  else
    log "FAILED${CURRENT:+ in step $CURRENT} (exit $status). Artifacts: $OUT"
  fi
  exit "$status"
}
trap finish EXIT

# --------------------------------------------------------------- helpers
# Waits until a mongo container finished its init (root user) and answers.
wait_mongo() {
  local name="$1" shell="$2" i
  for i in $(seq 1 90); do
    # No `grep -q`: with pipefail, its early exit fails the pipeline (SIGPIPE).
    if docker logs "$name" 2>&1 | grep 'MongoDB init process complete' >/dev/null &&
      docker exec "$name" "$shell" --quiet --eval 'db.adminCommand("ping").ok' >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
  done
  docker logs --tail 50 "$name" >&2
  echo "$name did not become ready" >&2
  return 1
}

wait_http() {
  local url="$1" i
  for i in $(seq 1 120); do
    if [ "$(curl -s -o /dev/null -w '%{http_code}' "$url")" = "200" ]; then return 0; fi
    sleep 1
  done
  echo "$url did not answer 200" >&2
  return 1
}

# mongo 3.6 shell as root: old36 <container> <db> <js>
old36() {
  docker exec "$1" mongo --quiet -u root -p "$OLD_ROOT_PW" --authenticationDatabase admin "$2" --eval "$3"
}

# mongosh as root inside the mongo8 container: new8 <db> <js>
new8() {
  docker exec "$(cname mongo8)" mongosh --quiet -u root -p "$NEW_ROOT_PW" --authenticationDatabase admin "$1" --eval "$2"
}

# Counts "users leaves" of database cestaky in a 3.6 container (the 3.6
# shell has count(), not countDocuments()).
counts36() {
  if [ "${2:-auth}" = "auth" ]; then
    old36 "$1" cestaky 'print(db.users.count() + " " + db.leaves.count())'
  else
    docker exec "$1" mongo --quiet cestaky --eval 'print(db.users.count() + " " + db.leaves.count())'
  fi
}

start_mongo36() {
  local alias="$1"
  shift
  docker run -d --name "$(cname "$alias")" --network "$NET" --network-alias "$alias" \
    --tmpfs /data/db --tmpfs /data/configdb "$@" mongo:3.6 >/dev/null
}

app_env() {
  # Rehearsal app: NODE_ENV=test + fake Google verifier (TST-03), so the
  # smoke test can sign in without Google. Everything else as production.
  local base_url="$1" mongo_url="$2"
  printf '%s\n' \
    NODE_ENV=test AUTH_GOOGLE_VERIFIER=fake PORT=4100 "BASE_URL=$base_url" \
    "MONGO_URL=$mongo_url" "HOSTED_DOMAIN=$HOSTED_DOMAIN" \
    GOOGLE_CLIENT_ID=rehearsal.apps.googleusercontent.com \
    "JWT_ACCESS_SECRET=$(openssl rand -hex 24)" SMTP_HOST=mailpit SMTP_PORT=1025 \
    SMTP_SECURE=false SMTP_USER=mailpit SMTP_PASSWORD=mailpit \
    MAIL_SENDER=leaves@rehearsal.test APPROVAL_MAIL_RECEIVER=approver@e2e.test \
    DEFAULT_TIMEZONE=Europe/Bratislava "M2M_USERNAME=${M2M%%:*}" \
    "M2M_PASSWORD=${M2M#*:}" SSO_URI=http://sso.invalid/api/meta/all \
    SSO_USERNAME=rehearsal SSO_PASSWORD=rehearsal LOG_LEVEL=warn
}

start_app() {
  local name="$1" port="$2" mongo_url="$3"
  app_env "http://localhost:$port" "$mongo_url" >"$WORK/$name.env"
  docker run -d --name "$(cname "$name")" --network "$NET" --env-file "$WORK/$name.env" \
    -p "127.0.0.1:$port:4100" --read-only --tmpfs /tmp --cap-drop ALL \
    --security-opt no-new-privileges "$IMAGE" >/dev/null
  if ! wait_http "http://127.0.0.1:$port/health-check"; then
    docker logs --tail 80 "$(cname "$name")" >&2
    return 1
  fi
}

# ------------------------------------------------------------ preparation
docker network create "$NET" >/dev/null

step prep "Prepare images and the simulated production database (not a runbook step)"
if [ -z "$IMAGE" ]; then
  IMAGE="cestaky-leaves:rehearsal"
  log "building $IMAGE from this checkout"
  docker build -q --build-arg APP_VERSION=0.0.0-rehearsal -t "$IMAGE" . >/dev/null
elif ! docker image inspect "$IMAGE" >/dev/null 2>&1; then
  docker pull "$IMAGE"
fi
if [ "$ROLLBACK" = "1" ] && ! docker image inspect "$OLD_IMAGE" >/dev/null 2>&1; then
  if [ "$OLD_IMAGE" != "cestaky-old:parity-$OLD_REF" ]; then
    docker pull "$OLD_IMAGE"
  else
    log "building the old app image $OLD_IMAGE from git $OLD_REF"
    mkdir -p "$WORK/old-build"
    git archive --format=tar "$OLD_REF" package.json yarn.lock server src | tar -x -C "$WORK/old-build"
    cp apps/api/test/parity/old-app.Dockerfile "$WORK/old-build/Dockerfile"
    docker build -q -t "$OLD_IMAGE" "$WORK/old-build" >/dev/null
  fi
fi

# "Production": MongoDB 3.6 with a root user, like StatefulSet mongo3-sfset.
start_mongo36 prod36 -e MONGO_INITDB_ROOT_USERNAME=root -e "MONGO_INITDB_ROOT_PASSWORD=$OLD_ROOT_PW"
wait_mongo "$(cname prod36)" mongo
if [ -n "$DUMP" ]; then
  docker cp "$DUMP" "$(cname prod36):/tmp/seed.dump.gz"
  docker exec "$(cname prod36)" mongorestore --quiet -u root -p "$OLD_ROOT_PW" \
    --authenticationDatabase admin --gzip --archive=/tmp/seed.dump.gz
else
  mkdir -p "$WORK/seed"
  echo "synthetic dataset: $("${HELPER[@]}" seed "$WORK/seed")"
  docker cp "$WORK/seed/." "$(cname prod36):/tmp/seed"
  for c in users leaves trips; do
    docker exec "$(cname prod36)" mongoimport --quiet -u root -p "$OLD_ROOT_PW" \
      --authenticationDatabase admin --db cestaky --collection "$c" --jsonArray --file "/tmp/seed/$c.json"
  done
fi
step_done

# Runbook step 7 compares against counts taken from the old pod before step 8.
read -r SRC_USERS SRC_LEAVES <<<"$(counts36 "$(cname prod36)")"
echo "source counts (old pod): users $SRC_USERS, leaves $SRC_LEAVES"

# -------------------------------------------------------------- step 6
step 6 "Final dump with the MongoDB 3.6 tools + SHA256SUMS"
STAMP="$(date +%F-%H%M)"
DUMP_FILE="$OUT/final/cestaky-$STAMP.gz"
# As kubernetes/backup.cestaky.sh (legacy-final) does inside the mongo3 pod.
docker exec "$(cname prod36)" mongodump --quiet --db cestaky -u root -p "$OLD_ROOT_PW" \
  --authenticationDatabase admin --gzip --archive=/tmp/mongo1.dump.gz
docker cp "$(cname prod36):/tmp/mongo1.dump.gz" "$DUMP_FILE"
# Stand-in for the step 4 archive of server/download (empty locally).
mkdir -p "$WORK/download-$STAMP"
tar czf "$OUT/final/cestaky-download-$STAMP.tar.gz" -C "$WORK" "download-$STAMP"
(cd "$OUT/final" && sha256sum "cestaky-$STAMP.gz" "cestaky-download-$STAMP.tar.gz" >SHA256SUMS && sha256sum -c SHA256SUMS)
step_done

# -------------------------------------------------------------- step 7
step 7 "Verify the dump restores into a throwaway mongo:3.6, compare counts"
start_mongo36 verify36
# No root user here: wait for the plain server.
for _ in $(seq 1 60); do
  docker exec "$(cname verify36)" mongo --quiet --eval 'db.adminCommand("ping").ok' >/dev/null 2>&1 && break
  sleep 1
done
docker cp "$DUMP_FILE" "$(cname verify36):/tmp/final.dump.gz"
docker exec "$(cname verify36)" mongorestore --quiet --gzip --archive=/tmp/final.dump.gz
read -r V_USERS V_LEAVES <<<"$(counts36 "$(cname verify36)" noauth)"
echo "restored: users $V_USERS, leaves $V_LEAVES (source $SRC_USERS, $SRC_LEAVES)"
if [ "$V_USERS" != "$SRC_USERS" ] || [ "$V_LEAVES" != "$SRC_LEAVES" ]; then
  echo "Count mismatch: ABORT (deploy/CUTOVER.md, Abort)" >&2
  exit 1
fi
docker rm -f "$(cname verify36)" >/dev/null
step_done

# -------------------------------------------------------------- step 8
step 8 "Delete the old app and database (container removed, dump kept)"
docker rm -f "$(cname prod36)" >/dev/null
step_done

# -------------------------------------------------------------- step 9
step 9 "Deploy the new stack: mongo8 + rs-init script + app, /health-check 200"
openssl rand -base64 756 >"$WORK/keyfile"
chmod 0644 "$WORK/keyfile"
MONGO8_PORT="$("${HELPER[@]}" free-port)"
# Same args as mongo8-sfset; the keyfile is copied to a root-owned 0400 file
# like the StatefulSet's init container does.
docker run -d --name "$(cname mongo8)" --network "$NET" --network-alias mongo8 \
  --tmpfs /data/db --tmpfs /data/configdb -p "127.0.0.1:$MONGO8_PORT:27017" \
  -e MONGO_INITDB_ROOT_USERNAME=root -e "MONGO_INITDB_ROOT_PASSWORD=$NEW_ROOT_PW" \
  -v "$WORK/keyfile:/etc/mongo-secret/keyfile:ro" --entrypoint bash "$MONGO8_IMAGE" -c \
  'cp /etc/mongo-secret/keyfile /tmp/keyfile && chown 999:999 /tmp/keyfile && chmod 0400 /tmp/keyfile &&
   exec docker-entrypoint.sh mongod --replSet rs0 --keyFile /tmp/keyfile --bind_ip_all --wiredTigerCacheSizeGB 0.25' \
  >/dev/null
wait_mongo "$(cname mongo8)" mongosh
"${HELPER[@]}" manifest rs-init-js >"$WORK/init.js"
docker cp "$WORK/init.js" "$(cname mongo8):/tmp/init.js"
docker exec -e RS_MEMBER_HOST=mongo8:27017 -e "MONGO_APP_USERNAME=$APP_USER" -e "MONGO_APP_PASSWORD=$APP_PW" \
  "$(cname mongo8)" mongosh --quiet --host 127.0.0.1 -u root -p "$NEW_ROOT_PW" --authenticationDatabase admin /tmp/init.js
APP_MONGO_URL="mongodb://$APP_USER:$APP_PW@mongo8:27017/cestaky?authSource=cestaky&replicaSet=rs0"
LEGACY_MONGO_URL="mongodb://$APP_USER:$APP_PW@mongo8:27017/cestaky_legacy?authSource=cestaky&replicaSet=rs0"
docker run -d --name "$(cname mailpit)" --network "$NET" --network-alias mailpit \
  -e MP_SMTP_AUTH_ACCEPT_ANY=1 -e MP_SMTP_AUTH_ALLOW_INSECURE=1 \
  -p "127.0.0.1::8025" axllent/mailpit:v1.33.0 >/dev/null
APP_PORT="$("${HELPER[@]}" free-port)"
start_app app "$APP_PORT" "$APP_MONGO_URL"
step_done

# ------------------------------------------------------------- step 10
step 10 "Restore the final dump into cestaky_legacy (MIG-01 command) + fix script"
docker cp "$DUMP_FILE" "$(cname mongo8):/tmp/final.dump.gz"
docker exec "$(cname mongo8)" mongorestore --quiet -u root -p "$NEW_ROOT_PW" --authenticationDatabase admin \
  --nsInclude 'cestaky.users' --nsInclude 'cestaky.leaves' --nsFrom 'cestaky.*' --nsTo 'cestaky_legacy.*' \
  --noIndexRestore --gzip --archive=/tmp/final.dump.gz
if [ -z "$FIX_SCRIPT" ] && [ -z "$DUMP" ]; then
  # Built-in example for the synthetic data: its half-day leave over two
  # days (MIG-01 error LEAVE_HALF_DAY_MULTIPLE_DAYS) decided as
  # fix-in-source-before-cutover: make it a one-day half-day leave.
  FIX_SCRIPT="$WORK/fix-synthetic.js"
  cat >"$FIX_SCRIPT" <<'JS'
const r = db.leaves.updateOne(
  { id: 'l-i-02', isHalfDay: true },
  [{ $set: { endDate: '$startDate' } }],
);
if (r.matchedCount !== 1) throw new Error('l-i-02 not found');
print('fixed l-i-02: endDate = startDate');
JS
fi
if [ -n "$FIX_SCRIPT" ]; then
  docker cp "$FIX_SCRIPT" "$(cname mongo8):/tmp/fix.js"
  docker exec "$(cname mongo8)" mongosh --quiet --host 127.0.0.1 -u root -p "$NEW_ROOT_PW" \
    --authenticationDatabase admin cestaky_legacy /tmp/fix.js
else
  echo "no fix script"
fi
# shellcheck disable=SC2016 # $or is MongoDB syntax, not a shell variable
SRC_PENDING="$(new8 cestaky_legacy 'print(db.leaves.countDocuments({ $or: [{ state: "PENDING" }, { state: null }] }))')"
echo "source PENDING leaves (incl. missing state): $SRC_PENDING"
step_done

# ------------------------------------------------------------- step 11
step 11 "Migration with the new image (Job command): dry run, then for real"
"${HELPER[@]}" manifest job-script >"$WORK/migrate.sh"
chmod 0777 "$OUT/migration"
migrate() {
  docker run --rm --network "$NET" --user 1000:1000 --read-only --tmpfs /tmp --cap-drop ALL \
    --security-opt no-new-privileges -e NODE_ENV=production -e DEFAULT_TIMEZONE=Europe/Bratislava \
    -e "MIGRATE_MODE=$1" -e REPORT_ROOT=/report -e "MONGO_URL=$APP_MONGO_URL" \
    -e "LEGACY_MONGO_URL=$LEGACY_MONGO_URL" -v "$OUT/migration:/report" \
    "$IMAGE" sh -c "$(cat "$WORK/migrate.sh")"
}
set +e
migrate dry-run
DRY_EXIT=$?
set -e
DRY_DIR="$(find "$OUT/migration" -maxdepth 1 -name '*-dry-run' | sort | tail -1)"
echo "dry run: exit $DRY_EXIT, report $DRY_DIR"
if [ "$DRY_EXIT" -ne 0 ]; then
  echo "Dry run failed: fix (step 10) or ABORT/ROLLBACK; the real run is not started" >&2
  exit 1
fi
set +e
migrate migrate
RUN_EXIT=$?
set -e
RUN_DIR="$(find "$OUT/migration" -maxdepth 1 -name '*-migrate' | sort | tail -1)"
echo "migration: exit $RUN_EXIT, report $RUN_DIR"
step_done

# ------------------------------------------------------------- step 12
step 12 "Go/no-go"
gonogo=("${HELPER[@]}" go-no-go "$RUN_DIR/report.json" --exit-code "$RUN_EXIT" \
  --dry-run-report "$DRY_DIR/report.json")
if [ -n "$DECISIONS" ]; then gonogo+=(--decisions "$DECISIONS"); fi
"${gonogo[@]}"
MIGRATED_LEAVES="$(node -e 'process.stdout.write(String(require(process.argv[1]).migrated.leaves))' "$RUN_DIR/report.json")"
step_done GO

# ------------------------------------------------------------- step 13
step 13 "Smoke test: API checks on the migrated data + TST-03 E2E subset"
"${HELPER[@]}" smoke --base-url "http://127.0.0.1:$APP_PORT" \
  --mongo-url "mongodb://root:$NEW_ROOT_PW@127.0.0.1:$MONGO8_PORT/cestaky?authSource=admin&directConnection=true" \
  --expect-leaves "$MIGRATED_LEAVES" --expect-pending "$SRC_PENDING" --m2m "$M2M"
echo "attendance old vs new on this data: pnpm parity --dump $DUMP_FILE (MIG-03), not part of this script"
if [ "$E2E" = "1" ]; then
  # The suite empties its database and accepts only cestaky-e2e, so a second
  # app instance on the same server serves it (root user: the app user has
  # no rights on cestaky-e2e).
  E2E_PORT="$("${HELPER[@]}" free-port)"
  start_app app-e2e "$E2E_PORT" \
    "mongodb://root:$NEW_ROOT_PW@mongo8:27017/cestaky-e2e?authSource=admin&replicaSet=rs0"
  MAILPIT_PORT="$(docker port "$(cname mailpit)" 8025/tcp | head -1 | sed 's/.*://')"
  E2E_BASE_URL="http://localhost:$E2E_PORT" \
    E2E_MONGO_URL="mongodb://root:$NEW_ROOT_PW@127.0.0.1:$MONGO8_PORT/cestaky-e2e?authSource=admin&directConnection=true" \
    MAILPIT_API_URL="http://127.0.0.1:$MAILPIT_PORT" \
    pnpm -s e2e --reporter=list leave-list.spec.ts leave-create.spec.ts leave-delete.spec.ts approval.spec.ts
  docker rm -f "$(cname app-e2e)" >/dev/null
fi
step_done

[ "$ROLLBACK" = "1" ] || exit 0

# -------------------------------------------------------------- rollback
step R2 "Rollback: scale the new app to 0"
docker rm -f "$(cname app)" >/dev/null
step_done

step R3-R4 "Rollback: old database on a fresh volume + restore.sh restore of the final dump"
start_mongo36 old36 -e MONGO_INITDB_ROOT_USERNAME=root -e "MONGO_INITDB_ROOT_PASSWORD=$OLD_ROOT_PW"
wait_mongo "$(cname old36)" mongo
docker cp "$DUMP_FILE" "$(cname old36):/tmp/mongo.dump.gz"
# kubernetes/restore.sh (legacy-final) with RESTORE_DB=cestaky.
docker exec "$(cname old36)" mongorestore --quiet -u root -p "$OLD_ROOT_PW" --nsFrom 'cestaky.*' \
  --nsTo 'cestaky.*' --authenticationDatabase admin --gzip --archive=/tmp/mongo.dump.gz
read -r R_USERS R_LEAVES <<<"$(counts36 "$(cname old36)")"
echo "restored: users $R_USERS, leaves $R_LEAVES (source $SRC_USERS, $SRC_LEAVES)"
[ "$R_USERS" = "$SRC_USERS" ] && [ "$R_LEAVES" = "$SRC_LEAVES" ]
step_done

step R3-app "Rollback: start the old app ($OLD_IMAGE) and check it serves the data"
mkdir -p "$WORK/old-secrets"
openssl rand -hex 32 >"$WORK/old-secrets/key.pem"
chmod 0644 "$WORK/old-secrets/key.pem"
OLD_PORT="$("${HELPER[@]}" free-port)"
docker run -d --name "$(cname old-app)" --network "$NET" -p "127.0.0.1:$OLD_PORT:4100" \
  -e NODE_ENV=production -e BASE_URL="http://localhost:$OLD_PORT" \
  -e "MONGO_URL=mongodb://root:$OLD_ROOT_PW@old36:27017/cestaky?authSource=admin" \
  -e SMTP_HOST=mailpit -e SMTP_PORT=1025 -e SMTP_SECURE=false -e SMTP_USER=mailpit -e SMTP_PASSWORD=mailpit \
  -e MAIL_SENDER=leaves@rehearsal.test -e APPROVAL_MAIL_RECEIVER=approver@e2e.test \
  -e "HOSTED_DOMAIN=$HOSTED_DOMAIN" -e CLIENT_ID=rehearsal.apps.googleusercontent.com \
  -e "M2M_USERNAME=${M2M%%:*}" -e "M2M_PASSWORD=${M2M#*:}" -e SSO_URI=http://sso.invalid/api/meta/all \
  -e SSO_USERNAME=rehearsal -e SSO_PASSWORD=rehearsal \
  -v "$WORK/old-secrets:/opt/app/secrets:ro" "$OLD_IMAGE" >/dev/null
if ! wait_http "http://127.0.0.1:$OLD_PORT/health-check"; then
  docker logs --tail 80 "$(cname old-app)" >&2
  exit 1
fi
OLD_ADMIN="$(old36 "$(cname old36)" cestaky 'var u = db.users.find({ isAdmin: true }).sort({ _id: 1 }).limit(1).toArray()[0]; print(u ? u.id : "")')"
"${HELPER[@]}" rollback-check --base-url "http://127.0.0.1:$OLD_PORT" --key "$WORK/old-secrets/key.pem" \
  --admin-id "$OLD_ADMIN" --expect-users "$SRC_USERS" --expect-leaves "$SRC_LEAVES"
echo "(R1 maintenance page and R5 ingress switch back are host / cluster only)"
step_done
