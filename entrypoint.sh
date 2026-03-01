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

echo "Running migrations..."
pnpm drizzle-kit migrate

echo "Starting app..."
exec pnpm start
