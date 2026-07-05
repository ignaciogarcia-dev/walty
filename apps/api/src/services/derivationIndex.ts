import { eq, sql } from "drizzle-orm"
import { db, businessMembers, posDevices } from "@walty/db"

/**
 * Next free HD derivation index for a business. Cashiers (business_members) and
 * POS devices (pos_devices) both derive child wallets ("m/i") from the SAME
 * owner MPC master key, so the index must be unique across BOTH tables — using
 * only one would eventually collide and produce two wallets at the same path.
 */
export async function getNextDerivationIndex(businessId: number): Promise<number> {
  const [members] = await db
    .select({
      maxIndex: sql<number>`COALESCE(MAX(${businessMembers.derivationIndex}), 0)`,
    })
    .from(businessMembers)
    .where(eq(businessMembers.businessId, businessId))

  const [devices] = await db
    .select({
      maxIndex: sql<number>`COALESCE(MAX(${posDevices.derivationIndex}), 0)`,
    })
    .from(posDevices)
    .where(eq(posDevices.businessId, businessId))

  return Math.max(Number(members?.maxIndex ?? 0), Number(devices?.maxIndex ?? 0)) + 1
}
