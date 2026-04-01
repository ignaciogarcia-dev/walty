import { drizzle } from "drizzle-orm/node-postgres"
import { Pool } from "pg"
import * as schema from "./schema"

const isProduction = process.env.APP_ENV === "production"

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: isProduction ? 20 : 5,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
})

export const db = drizzle(pool, { schema })
