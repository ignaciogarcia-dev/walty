FROM node:26-alpine

WORKDIR /app

# Copy lockfile + workspace manifest first so the layer cache survives
# unrelated code changes.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY tsconfig.base.json ./
COPY apps/api/package.json ./apps/api/
COPY packages/db/package.json ./packages/db/
COPY packages/shared/package.json ./packages/shared/

RUN corepack enable && pnpm install --frozen-lockfile

COPY . .

EXPOSE 4000

RUN chmod +x apps/api/entrypoint.sh

CMD ["./apps/api/entrypoint.sh"]
