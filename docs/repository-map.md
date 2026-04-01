# Repository Map

Compact orientation guide for contributors.

## Top-Level Layout

| Path | Purpose |
| --- | --- |
| `app/` | App Router pages, layouts, and API routes |
| `components/` | React UI grouped by domain |
| `hooks/` | Client hooks (wallet, portfolio, user, business context) |
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
| `hooks/useWalletLifecycle.ts` | Create, unlock, lock, recover, backup, export |
| `hooks/useWalletTransfer.ts` | Send, sign, broadcast |
| `hooks/useOperatorWalletCollection.ts` | Gas funding + cashier collection |
| `hooks/useWalletHistory.ts` | Tx history and balance |
| `hooks/useUser.tsx` | Session bootstrap |
| `hooks/usePortfolio.ts` | Multi-chain portfolio loading |
| `hooks/useUnlockFlow.tsx` | Unlock gate for protected actions |
| `hooks/useBusinessContext.ts` | Business context (role, wallet address) |

### Domain libraries

| Path | Responsibility |
| --- | --- |
| `lib/auth.ts`, `lib/auth/` | JWT verification, rate limiting |
| `lib/crypto.ts` | AES-GCM seed encryption (v1/v2/v3) |
| `lib/wallet-store.ts` | IndexedDB abstraction |
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
| `lib/portfolio/portfolio-engine.ts` | Server-side cross-chain balance + price aggregation |
| `lib/dashboard/` | Dashboard routing logic |
| `lib/api/pipeline.ts` | withAuth, withBusinessContext, withPermission layers |

