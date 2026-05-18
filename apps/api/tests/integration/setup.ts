/**
 * Integration test bootstrap. Loaded via vitest setupFiles (only for the
 * integration project) and shared across files.
 *
 * Requires a running postgres reachable via INTEGRATION_DATABASE_URL with
 * the Drizzle schema already pushed. The repo's compose.dev.yml + a
 * `walty_test` database does the job locally; the scripts/test-integration
 * helper wires that up.
 */
import { getTableName, is, sql } from "drizzle-orm"
import { PgTable } from "drizzle-orm/pg-core"
import { beforeAll, beforeEach } from "vitest"

const url = process.env.INTEGRATION_DATABASE_URL
if (!url) {
  throw new Error(
    "INTEGRATION_DATABASE_URL is not set — start postgres and rerun via `pnpm test:integration`",
  )
}
process.env.DATABASE_URL = url
process.env.JWT_SECRET = process.env.JWT_SECRET ?? "test-secret"
process.env.NODE_ENV = "test"
process.env.WORKERS_ENABLED = "false"
process.env.LOG_LEVEL = process.env.LOG_LEVEL ?? "silent"

// db is imported lazily so the env vars above are in place before the pool boots.
const dbModule = await import("@walty/db")
const { db } = dbModule

// Tables wiped between tests so each case starts from a clean slate.
// TRUNCATE ... CASCADE handles FK chains; RESTART IDENTITY resets serial PKs.
// Driven off the Drizzle schema export so a future migration that adds a
// table is truncated automatically — no silent leakage across tests.
const TABLES = (Object.values(dbModule) as unknown[])
  .filter((v): v is PgTable => is(v, PgTable))
  .map((t) => `"${getTableName(t)}"`)

beforeAll(async () => {
  // Smoke: make sure the schema looks right.
  await db.execute(sql`SELECT 1`)
})

beforeEach(async () => {
  await db.execute(
    sql.raw(`TRUNCATE TABLE ${TABLES.join(", ")} RESTART IDENTITY CASCADE`),
  )
})
