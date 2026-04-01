/**
 * Rate limiting backed by Postgres (Supabase).
 * Survives process restarts and works across multiple instances if needed.
 *
 * Setup: add rateLimitEntries to server/db/schema.ts and run drizzle-kit push.
 */
import { db } from "@/server/db"
import { rateLimitEntries } from "@/server/db/schema"
import { lt, sql } from "drizzle-orm"

export class RateLimitError extends Error {
  retryAfter?: number

  constructor(retryAfter?: number) {
    super("Too many requests")
    this.name = "RateLimitError"
    this.retryAfter = retryAfter
  }
}

async function rateLimit(key: string, limit: number, windowMs: number) {
  const now = new Date()
  const expiresAt = new Date(now.getTime() + windowMs)

  const [row] = await db
    .insert(rateLimitEntries)
    .values({ key, count: 1, expiresAt })
    .onConflictDoUpdate({
      target: rateLimitEntries.key,
      set: {
        count: sql`CASE
          WHEN ${rateLimitEntries.expiresAt} < NOW() THEN 1
          ELSE ${rateLimitEntries.count} + 1
        END`,
        expiresAt: sql`CASE
          WHEN ${rateLimitEntries.expiresAt} < NOW() THEN ${expiresAt}
          ELSE ${rateLimitEntries.expiresAt}
        END`,
      },
    })
    .returning()

  if (row.count > limit) {
    const retryAfter = Math.ceil((row.expiresAt.getTime() - now.getTime()) / 1000)
    throw new RateLimitError(retryAfter)
  }
}

/** Rate limit by arbitrary string key (e.g. "login:${ip}"). */
export async function rateLimitByIp(key: string, limit: number, windowMs = 60_000) {
  await rateLimit(key, limit, windowMs)
}

/** Rate limit by authenticated user id. */
export async function rateLimitByUser(userId: number, limit = 10, windowMs = 60_000) {
  await rateLimit(`user:${userId}`, limit, windowMs)
}

/**
 * Cleanup expired entries.
 * With Supabase you can automate this via pg_cron:
 *   select cron.schedule('rate-limit-cleanup', '0 * * * *',
 *     'DELETE FROM rate_limit_entries WHERE expires_at < NOW()');
 */
export async function cleanupExpiredEntries() {
  await db.delete(rateLimitEntries).where(lt(rateLimitEntries.expiresAt, new Date()))
}
