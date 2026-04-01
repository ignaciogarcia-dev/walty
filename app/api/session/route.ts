import { NextRequest } from "next/server"
import { eq } from "drizzle-orm"
import { db } from "@/server/db"
import { users, businessMembers, walletBackups, userProfiles } from "@/server/db/schema"
import { withErrorHandling, withAuth, ok, NotFoundError } from "@/lib/api"

export type BusinessStatus = "active" | "suspended" | "revoked" | null

export const GET = withErrorHandling(withAuth(async (_req: NextRequest, { auth }) => {
  const [user, profile, memberships, walletBackup] = await Promise.all([
    db.query.users.findFirst({
      where: eq(users.id, auth.userId),
      columns: { id: true, email: true, userType: true },
    }),
    db.query.userProfiles.findFirst({
      where: eq(userProfiles.userId, auth.userId),
      columns: { displayName: true, username: true },
    }),
    db.query.businessMembers.findMany({
      where: eq(businessMembers.userId, auth.userId),
      columns: { status: true },
    }),
    db.query.walletBackups.findFirst({
      where: eq(walletBackups.userId, auth.userId),
      columns: { userId: true },
    }),
  ])

  if (!user) throw new NotFoundError("user not found")

  const active = memberships.find((m) => m.status === "active")
  const suspended = memberships.find((m) => m.status === "suspended")
  const revoked = memberships.find((m) => m.status === "revoked")
  const isOwner = user.userType === "business"
  const hasActiveBusiness = isOwner || !!active
  const businessStatus: BusinessStatus = isOwner
    ? "active"
    : active
      ? "active"
      : suspended
        ? "suspended"
        : revoked
          ? "revoked"
          : null

  return ok({
    user: {
      id: user.id,
      email: user.email,
      userType: user.userType,
      hasWallet: !!walletBackup,
      hasActiveBusiness,
      businessStatus,
    },
    profile: {
      displayName: profile?.displayName ?? null,
      username: profile?.username ?? null,
    },
  })
}))
