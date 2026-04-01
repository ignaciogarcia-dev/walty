# Roadmap

Directional guidance for contributors and forks. Not a release contract.

Open an issue before large changes. State the user or operator problem first.

## Product Direction

### Payments

Current surface:
- QR payment requests on Polygon (USDC / USDT)
- Split payments (multiple payers per request)
- Public `/pay/[requestId]` — payers need no account
- Cashier invitation flow and cashier wallet collection
- Refund request + owner-execution flow
- Audit logging for all business actions

Open areas:
- Multi-chain payment support beyond Polygon
- Additional stablecoins (USDC on other chains, EURC, etc.)
- Stronger reconciliation observability (retry, alerting, scan gaps)
- Webhook / push notification on payment confirmation

### Wallet

Current surface:
- Self-custodial BIP-39 wallet (24 words), browser-only
- AES-GCM + PBKDF2 v3 seed encryption in IndexedDB
- PIN-encrypted server backup
- Send flow via transaction intents (sign in browser, broadcast via server)
- Auto-lock after inactivity

Open areas:
- Hardware wallet support (Ledger via viem)
- WalletConnect integration for external dApps
- Improve recovery UX (seed phrase import from mobile)

### Portfolio and Pricing

Current surface:
- Multi-chain EVM portfolio (balances + USD prices)
- CoinGecko primary / DefiLlama fallback pricing
- Stablecoins hardcoded at $1

Open areas:
- Improve pricing resilience (fallback chain, staleness detection)
- Expand token registry per chain

### Business Team Management

Current surface:
- Owner + cashier roles
- Invite links with expiry
- Operator-scoped payment requests

Open areas:
- Manager role with configurable permissions
- Multi-business support (one user owning multiple business profiles)
- Business analytics and export

## Proposal Checklist

When proposing a new feature or refactor:

1. State the user or operator problem first.
2. Explain which domain it affects (`wallet`, `payments`, `business`, `portfolio`).
3. List touched modules and API routes.
4. Describe the validation strategy (tests, manual steps).
5. Call out any risks to wallet security, payment integrity, or business flows.
