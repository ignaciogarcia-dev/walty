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

### MPC Wallet

Current surface:
- Self-custodial 2-of-3 MPC business wallet
- PIN-encrypted local device share
- User-held recovery kit for the backup share
- Transaction intents signed through MPC ceremonies
- Auto-lock after inactivity

Open areas:
- Hardware wallet support (Ledger via viem)
- WalletConnect integration for external dApps
- Improve recovery kit rotation and device replacement UX

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
2. Explain which domain it affects (`mpc`, `payments`, `business`, `devices`).
3. List touched modules and API routes.
4. Describe the validation strategy (tests, manual steps).
5. Call out any risks to wallet security, payment integrity, or business flows.
