#!/usr/bin/env bash
# Spin up the dev postgres, ensure a clean `walty_test` DB with the latest
# Drizzle schema, then run the integration test suite against it.
#
# Requires docker and a free TCP 5432 on localhost (compose.dev.yml binds
# the host port directly; a pre-existing system postgres on 5432 will
# collide).
set -euo pipefail

COMPOSE_FILE="compose.dev.yml"
TEST_DB="walty_test"
export INTEGRATION_DATABASE_URL="postgresql://wallet:wallet@localhost:5432/${TEST_DB}"

dc() { docker compose -f "$COMPOSE_FILE" "$@"; }

if [[ -z "$(dc ps -q db 2>/dev/null)" ]]; then
  dc up -d
fi

until dc exec -T db pg_isready -U wallet -d wallet >/dev/null 2>&1; do
  sleep 1
done

dc exec -T db psql -U wallet -d wallet -tc \
  "SELECT 1 FROM pg_database WHERE datname='${TEST_DB}'" | grep -q 1 \
  || dc exec -T db createdb -U wallet "${TEST_DB}"

DATABASE_URL="$INTEGRATION_DATABASE_URL" \
  pnpm --filter @walty/db exec drizzle-kit push >/dev/null

INTEGRATION_DATABASE_URL="$INTEGRATION_DATABASE_URL" \
  pnpm --filter @walty/api test:integration "$@"
