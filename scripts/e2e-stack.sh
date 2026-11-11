#!/usr/bin/env bash
# TST-03: build the production image, start the E2E stack (e2e/docker-compose.yml,
# project `leaves-e2e`), wait for health, run `pnpm e2e`, tear the stack down.
#
#   pnpm e2e:stack                 # whole suite
#   pnpm e2e:stack login.spec.ts   # extra args go to `playwright test`
#
# Env:
#   E2E_APP_PORT      host port of the app      (default 4100)
#   E2E_MONGO_PORT    host port of MongoDB      (default 27018)
#   E2E_MAILPIT_PORT  host port of Mailpit API  (default 8026)
#   E2E_SKIP_BUILD=1  use the existing image ($LEAVES_IMAGE, default cestaky-leaves:e2e)
#   E2E_KEEP_STACK=1  leave the stack running afterwards (`docker compose -p leaves-e2e down -v`)
set -euo pipefail

cd "$(dirname "$0")/.."

export E2E_APP_PORT="${E2E_APP_PORT:-4100}"
export E2E_MONGO_PORT="${E2E_MONGO_PORT:-27018}"
export E2E_MAILPIT_PORT="${E2E_MAILPIT_PORT:-8026}"
export E2E_BASE_URL="http://localhost:${E2E_APP_PORT}"
export MONGO_TEST_URL="mongodb://localhost:${E2E_MONGO_PORT}/cestaky-e2e?directConnection=true"
export MAILPIT_API_URL="http://localhost:${E2E_MAILPIT_PORT}"

compose=(docker compose -f e2e/docker-compose.yml)

# shellcheck disable=SC2329 # invoked by the EXIT trap
teardown() {
  if [ "${E2E_KEEP_STACK:-}" = "1" ]; then
    echo "E2E stack left running (${E2E_BASE_URL})."
  else
    "${compose[@]}" down -v --remove-orphans >/dev/null 2>&1 || true
  fi
}
trap teardown EXIT

if [ "${E2E_SKIP_BUILD:-}" != "1" ]; then
  "${compose[@]}" build app
fi

if ! "${compose[@]}" up -d --wait --wait-timeout 180; then
  "${compose[@]}" logs --no-color app >&2 || true
  exit 1
fi

status=0
pnpm e2e "$@" || status=$?
if [ "$status" -ne 0 ]; then
  echo "--- app logs (last 200 lines) ---" >&2
  "${compose[@]}" logs --no-color --tail 200 app >&2 || true
fi
exit "$status"
