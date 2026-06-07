#!/usr/bin/env bash
# Reinforced full-app e2e: boots a local stack (Postgres + API + the real Next
# web build) and runs the Playwright onboarding suite against it in chromium.
#
# NEVER touches the .env Supabase DB — uses a dedicated local `walty_e2e`.
# Requires docker + a free TCP 5432 (compose.dev.yml binds the host port).
#
# Usage:
#   scripts/test-e2e.sh                  # build + boot + run all specs + teardown
#   scripts/test-e2e.sh e2e/auth.spec.ts # pass-through filter to playwright
#   scripts/test-e2e.sh --grep @tier2
set -euo pipefail

COMPOSE_FILE="compose.dev.yml"
E2E_DB="walty_e2e"
API_PORT="${E2E_API_PORT:-4000}"
WEB_PORT="${E2E_WEB_PORT:-3000}"
API_URL="http://127.0.0.1:${API_PORT}"
DB_URL="postgresql://wallet:wallet@localhost:5432/${E2E_DB}"

dc() { docker compose -f "$COMPOSE_FILE" "$@"; }

# Kill any process listening on a TCP port. Uses `ss` (not `lsof`, which is blind
# to listeners under WSL2 — it silently returns nothing, so a kill no-ops and a
# stale server lingers).
free_port() {
  local port="$1" pids
  # `|| true`: an empty match (grep exit 1) must not trip `set -o pipefail`/`set -e`
  # and abort the script when the port is already free.
  pids=$(ss -ltnpH "sport = :${port}" 2>/dev/null | grep -o 'pid=[0-9]*' | cut -d= -f2 | sort -u || true)
  if [[ -n "$pids" ]]; then
    echo "[e2e] freeing stale listener on :${port} (pids: ${pids//$'\n'/ })"
    kill $pids 2>/dev/null || true
    sleep 1
  fi
}

# 1. Postgres up + ready, dedicated walty_e2e DB, schema pushed.
if [[ -z "$(dc ps -q db 2>/dev/null)" ]]; then dc up -d; fi
for i in $(seq 1 60); do
  dc exec -T db pg_isready -U wallet -d wallet >/dev/null 2>&1 && break
  sleep 1
done
dc exec -T db pg_isready -U wallet -d wallet >/dev/null 2>&1 || { echo "[e2e] DB never became ready after 60s"; exit 1; }
dc exec -T db psql -U wallet -d wallet -tc \
  "SELECT 1 FROM pg_database WHERE datname='${E2E_DB}'" | grep -q 1 \
  || dc exec -T db createdb -U wallet "${E2E_DB}"
echo "[e2e] pushing schema to ${E2E_DB}"
DATABASE_URL="$DB_URL" pnpm --filter @walty/db exec drizzle-kit push >/dev/null

# 2. Build the web with the API origin BAKED (the MPC socket reads
#    NEXT_PUBLIC_API_BASE_URL at build time).
echo "[e2e] building web (NEXT_PUBLIC_API_BASE_URL=${API_URL})"
NEXT_PUBLIC_API_BASE_URL="$API_URL" pnpm --filter @walty/web build >/dev/null

# 3. Start the real API on a fixed port (background). Free it first — a stale
#    API from a previous killed run can still hold the port.
free_port "$API_PORT"
echo "[e2e] starting API on ${API_URL}"
DATABASE_URL="$DB_URL" \
  JWT_SECRET="${E2E_JWT_SECRET:-e2e-secret}" \
  WEB_ORIGIN="http://127.0.0.1:${WEB_PORT}" \
  API_PORT="$API_PORT" \
  NODE_ENV=test APP_ENV=development LOG_LEVEL="${E2E_LOG_LEVEL:-silent}" \
  WORKERS_ENABLED=false \
  E2E_RATE_LIMIT_DISABLED=true \
  MPC_KMS_DEV_KEK="${MPC_KMS_DEV_KEK:-$(openssl rand -base64 32)}" \
  pnpm --filter @walty/api start &
API_PID=$!
trap 'kill "$API_PID" 2>/dev/null || true' EXIT

# 4. Health-poll the API until it returns a real HTTP status (tsx + DKLS wasm
#    cold-start can take ~10s). /session returns 401 unauthenticated.
for i in $(seq 1 90); do
  code=$(curl -s -o /dev/null -w "%{http_code}" "${API_URL}/session" 2>/dev/null || true)
  case "$code" in 2??|401|403) break;; esac
  sleep 1
done
[[ "$code" =~ ^(2[0-9]{2}|401|403)$ ]] || { echo "[e2e] API timed out after 90s (last status: ${code:-?})"; exit 1; }
echo "[e2e] API up after ${i}s (status ${code})"

# 5. Free the web port so Playwright's webServer starts a FRESH `next start` on
#    the just-built .next. E2E_FRESH (below) also forces reuseExistingServer=false,
#    so a stale server (e.g. one serving a pre-fix CSP / old worker) can't be reused.
free_port "$WEB_PORT"

# 6. Run Playwright. webServer (playwright.config.ts) starts `next start` on
#    WEB_PORT wired at runtime to the API. E2E_FRESH disables reuseExistingServer.
# DATABASE_URL points the test process's @walty/db at the LOCAL walty_e2e (for DB
# asserts/seeding) — never the .env Supabase. global-setup re-checks it's local.
PLAYWRIGHT_PORT="$WEB_PORT" \
  E2E_API_URL="$API_URL" \
  E2E_FRESH=1 \
  E2E_JWT_SECRET="${E2E_JWT_SECRET:-e2e-secret}" \
  JWT_SECRET="${E2E_JWT_SECRET:-e2e-secret}" \
  DATABASE_URL="$DB_URL" \
  pnpm test:e2e "$@"
