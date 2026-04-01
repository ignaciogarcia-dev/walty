import { NextRequest } from "next/server"
import { eq } from "drizzle-orm"
import { db } from "@/server/db"
import { addresses, users, userProfiles } from "@/server/db/schema"
import { withBusinessAuth, ok } from "@/lib/api"
import { Permission } from "@/lib/permissions"

export const GET = withBusinessAuth(Permission.BUSINESS_CONTEXT_READ, async (_req: NextRequest, { business }) => {
  let merchantWalletAddress: string | null = null

  if (business.isOwner) {
    const [linkedAddress] = await db
      .select({ address: addresses.address })
      .from(addresses)
      .where(eq(addresses.userId, business.businessId))
      .limit(1)
    merchantWalletAddress = linkedAddress?.address ?? null
  } else {
    merchantWalletAddress = business.walletAddress ?? null
  }

  const businessProfile = await db.query.userProfiles.findFirst({
    where: eq(userProfiles.userId, business.businessId),
    columns: { username: true },
  })
  const businessUser = await db.query.users.findFirst({
    where: eq(users.id, business.businessId),
    columns: { email: true },
  })

  const businessName = businessProfile?.username ?? businessUser?.email ?? "Business"

  return ok({
    isOwner: business.isOwner,
    role: business.role,
    businessId: business.businessId,
    merchantWalletAddress,
    businessName,
  })
})
