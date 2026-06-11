# Architecture

Walty is an on-chain crypto POS platform with a Next.js web app and an Express/Socket.IO API. The server never holds a complete private key; new business wallets use 2-of-3 MPC. Transaction intents are the backbone for every fund-moving operation.

## Stack

| Layer | Technology |
| --- | --- |
| Web | Next.js App Router, React 19, TypeScript 5 |
| API | Express 4, Socket.IO, TypeScript 5 |
| Styling | Tailwind CSS 4, Radix UI |
| Database | PostgreSQL 16 + Drizzle ORM |
| Blockchain | viem 2 (RPC, transaction building, receipts) |
| RPC | Alchemy (primary) + Ankr (fallback) |
| Auth | bcrypt + JWT (HttpOnly cookie) |
| MPC | Silence Laboratories DKLS WASM, device/server/backup shares |

## Runtime Surfaces

### Public web

- Landing page (`/`)
- Public payment links: `/pay/[requestId]` — payers need no account
- Public invite links: `/join/[token]`

### Auth and onboarding

- Registration and login
- Business setup (name) — `/onboarding/setup-business`
- MPC DKG wallet creation
- Recovery kit export and kit-based recovery
- PIN setup for the local device share

### Business operations (owner + cashier)

- QR collection modal (generate request → poll → confirmed)
- Cashier invitation and cashier wallet collection
- Refund request, owner approval, owner-signed execution
- Audit log

### Server APIs

- Auth, session
- MPC key status, DKG/sign/recover ceremonies, and device sessions
- Transaction intents lifecycle (with payload-hash idempotency) and transaction recording
- Payment request lifecycle + on-chain reconciliation (split + non-split)
- Business context, settings, members, cashier wallets, and refunds
- Internal: `/api/internal/tx-intents/sweep` recovers intents stuck in `broadcasting`

## Domain Boundaries

| Domain | Key paths |
| --- | --- |
| App shell and routing | `app/layout.tsx`, `app/dashboard/layout.tsx`, `middleware.ts`, `lib/dashboard/` |
| Onboarding | `app/onboarding/`, `lib/onboarding/`, `app/api/auth/`, `app/api/business/settings/` |
| Wallet runtime | `hooks/useWallet.ts`, `hooks/useWalletLifecycle.ts`, `lib/mpc/`, `lib/wallet/` |
| Transaction execution | `apps/api/src/routes/txIntents.ts`, `lib/tx-intents/`, `lib/transactions/` |
| Payments and POS | `components/pos/`, `apps/api/src/routes/paymentRequests.ts`, `lib/payments/` |
| Business and cashier | `components/business/`, `apps/api/src/routes/business.ts`, `lib/business/`, `lib/permissions/`, `lib/policies/` |

## Data Boundaries

| Data | Lives in | Notes |
| --- | --- | --- |
| Session identity | JWT cookie | HttpOnly, server-verified, JS-inaccessible |
| Local device share | IndexedDB | MPC device share encrypted under the user PIN |
| Server MPC share | PostgreSQL `mpc_server_shares` | AES-GCM encrypted share envelope |
| Recovery kit | User-held JSON file | Encrypted backup share; required for device recovery |
| Business state | PostgreSQL | `business_settings`, `payment_requests`, `business_members`, `refund_requests`, audit logs |
| Unsigned intent payload | PostgreSQL `tx_intents` | Used to reconstruct the transaction on the client |
| Signed raw tx | PostgreSQL `tx_intents.signed_raw` | Stored temporarily; cleared after broadcast |
| Chain state | RPC providers | Never persisted — fetched on demand |

## Security Highlights

- **Server-side**: no seeds, no mnemonics, no complete private keys.
- **Signing**: MPC sign ceremonies combine the local device share with the encrypted server share.
- **Recovery**: recovery kit only; seed import and server seed backups are not part of the product surface.
- **Transaction intents**: idempotency key + canonical payload hash prevent duplicate or substituted payloads (409 on mismatch); atomic `signed → broadcasting` transition prevents double-broadcast; a sweep endpoint recovers intents stuck in `broadcasting`.
- **Public payment endpoints**: `/api/payment-requests/[id]` and `/contributions` are public but expose only the fields a payer needs (status, amount, token, merchant wallet) — never `payerAddress`, `txHash` or discrepancy data. Merchants use the authenticated `/api/business/payment-requests/[id]` for full detail.
- **Split payment reconciliation**: per-row `SELECT FOR UPDATE` inside a transaction prevents lost-update races between concurrent reconcilers; `isFullyPaid` is decided from the post-update total.
- **Auth**: JWT in HttpOnly cookie (`Secure; SameSite=Strict`).
- **Rate limiting**: 20 req/min per IP on auth endpoints.
- **Headers**: `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, per-request CSP nonce.

## Main Flows

### New business wallet

```
onboarding UI
  → /mpc DKG ceremony       # device + server + backup shares
  → export recovery kit     # encrypted backup share, user-held
  → save device share       # encrypted locally under PIN
  → dashboard
```

### Business collection

```
CollectModal
  → POST /api/payment-requests          # create request, record startBlock
  → public /pay/[requestId]             # payer sends on-chain transfer
  → reconciler (Transfer log scan)
  → payment_requests: pending → confirming → paid
```

### Refund execution

```
Refund request created
  → owner approves → creates refund tx_intent
  → owner unlocks wallet → sign → broadcast
  → PATCH /api/business/refund-requests/[id] mark_executed
```

## Current Constraints

- Payment requests are **Polygon-only** and accept **USDC** and **USDT**.
- Business roles are `owner` and `cashier` (manager role exists in DB for future use).
- Cashier wallets are derived under the owner's MPC key using a `derivationIndex`.
- Every Walty user is the owner of their own business — there are no P2P / personal-wallet accounts. Operators (cashiers) join an existing business via invite link and never own a personal wallet.
