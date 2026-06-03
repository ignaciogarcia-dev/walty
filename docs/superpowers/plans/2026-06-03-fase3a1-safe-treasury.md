# Fase 3 · Plan (a1) — Safe Treasury Deployment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deploy a 1-of-1 Safe (Gnosis Safe) treasury per business on Polygon, persist its address, and surface it as the business's receiving address — with a test EOA as the Safe owner (MPC owner-key swap comes in a later stratum).

**Architecture:** A server-side `treasury` service uses `@safe-global/protocol-kit` (v5) to predict (CREATE2) and deploy a Safe whose single owner is the business owner's existing wallet address. A configured deployer EOA pays gas. The Safe address is stored in a new `business_treasuries` table and returned by an authenticated Express route; the web onboarding hook deploys + displays it. Testnet (Amoy, chainId 80002) support is added so every stratum can be verified on-chain.

**Tech Stack:** TypeScript, Express 4 (tsx ESM), Drizzle ORM + Postgres, viem ^2.47.6, `@safe-global/protocol-kit` v5, Vitest + supertest, Next.js 16 (web).

**Scope note:** This is plan (a1) of Fase 3. Zodiac Roles permission scoping is plan (a2). MPC signing is plan (b)/(c). This plan stands alone: it produces a deployable, testable Safe-treasury feature with a test EOA owner.

---

## File Structure

**New:**
- `apps/api/src/services/treasury.ts` — predict/deploy Safe, persist, read. One responsibility: treasury lifecycle.
- `apps/api/src/routes/treasury.ts` — `POST /treasury/deploy`, `GET /treasury`.
- `apps/api/src/lib/safe.ts` — thin Protocol Kit wrapper (init, predict, deploy). Isolates the SDK so tests can mock one module.
- `apps/api/tests/integration/treasury.test.ts` — integration tests (mocked Safe SDK).
- `apps/api/scripts/amoy-safe-smoke.ts` — manual live Amoy smoke test (not in CI).
- `packages/db/drizzle/0005_business_treasuries.sql` — generated migration.

**Modified:**
- `packages/db/src/schema.ts` — add `businessTreasuries` table.
- `packages/shared/src/rpc/viemChains.ts` — add Amoy (80002).
- `packages/shared/src/rpc/getAlchemyUrls.ts` / `getAnkrUrls.ts` / `getPublicUrls.ts` — Amoy RPC slugs (confirm exact filenames at Task 2).
- `apps/api/src/config/env.ts` — `safeDeployerPrivateKey`, `safeChainId`.
- `apps/api/src/app.ts` — register `treasuryRouter`.
- `apps/web/hooks/useWalletLifecycle.ts` — call deploy after `linkWallet`.

---

## Task 1: Add Amoy testnet to the chain registry

**Files:**
- Modify: `packages/shared/src/rpc/viemChains.ts`
- Test: `packages/shared/src/rpc/viemChains.test.ts` (create if absent)

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, expect, it } from "vitest"
import { getViemChain } from "./viemChains.js"

describe("getViemChain", () => {
  it("resolves Polygon Amoy testnet (80002)", () => {
    const chain = getViemChain(80002)
    expect(chain.id).toBe(80002)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm -F @walty/shared exec vitest run src/rpc/viemChains.test.ts`
Expected: FAIL — 80002 not in `VIEM_CHAINS` (throws or returns undefined).

- [ ] **Step 3: Add Amoy to the chains map**

In `packages/shared/src/rpc/viemChains.ts`, import and register Amoy:

```typescript
import { mainnet, arbitrum, base, optimism, polygon, polygonAmoy } from "viem/chains"

export const VIEM_CHAINS: Record<number, Chain> = {
  1: mainnet,
  42161: arbitrum,
  8453: base,
  10: optimism,
  137: polygon,
  80002: polygonAmoy,
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm -F @walty/shared exec vitest run src/rpc/viemChains.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/rpc/viemChains.ts packages/shared/src/rpc/viemChains.test.ts
git commit -m "Add Polygon Amoy testnet to the chain registry"
```

---

## Task 2: Wire Amoy RPC URLs

**Files:**
- Modify: `packages/shared/src/rpc/getAlchemyUrls.ts`, `getAnkrUrls.ts`, `getPublicUrls.ts` (confirm exact paths via `getPublicClient.ts` imports)
- Test: `packages/shared/src/rpc/rpcUrls.test.ts`

- [ ] **Step 1: Read the current URL builders**

Run: `sed -n '1,80p' packages/shared/src/rpc/getPublicClient.ts` and open the three `get*Urls` modules it imports. Note the chainId→slug maps.

- [ ] **Step 2: Write the failing test**

```typescript
import { describe, expect, it } from "vitest"
import { getPublicUrls } from "./getPublicUrls.js"

describe("getPublicUrls", () => {
  it("returns at least one URL for Amoy (80002)", () => {
    expect(getPublicUrls(80002).length).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm -F @walty/shared exec vitest run src/rpc/rpcUrls.test.ts`
Expected: FAIL — no Amoy entry.

- [ ] **Step 4: Add the Amoy slugs**

Add `80002` to each slug map. Public fallback uses `https://rpc-amoy.polygon.technology`. Alchemy slug: `polygon-amoy`. Ankr slug: `polygon_amoy`. Mirror the exact shape each map already uses (do not change the function signatures).

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm -F @walty/shared exec vitest run src/rpc/rpcUrls.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src/rpc/
git commit -m "Add Amoy RPC URLs for Alchemy, Ankr, and public fallback"
```

---

## Task 3: Add the `business_treasuries` table

**Files:**
- Modify: `packages/db/src/schema.ts`
- Create (generated): `packages/db/drizzle/0005_business_treasuries.sql`

- [ ] **Step 1: Add the table to the schema**

Append to `packages/db/src/schema.ts` (mirror the `deviceSessions` style):

```typescript
export const businessTreasuries = pgTable("business_treasuries", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  chainId: integer("chain_id").notNull(),
  safeAddress: text("safe_address").notNull(),
  status: text("status").notNull().default("pending"), // pending | deployed
  deployTxHash: text("deploy_tx_hash"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => ({
  byUser: uniqueIndex("business_treasuries_user_chain_idx").on(t.userId, t.chainId),
}))
```

Ensure `uniqueIndex` is in the drizzle-orm import at the top of the file.

- [ ] **Step 2: Generate the migration**

Run: `DATABASE_URL=postgresql://wallet:wallet@localhost:5432/wallet pnpm -F @walty/db exec drizzle-kit generate`
Expected: a new `drizzle/0005_*.sql` with `CREATE TABLE "business_treasuries"`. Rename it `0005_business_treasuries.sql` if drizzle used a random suffix.

- [ ] **Step 3: Apply and verify**

Run: `DATABASE_URL=postgresql://wallet:wallet@localhost:5432/wallet pnpm -F @walty/db exec drizzle-kit push`
Expected: table created. Verify: `psql "$DATABASE_URL" -c '\d business_treasuries'`.

- [ ] **Step 4: Commit**

```bash
git add packages/db/src/schema.ts packages/db/drizzle/
git commit -m "Add business_treasuries table"
```

---

## Task 4: Add Safe deployer env config

**Files:**
- Modify: `apps/api/src/config/env.ts`
- Modify: `.env.example`

- [ ] **Step 1: Add the vars**

In `apps/api/src/config/env.ts`, extend the `env` object:

```typescript
export const env = {
  // ...existing...
  safeChainId: Number(process.env.SAFE_CHAIN_ID ?? 80002),
  safeDeployerPrivateKey: process.env.SAFE_DEPLOYER_PRIVATE_KEY ?? "",
}
```

- [ ] **Step 2: Document in `.env.example`**

Add:
```
# Server EOA that pays gas to deploy business Safes (Amoy for now). 0x-prefixed.
SAFE_DEPLOYER_PRIVATE_KEY=
# Chain to deploy treasuries on. 80002 = Polygon Amoy (testnet), 137 = Polygon mainnet.
SAFE_CHAIN_ID=80002
```

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/config/env.ts .env.example
git commit -m "Add Safe deployer env config"
```

---

## Task 5: Install the Safe Protocol Kit

**Files:**
- Modify: `apps/api/package.json`

- [ ] **Step 1: Add the dependency**

Run: `pnpm -F @walty/api add @safe-global/protocol-kit`
Expected: v5.x added to `apps/api/package.json`.

- [ ] **Step 2: Verify it imports under tsx ESM**

Run: `pnpm -F @walty/api exec node --import tsx/esm -e "import('@safe-global/protocol-kit').then(m => console.log(typeof m.default))"`
Expected: prints `function` (the `Safe` class).

- [ ] **Step 3: Commit**

```bash
git add apps/api/package.json pnpm-lock.yaml
git commit -m "Add @safe-global/protocol-kit to the API"
```

---

## Task 6: Safe SDK wrapper (`lib/safe.ts`)

**Files:**
- Create: `apps/api/src/lib/safe.ts`
- Test: `apps/api/tests/safe.test.ts` (unit, mocked SDK)

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, expect, it, vi } from "vitest"

vi.mock("@safe-global/protocol-kit", () => ({
  default: {
    init: vi.fn(async () => ({
      getAddress: vi.fn(async () => "0xSafe"),
      createSafeDeploymentTransaction: vi.fn(async () => ({
        to: "0xFactory", value: "0", data: "0xdead",
      })),
      getSafeProvider: vi.fn(() => ({
        getExternalSigner: vi.fn(async () => ({
          sendTransaction: vi.fn(async () => "0xhash"),
          waitForTransactionReceipt: vi.fn(async () => ({ status: "success" })),
        })),
      })),
      connect: vi.fn(async function (this: unknown) { return this }),
      isSafeDeployed: vi.fn(async () => true),
    })),
  },
}))

import { predictSafeAddress, deploySafe } from "../src/lib/safe.js"

describe("safe wrapper", () => {
  it("predicts a Safe address for an owner without deploying", async () => {
    const addr = await predictSafeAddress({
      ownerAddress: "0xOwner", chainId: 80002, saltNonce: "1",
    })
    expect(addr).toBe("0xSafe")
  })

  it("deploys and returns address + tx hash", async () => {
    const res = await deploySafe({
      ownerAddress: "0xOwner", chainId: 80002, saltNonce: "1",
      deployerPrivateKey: "0xabc",
    })
    expect(res).toEqual({ safeAddress: "0xSafe", txHash: "0xhash" })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm -F @walty/api exec vitest run tests/safe.test.ts`
Expected: FAIL — `../src/lib/safe.js` does not exist.

- [ ] **Step 3: Implement the wrapper**

Create `apps/api/src/lib/safe.ts`. Owner = the business owner's address; threshold 1 (1-of-1). Salt = deterministic per business so the address is predictable before deploy.

```typescript
import Safe, { type PredictedSafeProps } from "@safe-global/protocol-kit"
import { getRpcUrl } from "@walty/shared/rpc" // first RPC url for the chain; see note

interface PredictArgs {
  ownerAddress: string
  chainId: number
  saltNonce: string
}

interface DeployArgs extends PredictArgs {
  deployerPrivateKey: string
}

function predictedSafe(ownerAddress: string, saltNonce: string): PredictedSafeProps {
  return {
    safeAccountConfig: { owners: [ownerAddress], threshold: 1 },
    safeDeploymentConfig: { saltNonce, safeVersion: "1.4.1" },
  }
}

export async function predictSafeAddress(args: PredictArgs): Promise<string> {
  const protocolKit = await Safe.init({
    provider: getRpcUrl(args.chainId),
    predictedSafe: predictedSafe(args.ownerAddress, args.saltNonce),
  })
  return protocolKit.getAddress()
}

export async function deploySafe(
  args: DeployArgs,
): Promise<{ safeAddress: string; txHash: string }> {
  let protocolKit = await Safe.init({
    provider: getRpcUrl(args.chainId),
    signer: args.deployerPrivateKey,
    predictedSafe: predictedSafe(args.ownerAddress, args.saltNonce),
  })
  const safeAddress = await protocolKit.getAddress()
  const deploymentTransaction = await protocolKit.createSafeDeploymentTransaction()
  const client = await protocolKit.getSafeProvider().getExternalSigner()
  const txHash = await client.sendTransaction({
    to: deploymentTransaction.to,
    value: BigInt(deploymentTransaction.value),
    data: deploymentTransaction.data as `0x${string}`,
    chain: undefined, // provider already bound to the chain
  })
  await client.waitForTransactionReceipt({ hash: txHash })
  return { safeAddress, txHash }
}
```

Note: add a tiny `getRpcUrl(chainId)` helper to `packages/shared/src/rpc` that returns the first URL from the existing `get*Urls` fallback list (reuse, do not duplicate). If a public-only URL is preferred for the deployer, return `getPublicUrls(chainId)[0]`.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm -F @walty/api exec vitest run tests/safe.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/lib/safe.ts apps/api/tests/safe.test.ts packages/shared/src/rpc/
git commit -m "Add Safe Protocol Kit wrapper for predict and deploy"
```

---

## Task 7: Treasury service

**Files:**
- Create: `apps/api/src/services/treasury.ts`
- Test: covered by the integration test in Task 9 (service is exercised through the route)

- [ ] **Step 1: Implement the service**

Mirror `services/deviceSessions.ts` (typed Drizzle functions, bare returns):

```typescript
import { db, businessTreasuries } from "@walty/db"
import { and, eq } from "drizzle-orm"
import { deploySafe, predictSafeAddress } from "../lib/safe.js"
import { env } from "../config/env.js"

export type BusinessTreasury = typeof businessTreasuries.$inferSelect

export async function getTreasury(
  userId: number,
  chainId = env.safeChainId,
): Promise<BusinessTreasury | null> {
  const row = await db.query.businessTreasuries.findFirst({
    where: and(
      eq(businessTreasuries.userId, userId),
      eq(businessTreasuries.chainId, chainId),
    ),
  })
  return row ?? null
}

export async function ensureTreasury(
  userId: number,
  ownerAddress: string,
): Promise<BusinessTreasury> {
  const existing = await getTreasury(userId)
  if (existing) return existing

  const chainId = env.safeChainId
  const saltNonce = `walty-${userId}`
  const safeAddress = await predictSafeAddress({ ownerAddress, chainId, saltNonce })

  const [row] = await db
    .insert(businessTreasuries)
    .values({ userId, chainId, safeAddress, status: "pending" })
    .returning()

  const { txHash } = await deploySafe({
    ownerAddress, chainId, saltNonce,
    deployerPrivateKey: env.safeDeployerPrivateKey,
  })

  const [updated] = await db
    .update(businessTreasuries)
    .set({ status: "deployed", deployTxHash: txHash })
    .where(eq(businessTreasuries.id, row.id))
    .returning()
  return updated
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm -F @walty/api exec tsc --noEmit`
Expected: no errors (confirm `businessTreasuries` is exported from `@walty/db`'s index barrel; add the export if needed).

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/services/treasury.ts packages/db/src/index.ts
git commit -m "Add treasury service: ensure/get business Safe"
```

---

## Task 8: Treasury route

**Files:**
- Create: `apps/api/src/routes/treasury.ts`
- Modify: `apps/api/src/app.ts`

- [ ] **Step 1: Implement the route**

Mirror `routes/devices.ts` (`withAuth` + `authed`, bare JSON):

```typescript
import { Router } from "express"
import { withAuth } from "../middleware/withAuth.js"
import { authed } from "../middleware/typedHandlers.js"
import { ValidationError } from "../lib/errors.js" // confirm path from errorHandler
import { ensureTreasury, getTreasury } from "../services/treasury.js"

export const treasuryRouter: Router = Router()

treasuryRouter.get(
  "/treasury",
  withAuth,
  authed(async (req, res) => {
    const t = await getTreasury(req.auth.userId)
    res.json({ treasury: t })
  }),
)

treasuryRouter.post(
  "/treasury/deploy",
  withAuth,
  authed(async (req, res) => {
    const ownerAddress = req.body?.ownerAddress
    if (typeof ownerAddress !== "string" || !/^0x[0-9a-fA-F]{40}$/.test(ownerAddress)) {
      throw new ValidationError("invalid-owner-address")
    }
    const t = await ensureTreasury(req.auth.userId, ownerAddress)
    res.json({ treasury: t })
  }),
)
```

- [ ] **Step 2: Register the router**

In `apps/api/src/app.ts`, add `app.use(treasuryRouter)` alongside the existing routers (before `errorHandler`). Import at top.

- [ ] **Step 3: Typecheck**

Run: `pnpm -F @walty/api exec tsc --noEmit`
Expected: no errors. (If `ValidationError` lives elsewhere, fix the import to match `middleware/errorHandler.ts`.)

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/routes/treasury.ts apps/api/src/app.ts
git commit -m "Add treasury route: GET /treasury and POST /treasury/deploy"
```

---

## Task 9: Integration test (mocked Safe SDK)

**Files:**
- Create: `apps/api/tests/integration/treasury.test.ts`

- [ ] **Step 1: Write the failing test**

Mirror `tests/integration/devices.test.ts` (register → link → authed call). Mock the Safe wrapper module so no chain is touched.

```typescript
import request from "supertest"
import { describe, expect, it, beforeEach, vi } from "vitest"
import { createApp } from "../../src/app.js"
import { db } from "@walty/db"

vi.mock("../../src/lib/safe.js", () => ({
  predictSafeAddress: vi.fn(async () => "0x000000000000000000000000000000000000dEaD"),
  deploySafe: vi.fn(async () => ({
    safeAddress: "0x000000000000000000000000000000000000dEaD",
    txHash: "0xdeploy",
  })),
}))

const OWNER = "0x1111111111111111111111111111111111111111"

// Reuse the helper from devices.test.ts that registers a user and returns an
// authenticated supertest agent (copy it or import if it is shared).
async function registeredAgent() {
  const app = createApp()
  const agent = request.agent(app)
  await agent.post("/auth/register").send({ email: "t@walty.io", password: "Passw0rd!" })
  return { app, agent }
}

describe("treasury", () => {
  beforeEach(async () => {
    await db.execute(
      "TRUNCATE TABLE users, business_treasuries RESTART IDENTITY CASCADE" as never,
    )
  })

  it("returns null treasury before deploy", async () => {
    const { agent } = await registeredAgent()
    const res = await agent.get("/treasury")
    expect(res.status).toBe(200)
    expect(res.body.treasury).toBeNull()
  })

  it("deploys a Safe and persists it", async () => {
    const { agent } = await registeredAgent()
    const res = await agent.post("/treasury/deploy").send({ ownerAddress: OWNER })
    expect(res.status).toBe(200)
    expect(res.body.treasury.safeAddress).toBe("0x000000000000000000000000000000000000dEaD")
    expect(res.body.treasury.status).toBe("deployed")

    const again = await agent.get("/treasury")
    expect(again.body.treasury.deployTxHash).toBe("0xdeploy")
  })

  it("rejects an invalid owner address", async () => {
    const { agent } = await registeredAgent()
    const res = await agent.post("/treasury/deploy").send({ ownerAddress: "nope" })
    expect(res.status).toBe(400)
  })

  it("is idempotent: second deploy returns the same Safe", async () => {
    const { agent } = await registeredAgent()
    const first = await agent.post("/treasury/deploy").send({ ownerAddress: OWNER })
    const second = await agent.post("/treasury/deploy").send({ ownerAddress: OWNER })
    expect(second.body.treasury.id).toBe(first.body.treasury.id)
  })
})
```

Adjust the register/auth helper and the TRUNCATE table list to match `devices.test.ts` exactly (it already truncates all tables — reuse that statement).

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm -F @walty/api test:integration -- treasury`
Expected: FAIL initially if anything is misnamed; otherwise the deploy/idempotency assertions guide fixes.

- [ ] **Step 3: Fix until green**

Run: `pnpm -F @walty/api test:integration -- treasury`
Expected: PASS (4 tests).

- [ ] **Step 4: Commit**

```bash
git add apps/api/tests/integration/treasury.test.ts
git commit -m "Add treasury integration tests"
```

---

## Task 10: Web — deploy + display the Safe on onboarding

**Files:**
- Modify: `apps/web/hooks/useWalletLifecycle.ts`
- Test: `apps/web/hooks/useWalletLifecycle.test.tsx` (extend if present; else add a focused test)

- [ ] **Step 1: Write/extend the failing test**

Assert that after `create(pin)`, a `POST /api/treasury/deploy` is issued with the wallet address. Use the existing fetch-mock pattern from neighboring hook tests (e.g. `usePairing.test.tsx`).

```typescript
it("deploys a treasury Safe after linking the wallet", async () => {
  const calls: string[] = []
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    calls.push(url)
    if (url.endsWith("/api/wallet/nonce")) return jsonRes({ nonce: "n" })
    if (url.endsWith("/api/treasury/deploy"))
      return jsonRes({ treasury: { safeAddress: "0xSafe", status: "deployed" } })
    return jsonRes({})
  }))
  // ...render hook, call create("123456")...
  expect(calls).toContain("/api/treasury/deploy")
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm -F @walty/web test:run -- useWalletLifecycle`
Expected: FAIL — no treasury call yet.

- [ ] **Step 3: Call deploy after linkWallet**

In `useWalletLifecycle.ts` `create()`, after `await linkWallet(addr, walletClient)`:

```typescript
await fetch("/api/treasury/deploy", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ ownerAddress: addr }),
})
```

(Keep it best-effort / await; surface failures via existing error state. Do not block seed save on it if the team prefers — confirm desired UX with the existing onboarding error handling.)

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm -F @walty/web test:run -- useWalletLifecycle`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/hooks/useWalletLifecycle.ts apps/web/hooks/useWalletLifecycle.test.tsx
git commit -m "Deploy a treasury Safe during wallet onboarding"
```

---

## Task 11: Live Amoy smoke test (manual, not CI)

**Files:**
- Create: `apps/api/scripts/amoy-safe-smoke.ts`

- [ ] **Step 1: Write the script**

```typescript
import { predictSafeAddress, deploySafe } from "../src/lib/safe.js"

const owner = process.env.SMOKE_OWNER as string
const deployer = process.env.SAFE_DEPLOYER_PRIVATE_KEY as string

const predicted = await predictSafeAddress({ ownerAddress: owner, chainId: 80002, saltNonce: "smoke-1" })
console.log("predicted:", predicted)
const res = await deploySafe({ ownerAddress: owner, chainId: 80002, saltNonce: "smoke-1", deployerPrivateKey: deployer })
console.log("deployed:", res)
if (res.safeAddress.toLowerCase() !== predicted.toLowerCase())
  throw new Error("predicted address != deployed address")
console.log("OK: predicted == deployed")
```

- [ ] **Step 2: Run against Amoy**

Fund the deployer EOA with Amoy MATIC (faucet) first. Then:
Run: `SMOKE_OWNER=0x... SAFE_DEPLOYER_PRIVATE_KEY=0x... pnpm -F @walty/api exec node --import tsx/esm scripts/amoy-safe-smoke.ts`
Expected: prints a predicted address, a deployed address, and `OK: predicted == deployed`. Verify the Safe on https://amoy.polygonscan.com.

- [ ] **Step 3: Commit**

```bash
git add apps/api/scripts/amoy-safe-smoke.ts
git commit -m "Add manual Amoy Safe deployment smoke test"
```

---

## Final verification

- [ ] `pnpm -F @walty/shared exec vitest run` — chain/RPC tests green.
- [ ] `pnpm -F @walty/api exec tsc --noEmit` — API typechecks.
- [ ] `pnpm -F @walty/api test:run` — API unit tests green (incl. `safe.test.ts`).
- [ ] `pnpm -F @walty/api test:integration` — `treasury.test.ts` green.
- [ ] `pnpm -F @walty/web test:run` — web hook test green.
- [ ] `pnpm lint` — clean.
- [ ] Manual: `amoy-safe-smoke.ts` deploys a real Safe on Amoy; predicted == deployed; visible on polygonscan.

## Self-review notes (gaps to confirm during execution)

- **`getRpcUrl` helper (Task 6):** confirm the exact names of the `get*Urls` modules by reading `getPublicClient.ts` imports before adding the helper; reuse, don't duplicate.
- **`ValidationError` import path (Task 8):** confirm against `middleware/errorHandler.ts`.
- **Register/auth helper + TRUNCATE list (Task 9):** copy verbatim from `devices.test.ts` rather than the sketch above.
- **`@walty/db` barrel export (Task 7):** ensure `businessTreasuries` is re-exported from the package index.
- **Out of scope here (next plans):** Zodiac Roles scoping (a2), MPC owner key (b/c), funding the Safe with gas (track separately), swapping owner from test EOA → MPC.
