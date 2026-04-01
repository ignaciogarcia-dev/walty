# Architecture

Walty is an on-chain crypto payment platform built on Next.js App Router. The server never holds private keys — all signing happens in the browser. Transaction intents are the backbone for every fund-moving operation.

## Stack

| Layer | Technology |
| --- | --- |
| Framework | Next.js App Router, React 19, TypeScript 5 |
| Styling | Tailwind CSS 4, Radix UI |
| Database | PostgreSQL 16 + Drizzle ORM |
| Blockchain | viem 2 (wallet derivation, signing, RPC, receipts) |
| RPC | Alchemy (primary) + Ankr (fallback) |
| Auth | bcrypt + JWT (HttpOnly cookie) |
| Seed encryption | Web Crypto API — AES-GCM + PBKDF2 v3 (600k iterations) |

## Runtime Surfaces

### Public web

- Landing page (`/`)
- Public payment links: `/pay/[requestId]` — payers need no account
- Public invite links: `/join/[token]`

### Auth and onboarding

- Registration and login
- Account type selection (person / business)
- Wallet creation or recovery from mnemonic
- PIN setup and encrypted backup upload

### Personal wallet (person accounts)

- Multi-chain portfolio view
- Send flow (review → sign → broadcast)
- Scan and pay a business QR code
- Contact book and transaction history

### Business operations (business accounts)

- QR collection modal (generate request → poll → confirmed)
- Cashier invitation and cashier wallet collection
- Refund request, owner approval, and refund execution
- Audit log

### Server APIs

- Auth, session, profile
- Wallet backup and wallet linking (nonce + EIP-191)
- Transaction intents lifecycle and transaction recording
- Payment request lifecycle + on-chain reconciliation
- Business context, members, cashier wallets, and refunds

## Domain Boundaries

| Domain | Key paths |
| --- | --- |
| App shell and routing | `app/layout.tsx`, `app/dashboard/layout.tsx`, `middleware.ts`, `lib/dashboard/` |
| Onboarding | `app/onboarding/`, `lib/onboarding/`, `app/api/auth/`, `app/api/user/type/`, `app/api/profile/` |
| Wallet runtime | `hooks/useWallet.ts` (coordinator), `hooks/useWalletLifecycle.ts`, `hooks/useWalletTransfer.ts`, `hooks/useWalletHistory.ts`, `lib/crypto.ts`, `lib/wallet-store.ts`, `lib/wallet/` |
| Transaction execution | `lib/tx-intents/`, `lib/signing/`, `lib/transactions/`, `app/api/tx-intents/`, `app/api/tx/` |
| Payments and POS | `components/pos/`, `lib/payments/`, `app/api/payment-requests/` |
| Business and cashier | `components/business/`, `app/api/business/`, `lib/business/`, `lib/permissions/`, `lib/policies/` |
| Portfolio and pricing | `app/api/portfolio/`, `app/api/prices/`, `lib/portfolio/`, `lib/providers/pricing/` |

## Data Boundaries

| Data | Lives in | Notes |
| --- | --- | --- |
| Session identity | JWT cookie | HttpOnly, server-verified, JS-inaccessible |
| Local wallet | IndexedDB | Encrypted V3 payload (AES-GCM + PBKDF2) |
| Seed backup | PostgreSQL `wallet_backups` | Same encrypted shape as local — server never sees plaintext |
| Business state | PostgreSQL | `payment_requests`, `business_members`, `refund_requests`, audit logs |
| Unsigned intent payload | PostgreSQL `tx_intents` | Used to reconstruct the transaction on the client |
| Signed raw tx | PostgreSQL `tx_intents.signed_raw` | Stored temporarily; cleared after broadcast |
| Chain state | RPC providers | Never persisted — fetched on demand |

## Security Highlights

- **Server-side**: no seeds, no mnemonics, no plaintext private keys.
- **Signing**: always in the browser via `WalletSecurityManager.withUnlockedSeed()` — seed is decrypted on demand, used once, then zeroed from memory.
- **Wallet linking**: server-issued one-time nonce (5-min TTL) + EIP-191 signature — prevents replay attacks.
- **Transaction intents**: idempotency key prevents duplicates; atomic `signed → broadcasting` transition prevents double-broadcast.
- **Auth**: JWT in HttpOnly cookie (`Secure; SameSite=Strict`).
- **Rate limiting**: 20 req/min per IP on auth endpoints.
- **Headers**: `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, per-request CSP nonce.

## Main Flows

### New wallet

```
onboarding UI
  → createWallet()          # BIP-39, 24 words, browser-only
  → encryptSeedV3()         # AES-GCM + PBKDF2, stored in IndexedDB
  → POST /api/wallet/nonce  # server issues one-time nonce
  → POST /api/wallet/link   # EIP-191 sig verifies ownership, address saved
  → POST /api/wallet/backup # optional encrypted backup to server
```

### Send (person)

```
SendForm
  → POST /api/tx-intents               # create intent with payload
  → client-side sign (withUnlockedSeed)
  → POST /api/tx-intents/[id]/broadcast
  → POST /api/tx                        # record pending tx
  → receipt polling
  → PATCH /api/tx-intents/[id]         # confirm intent
  → PATCH /api/tx                       # confirm tx
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

- Payment requests are **Polygon-only** and limited to **USDC**.
- Portfolio can read multiple EVM chains; the UI is filtered by `NEXT_PUBLIC_ENABLED_CHAINS`.
- Business roles are `owner` and `cashier` (manager role exists in DB for future use).
- Cashier wallets are HD-derived from the owner mnemonic using a `derivationIndex`.
