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
| `components/pos/` | Point-of-sale UI (merchant collection modal) |
| `components/settings/` | Settings dialog (theme + locale selectors) |
| `components/theme/` | Theme provider and switcher UI |
| `components/locale/` | Locale (i18n) provider and switcher UI |
| `lib/` | Domain logic (wallet, transactions, providers, RPC) |
| `lib/payments/` | Payment request verification (blockchain log scanning) |
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
- Users have a `userType` field: `"person"` (default) or `"business"`. This controls which home-page actions are shown and which API routes are accessible.

Relevant modules:

- `lib/auth.ts`
- `app/api/*`
- `app/api/user/type/route.ts` — `PATCH /api/user/type`: update account type (auth required)
- `server/db/schema.ts`

### 5) POS / Payment Requests

Business accounts can generate payment requests (invoices) and receive USDC or USDT on Polygon. The flow is:

1. Merchant opens the **Collect modal** (`components/pos/CollectModal.tsx`) and enters an amount + selects a token.
2. App calls `POST /api/payment-requests` (business-only, auth required), which records the request with a 15-minute expiry and the current Polygon block number.
3. A QR code with the public link `/pay/{requestId}` is displayed. The modal polls `GET /api/payment-requests/{requestId}` every 3 seconds.
4. Payer opens `/pay/{requestId}` (public route, no auth required). If not logged in they are redirected to `/onboarding?next=/pay/{id}`.
5. After authenticating, payer is redirected to `/dashboard/pay/{requestId}`, where they confirm payment via `sendToken()` (Polygon USDC/USDT, chain and token locked by URL params).
6. The backend `GET /api/payment-requests/{id}` route calls `checkPayment()` on each poll, which scans Polygon `Transfer` logs from `startBlock` to detect the matching transfer.
7. When a match is found, the request is marked `"paid"` and the merchant modal shows a confirmation with the tx hash.

Relevant modules:

- `lib/payments/checkPayment.ts` — blockchain Transfer log scanning
- `components/pos/CollectModal.tsx` — merchant UI (amount → token → QR + polling → confirmed)
- `app/pay/[requestId]/page.tsx` — public landing page for QR links
- `app/dashboard/pay/[requestId]/page.tsx` — authenticated payment confirmation
- `app/api/payment-requests/route.ts` — create payment request (business, auth)
- `app/api/payment-requests/[id]/route.ts` — poll status + blockchain verification (public)

## Database Model (High Level)

Core tables include:

- `users` — includes `userType` column (`"person"` | `"business"`, default `"person"`)
- `addresses`
- `transactions`
- `contacts`
- `user_profiles`
- `wallet_nonces`
- `wallet_backups`
- `payment_requests` — merchant invoices: `id` (UUID), `merchantId` (FK → users), `amountUsd`, `amountToken`, `token` (USDC/USDT), `walletAddress`, `status` (pending/paid/expired/cancelled), `txHash` (nullable), `startBlock` (Polygon block at creation), `expiresAt`, `createdAt`

Schema source: `server/db/schema.ts`

## Routing Notes

- `/dashboard/*` — requires authentication; unauthenticated requests are redirected to `/onboarding`.
  - Key pages: `/dashboard/home`, `/dashboard/send`, `/dashboard/swap`, `/dashboard/activity`, `/dashboard/contacts`, `/dashboard/pay/[requestId]`
- `/pay/*` — public routes; CSP headers are applied but no auth redirect occurs. Used as QR code landing pages.
- `/onboarding/*` — unauthenticated entry point. Full step order:
  `welcome` → `login` / `register` → `create-wallet` → `recovery-phrase` → `confirm-recovery` → `create-pin` → `username` → `account-type` → `complete`

## Settings & Preferences

Theme (dark/light) and locale (es/en) are user-selectable at runtime:

- `utils/theme.ts` / `utils/locale.ts` — read/write preference from cookies (server + client helpers)
- `components/theme/` — `ThemeProvider` + combobox selector component
- `components/locale/` — `LocaleProvider` + combobox selector component
- `components/settings/settings-dialog.tsx` — modal that surfaces both selectors; opened from the `UserMenu` in the sidebar footer

Defaults: theme `"dark"`, locale `"es"`.

## Design Notes for Contributors

- Keep business logic in `lib/` and keep route handlers thin.
- Add new API behavior behind authenticated routes when user-specific.
- Avoid breaking existing chain/provider interfaces without migration plan.
- Update docs when architecture or flows change.
- `lib/wallet-core/` is a reserved stub directory tree (asset-registry, execution-engine, intent-engine, nonce-manager, routing-engine, rpc-layer, solver-network). It is empty and intended for future wallet infrastructure — do not add code there without a design proposal.
