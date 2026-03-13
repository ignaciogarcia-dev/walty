#!/bin/sh
set -e

echo "Waiting for database..."

until node -e "
const { Client } = require('pg');
const client = new Client({ connectionString: process.env.DATABASE_URL });
client.connect()
  .then(() => client.query('SELECT 1'))
  .then(() => client.end())
  .then(() => process.exit(0))
  .catch(() => process.exit(1));
"; do
  sleep 1
done

echo "Running DB migrations..."
if pnpm drizzle-kit push; then
  echo "✓ Database schema synchronized"
  echo "Database ready"
else
  echo "✗ Migration failed"
  exit 1
fi

echo "Starting app..."
exec pnpm start
