import { NextRequest, NextResponse } from "next/server"
import { eq } from "drizzle-orm"
import { requireAuth } from "@/lib/auth"
import { db } from "@/server/db"
import { addresses, users, userProfiles } from "@/server/db/schema"
import { getBusinessContext } from "@/lib/business/getBusinessContext"

export async function GET(req: NextRequest) {
  try {
    const auth = requireAuth(req)
    const ctx = await getBusinessContext(auth.userId)

    if (!ctx) {
      return NextResponse.json({ error: "no business context" }, { status: 404 })
    }

    // Get the merchant wallet address (first linked address of the business account)
    const [linkedAddress] = await db
      .select({ address: addresses.address })
      .from(addresses)
      .where(eq(addresses.userId, ctx.businessId))
      .limit(1)

    // Get business display name
    const businessProfile = await db.query.userProfiles.findFirst({
      where: eq(userProfiles.userId, ctx.businessId),
      columns: { username: true },
    })
    const business = await db.query.users.findFirst({
      where: eq(users.id, ctx.businessId),
      columns: { email: true },
    })

    const businessName = businessProfile?.username ?? business?.email ?? "Business"

    return NextResponse.json({
      isOwner: ctx.isOwner,
      role: ctx.role,
      businessId: ctx.businessId,
      merchantWalletAddress: linkedAddress?.address ?? null,
      businessName,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "unexpected error"
    if (message === "Unauthorized") {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 })
    }
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
