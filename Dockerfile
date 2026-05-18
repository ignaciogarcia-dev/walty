FROM node:20-alpine

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY tsconfig.base.json ./
COPY apps/web/package.json ./apps/web/
COPY packages/db/package.json ./packages/db/
COPY packages/shared/package.json ./packages/shared/

RUN corepack enable && pnpm install --frozen-lockfile

COPY . .

RUN pnpm --filter @walty/web build

EXPOSE 3000

RUN chmod +x entrypoint.sh

CMD ["./entrypoint.sh"]
