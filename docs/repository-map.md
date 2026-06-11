# Repository Map

Compact orientation guide for contributors.

## Top-Level Layout

| Path | Purpose |
| --- | --- |
| `app/` | App Router pages, layouts, and API routes |
| `components/` | React UI grouped by domain |
| `hooks/` | Client hooks (MPC wallet, user, business context, POS flows) |
| `lib/` | Domain logic, auth, RPC, policies, transactions, payments |
| `server/db/` | Drizzle pool and schema |
| `utils/` | Small client utilities (style, locale, theme) |
| `locales/` | Static translation dictionaries (en, es) |
| `docs/` | Contributor-facing documentation |

## Quick Navigation

### Product entry points

| Path | Description |
| --- | --- |
| `app/page.tsx` | Landing page |
| `app/dashboard/layout.tsx` | Dashboard shell |
| `app/onboarding/layout.tsx` | Onboarding shell |
| `app/pay/[requestId]/page.tsx` | Public payment page (no account needed) |
| `app/join/[token]/page.tsx` | Public invite page |

### Core runtime hooks

| Hook | Responsibility |
| --- | --- |
| `hooks/useWallet.ts` | Coordinator — composes all wallet sub-hooks |
| `hooks/useWalletLifecycle.ts` | Unlock, lock, MPC recovery, cashier derivation |
| `hooks/useWalletTransfer.ts` | Sign and broadcast transaction intents |
| `hooks/useOperatorWalletCollection.ts` | Gas funding + cashier collection |
| `hooks/useUser.tsx` | Session bootstrap |
| `hooks/useUnlockFlow.tsx` | Unlock gate for protected actions |
| `hooks/useBusinessContext.ts` | Business context (role, wallet address) |

### Domain libraries

| Path | Responsibility |
| --- | --- |
| `lib/auth.ts`, `lib/auth/` | JWT verification, rate limiting |
| `lib/crypto.ts` | AES-GCM/PBKDF2 helpers reused for local secret envelopes |
| `lib/mpc/` | MPC client, device share storage, recovery kit handling |
| `lib/wallet/` | WalletSecurityManager, OperatorWalletManager, WalletSessionManager |
| `lib/tx-intents/` | Intent creation, signing, broadcast, expiry |
| `lib/transactions/` | Tx building, preparation, simulation, sending |
| `lib/signing/` | Signer interface and registry |
| `lib/payments/` | Payment reconciliation (Transfer log scan) |
| `lib/business/` | Business context resolution, audit log |
| `lib/permissions/` | Permission set resolution |
| `lib/policies/` | payment.policy, business.policy |
| `lib/rpc/` | Cached viem PublicClient + WalletClient |
| `lib/chainAdapters/` | EVM adapter (multicall, gas, simulate, send) |
| `lib/tokens/tokenRegistry.ts` | TOKEN_REGISTRY by chainId |
| `lib/networks/networks.ts` | NETWORKS[], getNetwork(), getEVMNetworks() |
| `lib/providers/pricing/` | CoinGecko + DefiLlama pricing router |
| `lib/dashboard/` | Dashboard routing logic |
| `lib/api/pipeline.ts` | withAuth, withBusinessContext, withPermission layers |
