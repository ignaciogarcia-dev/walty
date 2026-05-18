#!/bin/sh
set -e

echo "Waiting for database..."

# pnpm hoists pg under apps/api's node_modules; use exec so node resolves it.
until pnpm --filter @walty/api exec node -e "
const { Client } = require('pg');
const client = new Client({ connectionString: process.env.DATABASE_URL });
client.connect()
  .then(() => client.query('SELECT 1'))
  .then(() => client.end())
  .then(() => process.exit(0))
  .catch(() => process.exit(1));
" >/dev/null 2>&1; do
  sleep 1
done

echo "Running DB migrations..."
if [ "$NODE_ENV" = "production" ]; then
  CMD="pnpm --filter @walty/db exec drizzle-kit migrate"
else
  CMD="pnpm --filter @walty/db exec drizzle-kit push"
fi
if $CMD; then
  echo "✓ Database schema synchronized"
else
  echo "✗ Migration failed"
  exit 1
fi

echo "Starting API..."
exec pnpm --filter @walty/api start
