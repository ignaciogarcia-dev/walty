import { eq, and } from "drizzle-orm"
import { db } from "@/server/db"
import { users, businessMembers } from "@/server/db/schema"

export type BusinessRole = "owner" | "cashier"

export type BusinessContext = {
  businessId: number
  role: BusinessRole
  isOwner: boolean
  memberId?: number
  walletAddress?: string | null // operator's HD-derived wallet; null for owner
}

export async function getBusinessContext(userId: number, businessId?: number): Promise<BusinessContext | null> {
  // Single query: left join resolves owner vs cashier in one roundtrip.
  // Owner: userType === "business", no membership row needed.
  // Cashier: userType !== "business", membership row required.
  const memberJoinCondition = businessId != null
    ? and(
        eq(businessMembers.userId, userId),
        eq(businessMembers.status, "active"),
        eq(businessMembers.businessId, businessId),
      )
    : and(
        eq(businessMembers.userId, userId),
        eq(businessMembers.status, "active"),
      )

  const [row] = await db
    .select({
      userType: users.userType,
      memberId: businessMembers.id,
      memberBusinessId: businessMembers.businessId,
      memberRole: businessMembers.role,
      memberWallet: businessMembers.walletAddress,
    })
    .from(users)
    .leftJoin(businessMembers, memberJoinCondition)
    .where(eq(users.id, userId))
    .limit(1)

  if (!row) return null

  if (row.userType === "business") {
    // Owner: businessId is the user's own id
    if (businessId != null && userId !== businessId) return null
    return { businessId: userId, role: "owner", isOwner: true, walletAddress: null }
  }

  // Cashier: must have an active membership row
  if (!row.memberId || !row.memberBusinessId) return null

  return {
    businessId: row.memberBusinessId,
    role: row.memberRole as BusinessRole,
    isOwner: false,
    memberId: row.memberId,
    walletAddress: row.memberWallet ?? null,
  }
}
