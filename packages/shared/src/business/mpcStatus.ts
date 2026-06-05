import { eq, and } from "drizzle-orm"
import { db, mpcKeys } from "@walty/db"

/**
 * The owner's active MPC key, or null for a legacy mnemonic business. The
 * presence of an active `mpcKeys` row is the single source of truth for "is this
 * an MPC business?" — its `address` is also the owner's receiving address
 * (persistServerKey inserted it into `addresses` during onboarding).
 */
export async function getActiveMpcKey(
  userId: number,
): Promise<{ address: string } | null> {
  const row = await db.query.mpcKeys.findFirst({
    where: and(eq(mpcKeys.userId, userId), eq(mpcKeys.status, "active")),
    columns: { address: true },
  })
  return row ? { address: row.address } : null
}

/** True when the business owner holds an active MPC key (vs a mnemonic). */
export async function isMpcBusiness(userId: number): Promise<boolean> {
  return (await getActiveMpcKey(userId)) !== null
}
