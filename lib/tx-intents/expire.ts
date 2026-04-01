import { eq } from "drizzle-orm"
import { db } from "@/server/db"
import { txIntents } from "@/server/db/schema"
import { ValidationError } from "@/lib/api"

/** Returns true if the intent is expired. If so, marks it as expired in the DB. */
export async function expireIfStale(intent: { id: string; expiresAt: Date | string }): Promise<boolean> {
  const expiresAt = intent.expiresAt instanceof Date ? intent.expiresAt : new Date(intent.expiresAt)
  if (expiresAt >= new Date()) return false
  await db.update(txIntents).set({ status: "expired" }).where(eq(txIntents.id, intent.id))
  return true
}

/** Throws ValidationError if the intent has expired. Marks it expired in DB first. */
export async function assertNotExpired(intent: { id: string; expiresAt: Date | string }): Promise<void> {
  if (await expireIfStale(intent)) {
    throw new ValidationError("Intent expired")
  }
}
