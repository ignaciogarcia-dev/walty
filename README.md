<div align="center">
  <a href="">
    <img src="public/readme/banner.jpg" alt="Wallty" />
  </a>

  <h1>Wallty</h1>

  <p>Wallty is a free and open-source crypto wallet dashboard focused on simplicity, privacy, and self-custody.</p>
</div>

---
Wallty makes managing your crypto assets straightforward. Create a secure wallet, view your portfolio across multiple chains, send tokens, and swap assets—all while maintaining complete control over your private keys. The entire application can be self-hosted on your own infrastructure.

Built with privacy and security as core principles, Wallty ensures your seed phrase never leaves your browser. The mnemonic is encrypted locally and stored only in your browser's localStorage. The server never sees your private keys, and all transaction signing happens client-side.

## Features

**Wallet Management**

- BIP-39 mnemonic generation with 24-word seed phrases
- Local encryption using AES-GCM with PBKDF2 (210,000 iterations)
- Auto-lock after 5 minutes of inactivity or immediate lock on tab blur
- Export and import encrypted wallet backups
- Server-verified wallet linking via cryptographic nonce signatures

**Multi-Chain Support**

- Native support for Ethereum, Arbitrum, Base, Optimism, and Polygon
- View token balances across all supported chains
- Token portfolio with USD value calculations
- ERC-20 token support with multicall balance queries

**Transactions**

- Send ETH and tokens with real-time gas estimation
- Transaction history with on-chain status synchronization
- Automatic transaction status updates on wallet unlock
- Etherscan integration for transaction tracking

**Token Swaps**

- Swap tokens using 0x Protocol aggregation
- Price quotes with real-time market data
- Automatic ERC-20 approval handling
- Transaction simulation before execution

**Privacy & Security**

- Self-host on your own infrastructure
- No tracking or analytics by default
- Content Security Policy with per-request cryptographic nonces
- HttpOnly JWT cookies for authentication
- Rate limiting on authentication endpoints
- Server never sees your mnemonic or private keys

**User Experience**

- Multi-language support (English and Spanish)
- Dark mode with theme persistence
- Responsive design with mobile support
- ENS name resolution for Ethereum addresses
- Contact management for saved addresses

## Quick Start

The quickest way to run Wallty locally:

```bash
# Clone the repository
git clone https://github.com/ignaciogarcia-dev/walty.git
cd walty

# Build and start all services
docker compose up --build

# Access the app
open http://localhost:3000
```

Migrations run automatically on container startup—no manual steps needed. The entrypoint script waits for PostgreSQL to be ready, applies database migrations, then starts the application.

## Tech Stack

Wallty is built with Next.js 16, TypeScript, and Tailwind CSS. The wallet functionality uses viem for Ethereum interactions and the Web Crypto API for encryption. The backend uses PostgreSQL with Drizzle ORM, and authentication relies on JWT tokens stored in HttpOnly cookies. Token swaps integrate with the 0x Protocol API.

## Development

This project does not use `next dev` in development mode. Due to strict Content Security Policy constraints, the app must run in production mode via Docker Compose. Always use `docker compose up --build` after making code changes.

## Security

Wallty implements multiple layers of security. The server never sees your mnemonic—seed phrases are generated, encrypted, and stored entirely in the browser. Authentication uses JWT tokens stored in HttpOnly cookies, and rate limiting prevents brute-force attacks. Content Security Policy is enforced with per-request nonces, and all transaction signing happens client-side.

## Self-Hosting

Wallty can be self-hosted using Docker. The stack includes PostgreSQL for storing user accounts, linked addresses, and transaction history. The application runs in a Node.js container with automatic database migrations on startup.

Build from source:

```bash
docker compose up --build
```

Environment variables required: `DATABASE_URL`, `JWT_SECRET`, and optionally `NEXT_PUBLIC_RPC_URL` and `ZEROX_API_KEY`.
