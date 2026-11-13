#!/bin/bash
# Runs on EVERY container start. Brings up the project's local services
# (MongoDB 8 replica set + Mailpit from docker-compose.yml) on the inner
# Docker daemon. MongoDB data lives in ./.data/mongo on the bind-mounted
# workspace, so it survives container rebuilds.
set -e

if ! timeout 60 bash -c 'until docker info >/dev/null 2>&1; do sleep 1; done'; then
  echo "inner dockerd did not come up within 60s" >&2
  exit 1
fi

docker compose up -d mongo mailpit

if command -v gh >/dev/null 2>&1 && gh auth status --hostname github.com >/dev/null 2>&1; then
  gh auth setup-git --hostname github.com
else
  echo "No valid GitHub auth (GH_TOKEN unset/invalid); skipping git credential setup." >&2
fi
