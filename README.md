<div align="center">
  <a href="#">
    <img src="public/readme/banner.jpg" alt="Walty" />
  </a>

  <h1>Walty</h1>

  <p>Walty is a free and open-source multichain EVM wallet focused on simplicity, privacy, and self-custody.</p>

  <p><a href="#quick-start">Get Started</a> · <a href="#self-hosting">Self-Hosting</a> · <a href="docs/architecture.md">Learn More</a></p>
</div>

---
Walty makes managing your crypto assets straightforward. Create a secure wallet, view your portfolio across multiple EVM chains, send tokens, and swap assets. All while maintaining complete control over your private keys.

Built with privacy as a core principle, Walty keeps your seed phrase in the browser, encrypts it locally, and signs transactions client-side. The entire application can also be self-hosted on your own infrastructure.

## Features

**Wallet**

- Create and import wallets with 24-word seed phrases
- Local encryption and automatic wallet lock
- Export and import encrypted wallet backups
- Address book and saved contacts

**Multichain EVM**

- Support for Ethereum, Arbitrum, Base, Optimism, and Polygon
- Cross-chain portfolio view with token balances and USD values
- ERC-20 token support across supported networks

**Transactions**

- Send native tokens and ERC-20s
- Real-time gas estimation
- Transaction history with on-chain status updates
- Explorer links for tracking transactions

**Swaps**

- Token swaps with live quotes
- Automatic ERC-20 approval handling
- Transaction simulation before execution

**Privacy & Control**

- Self-host on your own infrastructure
- No tracking or analytics by default
- Server never sees your mnemonic or private keys

**Extras**

- Multi-language support (English and Spanish)
- Dark mode
- Responsive design
- ENS name resolution for Ethereum addresses

## Quick Start

The quickest way to run Walty locally:

```bash
# Clone the repository
git clone https://github.com/ignaciogarcia-dev/walty.git
cd walty

# Copy the environment variables template
cp .env.example .env

# Edit .env
# Required: JWT_SECRET and SERVER_PEPPER
# Recommended: ALCHEMY_API_KEY
# Optional: ZEROX_API_KEY for swaps

# Build and start all services
docker compose up --build

# Access the app
xdg-open http://localhost:3000
```

Migrations run automatically on container startup. For the full environment variable list, see `.env.example`.

## Development

This project runs through Docker Compose. Because of the app's CSP setup, use `docker compose up --build` instead of `next dev` while developing.

## Self-Hosting

Walty can be self-hosted with Docker. PostgreSQL runs as part of the stack, and database migrations are applied automatically on startup.

Basic environment setup:

```bash
cp .env.example .env

docker compose up --build
```

**Required:**
- `DATABASE_URL`: PostgreSQL connection string (default: `postgresql://wallet:wallet@db:5432/wallet`)
- `JWT_SECRET`: Secret key for JWT token signing
- `SERVER_PEPPER`: Secret used for wallet challenge generation

**Recommended:**
- `ALCHEMY_API_KEY`: Improves reliability for multichain RPC calls

**Optional:**
- `ZEROX_API_KEY`: Enables swaps
- `ANKR_API_KEY`: Optional RPC fallback
- `ONEINCH_API_KEY`: Optional swap fallback
- `COINGECKO_API_KEY`: Improves token price and image rate limits
- `COINGECKO_API_BASE_URL`: Overrides the default CoinGecko API base URL
- `COOKIE_SECURE`: Forces the JWT cookie `Secure` flag in local HTTPS setups

For deeper implementation details, see `docs/architecture.md`.
