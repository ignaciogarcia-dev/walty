import { eq, and } from "drizzle-orm"
import { db } from "@/server/db"
import { users, businessMembers } from "@/server/db/schema"

export type BusinessRole = "owner" | "manager" | "cashier" | "waiter"

export type BusinessContext = {
  businessId: number
  role: BusinessRole
  isOwner: boolean
  memberId?: number
}

export async function getBusinessContext(userId: number): Promise<BusinessContext | null> {
  const user = await db.query.users.findFirst({
    where: eq(users.id, userId),
    columns: { userType: true },
  })

  if (!user) return null

  if (user.userType === "business") {
    return { businessId: userId, role: "owner", isOwner: true }
  }

  const member = await db.query.businessMembers.findFirst({
    where: and(
      eq(businessMembers.userId, userId),
      eq(businessMembers.status, "active")
    ),
    columns: { id: true, businessId: true, role: true },
  })

  if (!member) return null

  return {
    businessId: member.businessId,
    role: member.role as BusinessRole,
    isOwner: false,
    memberId: member.id,
  }
}
