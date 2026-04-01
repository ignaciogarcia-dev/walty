# Development Guide

## Working Modes

### Local (recommended)

Start PostgreSQL in Docker, run the app on the host:

```bash
docker compose -f compose.dev.yml up -d
pnpm install
pnpm db:migrate
pnpm dev
```

### Production-style container

Validates the full app container. Requires an external PostgreSQL database in `DATABASE_URL`:

```bash
docker compose up --build
```

## Scripts

| Command | Description |
| --- | --- |
| `pnpm dev` | Start the Next.js dev server |
| `pnpm build` | Build the production bundle |
| `pnpm start` | Start the production server |
| `pnpm lint` | Run ESLint |
| `pnpm test` | Run Vitest in watch mode |
| `pnpm test:run` | Run Vitest once |
| `pnpm test:e2e` | Run Playwright tests |
| `pnpm test:e2e:ui` | Run Playwright UI mode |
| `pnpm db:migrate` | Push the Drizzle schema |
| `pnpm db:studio` | Open Drizzle Studio |
| `pnpm docker:dev` | Start local PostgreSQL only |
| `pnpm docker:dev:down` | Stop local PostgreSQL |
| `pnpm docker` | Start the production-style app container |
| `pnpm dev:clean` | Remove `.next` and `.turbo` artifacts |

## Repo Layout

| Path | Purpose |
| --- | --- |
| `app/` | App Router pages, layouts, and API routes |
| `components/` | React UI grouped by domain |
| `hooks/` | Client orchestration hooks |
| `lib/` | Domain logic, auth, policies, RPC, transactions |
| `server/db/` | Drizzle schema and DB client |
| `utils/` | Small client utilities (style, locale, theme) |
| `locales/` | Translation dictionaries (en, es) |
| `docs/` | Contributor documentation |

## Where To Start By Task

| Task | Start here |
| --- | --- |
| Onboarding / auth | `app/onboarding/`, `app/api/auth/`, `lib/auth/` |
| Wallet unlock / signing | `hooks/useWallet.ts`, `components/wallet/`, `lib/crypto.ts` |
| Send flow | `components/wallet/SendForm.tsx`, `lib/tx-intents/`, `lib/transactions/` |
| Business payments / QR | `components/pos/CollectModal.tsx`, `app/api/payment-requests/`, `lib/payments/` |
| Business team / cashier | `components/business/`, `app/api/business/`, `lib/business/` |
| Refund flow | `app/api/business/refund-requests/`, `lib/policies/payment.policy.ts` |
| Portfolio / pricing | `hooks/usePortfolio.ts`, `app/api/portfolio/`, `lib/portfolio/` |
| Permissions / policies | `lib/permissions/resolve.ts`, `lib/policies/` |

## Validation Loop

1. Make the smallest coherent change.
2. `pnpm lint`
3. `pnpm test:run` when logic changed.
4. `pnpm build` before opening a PR.
5. Update `/docs` when behavior or structure changes.

## Documentation Map

| Need | Document |
| --- | --- |
| High-level system design | [architecture.md](architecture.md) |
| Repo navigation | [repository-map.md](repository-map.md) |
