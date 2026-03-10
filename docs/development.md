# Development Guide

This guide covers the recommended development workflow for Walty.

## Prerequisites

- Node.js 20+
- pnpm
- Docker and Docker Compose
- Git

## Recommended Workflow

Walty is easiest to develop with the full Docker stack:

```bash
cp .env.example .env
docker compose up --build
```

This keeps runtime behavior aligned with production and avoids local inconsistencies.

## Alternative Workflow (Infrastructure Only)

If you want to run only PostgreSQL in Docker:

```bash
docker compose -f compose.dev.yml up -d
pnpm install
pnpm db:migrate
pnpm dev
```

Note: the full Docker workflow remains the default recommendation.

## Common Scripts

| Command | Description |
| --- | --- |
| `pnpm dev` | Start Next.js dev server |
| `pnpm build` | Build production app |
| `pnpm start` | Start production server |
| `pnpm lint` | Run ESLint |
| `pnpm db:migrate` | Apply DB changes (Drizzle) |
| `pnpm db:studio` | Open Drizzle Studio |
| `pnpm docker` | Start full stack with Docker Compose |
| `pnpm docker:dev` | Start dev DB stack (`compose.dev.yml`) |
| `pnpm docker:dev:down` | Stop dev DB stack |
| `pnpm dev:clean` | Clean local/dev artifacts |

## Suggested Contribution Loop

1. Pick or open an issue.
2. Create a branch from `main`.
3. Implement the smallest useful slice.
4. Run checks:

```bash
pnpm lint
pnpm build
```

5. Open PR linked to the issue.
6. Iterate with review feedback.

For contribution policy, read [../CONTRIBUTING.md](../CONTRIBUTING.md).
