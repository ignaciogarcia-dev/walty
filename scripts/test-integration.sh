#!/usr/bin/env bash
# Spin up the dev postgres, ensure a clean `walty_test` DB with the latest
# Drizzle schema, then run the integration test suite against it.
set -euo pipefail

COMPOSE_FILE="compose.dev.yml"
TEST_DB="walty_test"
ADMIN_URL="postgresql://wallet:wallet@localhost:5432/wallet"
export INTEGRATION_DATABASE_URL="postgresql://wallet:wallet@localhost:5432/${TEST_DB}"

if [[ -z "$(docker compose -f "$COMPOSE_FILE" ps -q db 2>/dev/null)" ]]; then
  docker compose -f "$COMPOSE_FILE" up -d
fi

until docker exec walty_dev-db-1 pg_isready -U wallet -d wallet >/dev/null 2>&1; do
  sleep 1
done

docker exec walty_dev-db-1 psql -U wallet -d wallet -tc \
  "SELECT 1 FROM pg_database WHERE datname='${TEST_DB}'" | grep -q 1 \
  || docker exec walty_dev-db-1 createdb -U wallet "${TEST_DB}"

DATABASE_URL="$INTEGRATION_DATABASE_URL" \
  pnpm --filter @walty/db exec drizzle-kit push >/dev/null

INTEGRATION_DATABASE_URL="$INTEGRATION_DATABASE_URL" \
  pnpm --filter @walty/api test:integration "$@"
