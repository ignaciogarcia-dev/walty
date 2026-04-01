import { eq, sql } from "drizzle-orm"
import { db } from "@/server/db"
import { businessMembers } from "@/server/db/schema"
import { withBusinessAuth, ok } from "@/lib/api"
import { Permission } from "@/lib/permissions"

export const GET = withBusinessAuth(Permission.MEMBER_INVITE, async (_req, { business }) => {
  const [result] = await db
    .select({
      maxIndex: sql<number>`COALESCE(MAX(${businessMembers.derivationIndex}), 0)`,
    })
    .from(businessMembers)
    .where(eq(businessMembers.businessId, business.businessId))

  // Index 0 is reserved for the owner's primary wallet (m/44'/60'/0'/0/0)
  // Operators start at index 1
  const nextIndex = (result?.maxIndex ?? 0) + 1

  return ok({ nextIndex })
})
