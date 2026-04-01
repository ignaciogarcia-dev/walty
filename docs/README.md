# Walty Documentation

Walty is an on-chain crypto payment platform for individuals and businesses. Users create a self-custodial wallet, send and receive tokens across EVM chains, and businesses can generate QR payment requests, manage cashier teams, and handle refunds — all without the server ever touching private keys.

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

### For individuals (person accounts)

- Self-custodial HD wallet (BIP-39, 24 words) created and encrypted in the browser
- Multi-chain portfolio view (ETH, MATIC, USDC, USDT, and more across 5 EVM chains)
- Send tokens via a review-and-confirm flow backed by signed transaction intents
- Contact book, transaction history, and encrypted seed backup

### For businesses (business accounts)

- Generate QR-code payment requests (Polygon, USDC/USDT)
- Share a public `/pay/[requestId]` link — no account required for payers
- Split payment support (multiple payers, one request)
- Cashier invitation system with role-based access (owner / cashier)
- Refund request and owner-execution flow
- Audit log for all business actions
