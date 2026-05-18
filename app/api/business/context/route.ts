import { NextRequest } from "next/server"
import { eq } from "drizzle-orm"
import { db } from "@/server/db"
import { addresses, users, businessSettings } from "@/server/db/schema"
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

  const businessSetting = await db.query.businessSettings.findFirst({
    where: eq(businessSettings.userId, business.businessId),
    columns: { name: true },
  })
  const businessUser = await db.query.users.findFirst({
    where: eq(users.id, business.businessId),
    columns: { email: true },
  })

  const businessName = businessSetting?.name ?? businessUser?.email ?? "Business"

  return ok({
    isOwner: business.isOwner,
    role: business.role,
    businessId: business.businessId,
    merchantWalletAddress,
    businessName,
  })
})
