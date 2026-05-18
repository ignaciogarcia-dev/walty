import { eq, and } from "drizzle-orm"
import { db, businessMembers, businessSettings } from "@walty/db"
import type { BusinessContext, BusinessRole } from "@walty/shared/business/types"

export type { BusinessContext, BusinessRole } from "@walty/shared/business/types"

/**
 * Resolves business context for a user.
 *
 * Owner: no active business_members row for this user. The user is owner of the
 * business whose id equals their own user id (1:1). Requires business_settings
 * row to be considered an active business.
 *
 * Cashier: has an active business_members row pointing to another business.
 */
export async function getBusinessContext(
  userId: number,
  businessId?: number,
): Promise<BusinessContext | null> {
  const memberWhere = businessId != null
    ? and(
        eq(businessMembers.userId, userId),
        eq(businessMembers.status, "active"),
        eq(businessMembers.businessId, businessId),
      )
    : and(
        eq(businessMembers.userId, userId),
        eq(businessMembers.status, "active"),
      )

  const [member] = await db
    .select({
      id: businessMembers.id,
      businessId: businessMembers.businessId,
      role: businessMembers.role,
      walletAddress: businessMembers.walletAddress,
    })
    .from(businessMembers)
    .where(memberWhere)
    .limit(1)

  if (member) {
    return {
      businessId: member.businessId,
      role: member.role as BusinessRole,
      isOwner: false,
      memberId: member.id,
      walletAddress: member.walletAddress ?? null,
    }
  }

  if (businessId != null && businessId !== userId) return null

  const [settings] = await db
    .select({ userId: businessSettings.userId })
    .from(businessSettings)
    .where(eq(businessSettings.userId, userId))
    .limit(1)

  if (!settings) return null

  return { businessId: userId, role: "owner", isOwner: true, walletAddress: null }
}
