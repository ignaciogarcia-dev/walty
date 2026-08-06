FROM node:26-alpine

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY tsconfig.base.json ./
COPY apps/web/package.json ./apps/web/
COPY packages/db/package.json ./packages/db/
COPY packages/shared/package.json ./packages/shared/

RUN corepack enable && pnpm install --frozen-lockfile

COPY . .

# Next.js bakes NEXT_PUBLIC_* (browser bundle) and the rewrites() destinations
# (routes-manifest) into the build output, so both API URLs must be set at build
# time. NEXT_PUBLIC_API_BASE_URL = browser-facing origin (WebSocket);
# API_INTERNAL_URL = server-side rewrite target (in-cluster). The ENVs also
# persist to runtime, so it works whether the rewrite is baked or re-read.
ARG NEXT_PUBLIC_API_BASE_URL
ENV NEXT_PUBLIC_API_BASE_URL=${NEXT_PUBLIC_API_BASE_URL}
ARG API_INTERNAL_URL
ENV API_INTERNAL_URL=${API_INTERNAL_URL}

RUN pnpm --filter @walty/web build

EXPOSE 3000

RUN chmod +x apps/web/entrypoint.sh

CMD ["./apps/web/entrypoint.sh"]
