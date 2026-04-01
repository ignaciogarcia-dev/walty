import { NextRequest } from "next/server"
import { eq } from "drizzle-orm"
import { db } from "@/server/db"
import { businessMembers, users, userProfiles } from "@/server/db/schema"
import { withBusinessAuth, ok } from "@/lib/api"
import { Permission } from "@/lib/permissions"

export const GET = withBusinessAuth(Permission.MEMBER_LIST, async (_req: NextRequest, { business }) => {
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
      walletAddress: businessMembers.walletAddress,
      userEmail: users.email,
      username: userProfiles.username,
    })
    .from(businessMembers)
    .leftJoin(users, eq(businessMembers.userId, users.id))
    .leftJoin(userProfiles, eq(businessMembers.userId, userProfiles.userId))
    .where(eq(businessMembers.businessId, business.businessId))
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
    walletAddress: row.walletAddress ?? null,
    expiresAt: row.expiresAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
    lastActivityAt: row.lastActivityAt?.toISOString() ?? null,
  }))

  return ok({ members })
})
