# Walty Documentation

Walty is an on-chain crypto payment platform for businesses. Merchants create a self-custodial wallet, generate QR payment requests, manage cashier teams, and handle refunds — all without the server ever touching private keys.

## Who Is This For

- **Contributors** looking to understand the codebase before submitting a PR.
- **Self-hosters** who want to run Walty on their own infrastructure.
- **Forkers** building on top of the payment platform primitives.

## Documentation Index

| Document | Purpose |
| --- | --- |
| [getting-started.md](getting-started.md) | Local setup, environment variables, and first run |
| [development.md](development.md) | Day-to-day workflow, scripts, and navigation tips |
| [architecture.md](architecture.md) | System architecture, domain boundaries, and main flows |
| [repository-map.md](repository-map.md) | Where each concern lives in the repo |
| [roadmap.md](roadmap.md) | Product direction and contribution guidelines |

## What Walty Does

Walty is business-only. Every registered user is the owner of their own business; team members (cashiers) join via invite link and share the owner's merchant wallet through HD-derived operator wallets.

- Self-custodial HD wallet (BIP-39, 24 words) created and encrypted in the browser
- Generate QR-code payment requests (Polygon, USDC / USDT)
- Public `/pay/[requestId]` link — payers do not need a Walty account
- Split payment support (multiple payers, one request)
- Cashier invitation system with role-based access (owner / cashier)
- Refund request flow (cashier requests → owner approves → owner signs and broadcasts via a transaction intent)
- Audit log for all business actions
