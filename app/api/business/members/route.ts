import { NextRequest, NextResponse } from "next/server"
import { eq } from "drizzle-orm"
import { requireAuth } from "@/lib/auth"
import { db } from "@/server/db"
import { businessMembers, users, userProfiles } from "@/server/db/schema"
import { getBusinessContext } from "@/lib/business/getBusinessContext"

export async function GET(req: NextRequest) {
  try {
    const auth = requireAuth(req)
    const ctx = await getBusinessContext(auth.userId)

    if (!ctx?.isOwner) {
      return NextResponse.json({ error: "only business owners can list members" }, { status: 403 })
    }

    const rows = await db
      .select({
        id: businessMembers.id,
        role: businessMembers.role,
        status: businessMembers.status,
        inviteEmail: businessMembers.inviteEmail,
        inviteToken: businessMembers.inviteToken,
        userId: businessMembers.userId,
        expiresAt: businessMembers.expiresAt,
        createdAt: businessMembers.createdAt,
        lastActivityAt: businessMembers.lastActivityAt,
        userEmail: users.email,
        username: userProfiles.username,
      })
      .from(businessMembers)
      .leftJoin(users, eq(businessMembers.userId, users.id))
      .leftJoin(userProfiles, eq(businessMembers.userId, userProfiles.userId))
      .where(eq(businessMembers.businessId, ctx.businessId))
      .orderBy(businessMembers.createdAt)

    const members = rows.map((row) => ({
      id: row.id,
      role: row.role,
      status: row.status,
      inviteEmail: row.inviteEmail,
      inviteToken: row.inviteToken,
      userId: row.userId,
      email: row.userEmail ?? null,
      username: row.username ?? null,
      expiresAt: row.expiresAt.toISOString(),
      createdAt: row.createdAt.toISOString(),
      lastActivityAt: row.lastActivityAt?.toISOString() ?? null,
    }))

    return NextResponse.json({ members })
  } catch (error) {
    const message = error instanceof Error ? error.message : "unexpected error"
    if (message === "Unauthorized") {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 })
    }
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
