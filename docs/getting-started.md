# Getting Started

This guide helps you run Walty locally using Docker.

## Prerequisites

- Docker and Docker Compose
- Git

## Quick Setup

```bash
git clone https://github.com/ignaciogarcia-dev/walty.git
cd walty

cp .env.example .env
docker compose up --build
```

Open `http://localhost:3000`.

## What Starts with Docker Compose

- `app`: Next.js application on port `3000`
- `db`: PostgreSQL on port `5432`

Database migrations are executed automatically when the app container starts.

## Environment Variables

Required:

- `DATABASE_URL`
- `JWT_SECRET`
- `SERVER_PEPPER`

Recommended:

- `ALCHEMY_API_KEY`

Optional:

- `ZEROX_API_KEY`
- `ANKR_API_KEY`
- `ONEINCH_API_KEY`
- `COINGECKO_API_KEY`

See `.env.example` for full details and notes.

## Useful Commands

```bash
# start stack
docker compose up --build

# stop stack
docker compose down

# check service state
docker compose ps

# view logs
docker compose logs -f app
```

## Next Steps

- Read [development.md](development.md) if you want to contribute.
- Read [architecture.md](architecture.md) for codebase orientation.
