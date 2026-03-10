# Architecture

This document explains how Walty is organized and how data moves through the app.

## Stack Overview

- **Framework:** Next.js (App Router)
- **Language:** TypeScript
- **UI:** React + Tailwind
- **Database:** PostgreSQL
- **ORM:** Drizzle
- **Blockchain tooling:** viem

## Top-Level Structure

| Path | Purpose |
| --- | --- |
| `app/` | Pages and API routes |
| `components/` | Reusable UI and wallet components |
| `lib/` | Domain logic (wallet, transactions, providers, RPC) |
| `server/db/` | Drizzle DB client and schema |
| `hooks/` | Client hooks for wallet and portfolio state |
| `locales/` | i18n dictionaries |

## Main Runtime Flows

### 1) Wallet Creation and Storage

1. Wallet mnemonic is generated client-side.
2. Mnemonic is encrypted in the browser.
3. Encrypted payload is saved in browser storage.
4. Signing uses decrypted key material client-side only.

Relevant modules:

- `lib/wallet.ts`
- `lib/crypto.ts`
- `lib/wallet-store.ts`

### 2) Portfolio and Prices

1. UI requests portfolio data from authenticated API routes.
2. Backend aggregates token balances and prices via provider routers.
3. Response is normalized for client consumption.

Relevant modules:

- `app/api/portfolio/route.ts`
- `lib/portfolio/portfolio-engine.ts`
- `lib/providers/pricing/*`

### 3) Send and Swap Transactions

1. User prepares transaction in UI.
2. App validates/simulates transaction before submission.
3. Transaction is signed and broadcast.
4. Hash/status are persisted for activity tracking.

Relevant modules:

- `lib/transactions/*`
- `components/wallet/SendForm.tsx`
- `components/wallet/SwapForm.tsx`
- `app/api/tx/route.ts`

### 4) Authentication and User Data

- Session auth is handled with JWT cookies.
- Protected API routes use `requireAuth`.
- User metadata (addresses, contacts, username, tx history) is stored in PostgreSQL.

Relevant modules:

- `lib/auth.ts`
- `app/api/*`
- `server/db/schema.ts`

## Database Model (High Level)

Core tables include:

- `users`
- `addresses`
- `transactions`
- `contacts`
- `user_profiles`
- `wallet_nonces`
- `wallet_backups`

Schema source: `server/db/schema.ts`

## Design Notes for Contributors

- Keep business logic in `lib/` and keep route handlers thin.
- Add new API behavior behind authenticated routes when user-specific.
- Avoid breaking existing chain/provider interfaces without migration plan.
- Update docs when architecture or flows change.
