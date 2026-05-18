#!/bin/sh
set -e

# Web container is pure UI/SSR. It does not touch the database; the
# apps/api service owns migrations and DB connectivity. Just hand off
# to Next.js once the build is in place.
echo "Starting web..."
exec pnpm --filter @walty/web start
