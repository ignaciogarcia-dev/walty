import { NextRequest } from "next/server"
import { and, eq } from "drizzle-orm"
import { DatabaseError } from "pg"
import { isAddress } from "viem"
import { db } from "@/server/db"
import { businessMembers } from "@/server/db/schema"
import { writeAuditLog, AUDIT_ACTIONS } from "@/lib/business/auditLog"
import { withBusinessAuth, ok, ValidationError } from "@/lib/api"
import { Permission } from "@/lib/permissions"

const VALID_ROLES = ["cashier"] as const
type MemberRole = typeof VALID_ROLES[number]

function pgDatabaseError(err: unknown): DatabaseError | null {
  if (err instanceof DatabaseError) return err
  if (typeof err === "object" && err !== null && "cause" in err) {
    const c = (err as { cause: unknown }).cause
    if (c instanceof DatabaseError) return c
  }
  return null
}

export const POST = withBusinessAuth(Permission.MEMBER_INVITE, async (req: NextRequest, { auth, business, ip }) => {
  const { role, inviteEmail, expiresInDays, walletAddress, derivationIndex } = await req.json()

  if (!VALID_ROLES.includes(role as MemberRole)) {
    throw new ValidationError("role must be cashier")
  }

  if (!walletAddress || !isAddress(walletAddress)) {
    throw new ValidationError("valid walletAddress is required")
  }

  if (!derivationIndex || typeof derivationIndex !== "number" || derivationIndex < 1) {
    throw new ValidationError("valid derivationIndex is required (must be >= 1)")
  }

  const indexTaken = await db.query.businessMembers.findFirst({
    where: and(
      eq(businessMembers.businessId, business.businessId),
      eq(businessMembers.derivationIndex, derivationIndex)
    ),
    columns: { id: true },
  })
  if (indexTaken) {
    throw new ValidationError("derivation index already in use for this business")
  }

  const days = Math.min(Math.max(Number(expiresInDays) || 7, 1), 30)
  const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000)

  let member: typeof businessMembers.$inferSelect
  try {
    ;[member] = await db
      .insert(businessMembers)
      .values({
        businessId: business.businessId,
        role: role as MemberRole,
        status: "invited",
        inviteEmail: inviteEmail ?? null,
        invitedBy: auth.userId,
        expiresAt,
        derivationIndex,
        walletAddress,
      })
      .returning()
  } catch (err) {
    const pg = pgDatabaseError(err)
    if (
      pg?.code === "23505" &&
      pg.constraint != null &&
      String(pg.constraint).includes("derivation_index")
    ) {
      throw new ValidationError("derivation-index-conflict")
    }
    throw err
  }

  writeAuditLog(
    business.businessId,
    auth.userId,
    AUDIT_ACTIONS.MEMBER_INVITED,
    { memberId: member.id, role, inviteEmail: inviteEmail ?? null, derivationIndex, walletAddress },
    ip
  )

  return ok({
    id: member.id,
    inviteToken: member.inviteToken,
    inviteUrl: `/join/${member.inviteToken}`,
    role: member.role,
    derivationIndex: member.derivationIndex,
    walletAddress: member.walletAddress,
    expiresAt: member.expiresAt.toISOString(),
  })
})
