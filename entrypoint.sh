#!/bin/sh
set -e

echo "Running database migrations..."
pnpm drizzle-kit migrate

echo "Starting application..."
exec pnpm start
