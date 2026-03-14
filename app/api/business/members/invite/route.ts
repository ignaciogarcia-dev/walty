import { NextRequest, NextResponse } from "next/server"
import { requireAuth } from "@/lib/auth"
import { db } from "@/server/db"
import { businessMembers } from "@/server/db/schema"
import { getBusinessContext } from "@/lib/business/getBusinessContext"
import { writeAuditLog, AUDIT_ACTIONS } from "@/lib/business/auditLog"

const VALID_ROLES = ["manager", "cashier", "waiter"] as const
type MemberRole = typeof VALID_ROLES[number]

function getIp(req: NextRequest) {
  return req.headers.get("x-forwarded-for") ?? req.headers.get("x-real-ip") ?? "unknown"
}

export async function POST(req: NextRequest) {
  try {
    const auth = requireAuth(req)
    const ctx = await getBusinessContext(auth.userId)

    if (!ctx?.isOwner) {
      return NextResponse.json({ error: "only business owners can invite members" }, { status: 403 })
    }

    const { role, inviteEmail, expiresInDays } = await req.json()

    if (!VALID_ROLES.includes(role as MemberRole)) {
      return NextResponse.json({ error: "role must be manager, cashier, or waiter" }, { status: 400 })
    }

    const days = Math.min(Math.max(Number(expiresInDays) || 7, 1), 30)
    const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000)

    const [member] = await db
      .insert(businessMembers)
      .values({
        businessId: ctx.businessId,
        role: role as MemberRole,
        status: "invited",
        inviteEmail: inviteEmail ?? null,
        invitedBy: auth.userId,
        expiresAt,
      })
      .returning()

    writeAuditLog(
      ctx.businessId,
      auth.userId,
      AUDIT_ACTIONS.MEMBER_INVITED,
      { memberId: member.id, role, inviteEmail: inviteEmail ?? null },
      getIp(req)
    )

    const inviteUrl = `/join/${member.inviteToken}`

    return NextResponse.json({
      id: member.id,
      inviteToken: member.inviteToken,
      inviteUrl,
      role: member.role,
      expiresAt: member.expiresAt.toISOString(),
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "unexpected error"
    if (message === "Unauthorized") {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 })
    }
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
