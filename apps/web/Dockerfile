FROM node:20-alpine

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY tsconfig.base.json ./
COPY apps/web/package.json ./apps/web/
COPY packages/db/package.json ./packages/db/
COPY packages/shared/package.json ./packages/shared/

RUN corepack enable && pnpm install --frozen-lockfile

COPY . .

# Next.js bakes NEXT_PUBLIC_* (and the rewrites() destinations) into the
# build output. Set the API origin at build time, not runtime.
ARG NEXT_PUBLIC_API_BASE_URL
ENV NEXT_PUBLIC_API_BASE_URL=${NEXT_PUBLIC_API_BASE_URL}

RUN pnpm --filter @walty/web build

EXPOSE 3000

RUN chmod +x apps/web/entrypoint.sh

CMD ["./apps/web/entrypoint.sh"]
