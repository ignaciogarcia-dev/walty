# Getting Started

## Prerequisites

- Node.js 20+
- pnpm
- Docker
- Git

## Local Setup

```bash
git clone https://github.com/ignaciogarcia-dev/walty.git
cd walty

cp .env.example .env
# Edit .env with your values (see Environment Variables below)

docker compose -f compose.dev.yml up -d  # start PostgreSQL only
pnpm install
pnpm db:migrate
pnpm dev
```

Open `http://localhost:3000`.

Health check:

```bash
curl http://localhost:3000/api/health
```

## Environment Variables

**Required:**

| Variable | Description |
| --- | --- |
| `DATABASE_URL` | PostgreSQL connection string |
| `JWT_SECRET` | Secret for signing JWT session tokens |

**Required for blockchain features:**

| Variable | Description |
| --- | --- |
| `ALCHEMY_API_KEY` | Alchemy API key (server-side RPC) |
| `NEXT_PUBLIC_ALCHEMY_API_KEY` | Same key exposed to browser for client-side signing |

**Required for payment reconciliation:**

| Variable | Description |
| --- | --- |
| `PAYMENTS_RECONCILE_SECRET` | Shared secret for the internal reconciler endpoint |

**Optional:**

| Variable | Default | Description |
| --- | --- | --- |
| `ANKR_API_KEY` | — | Ankr API key for RPC fallback |
| `COINGECKO_API_KEY` | — | CoinGecko API key for pricing |
| `NEXT_PUBLIC_ENABLED_CHAINS` | `137` | Comma-separated chain IDs exposed in the UI |
| `COOKIE_SECURE` | `true` in prod | Set to `false` for local HTTP |

> **Note:** The default `NEXT_PUBLIC_ENABLED_CHAINS=137` exposes only Polygon in the UI. Portfolio reads all chains server-side regardless of this value.

## Useful Commands

```bash
pnpm dev              # start Next.js dev server
pnpm build            # production build
pnpm lint             # ESLint
pnpm test:run         # Vitest (single run)
pnpm db:migrate       # push Drizzle schema to DB
pnpm db:studio        # open Drizzle Studio
pnpm docker:dev       # start PostgreSQL only (compose.dev.yml)
pnpm docker:dev:down  # stop PostgreSQL
pnpm dev:clean        # remove .next and .turbo artifacts
```

## Production Container

Use `docker-compose.yml` when you already have an external PostgreSQL database in `DATABASE_URL`. The compose file starts only the `app` service — the database is expected to exist outside the stack.

```bash
cp .env.example .env
# fill in DATABASE_URL pointing to your external DB
docker compose up --build
```

Migrations run automatically via `entrypoint.sh` on container start.

## Next Reads

- [development.md](development.md) — workflow and navigation tips
- [architecture.md](architecture.md) — system design and domain boundaries
- [repository-map.md](repository-map.md) — where everything lives
