import { NextRequest, NextResponse } from "next/server"
import { and, eq } from "drizzle-orm"
import { db } from "@/server/db"
import { businessMembers, users, userProfiles } from "@/server/db/schema"
import { requireAuth } from "@/lib/auth"
import { getBusinessContext } from "@/lib/business/getBusinessContext"
import { writeAuditLog, AUDIT_ACTIONS } from "@/lib/business/auditLog"

function getIp(req: NextRequest) {
  return req.headers.get("x-forwarded-for") ?? req.headers.get("x-real-ip") ?? "unknown"
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params

    const member = await db.query.businessMembers.findFirst({
      where: eq(businessMembers.inviteToken, token),
      columns: {
        id: true, businessId: true, role: true, status: true, inviteEmail: true, expiresAt: true, invitedBy: true, userId: true,
      },
    })

    if (!member) {
      return NextResponse.json({ error: "invitation not found" }, { status: 404 })
    }

    if (member.status === "revoked") {
      return NextResponse.json({ status: "revoked" })
    }

    if (member.status === "active" || member.status === "suspended") {
      return NextResponse.json({ status: "already_accepted" })
    }

    if (new Date() > member.expiresAt) {
      return NextResponse.json({ status: "expired" })
    }

    // Fetch business info
    const business = await db.query.users.findFirst({
      where: eq(users.id, member.businessId),
      columns: { email: true },
    })
    const businessProfile = await db.query.userProfiles.findFirst({
      where: eq(userProfiles.userId, member.businessId),
      columns: { username: true },
    })

    // Fetch inviter info
    const inviter = await db.query.users.findFirst({
      where: eq(users.id, member.invitedBy),
      columns: { email: true },
    })
    const inviterProfile = await db.query.userProfiles.findFirst({
      where: eq(userProfiles.userId, member.invitedBy),
      columns: { username: true },
    })

    return NextResponse.json({
      status: "valid",
      id: member.id,
      businessId: member.businessId,
      businessName: businessProfile?.username ?? business?.email ?? "Unknown",
      role: member.role,
      invitedByName: inviterProfile?.username ?? inviter?.email ?? "Unknown",
      expiresAt: member.expiresAt.toISOString(),
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "unexpected error"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const auth = requireAuth(req)
    const { token } = await params

    // Must not already have a business context
    const existingCtx = await getBusinessContext(auth.userId)
    if (existingCtx) {
      return NextResponse.json({ error: "you already belong to a business" }, { status: 409 })
    }

    const user = await db.query.users.findFirst({
      where: eq(users.id, auth.userId),
      columns: { userType: true },
    })

    if (user?.userType === "business") {
      return NextResponse.json({ error: "business accounts cannot join as operators" }, { status: 400 })
    }

    const member = await db.query.businessMembers.findFirst({
      where: eq(businessMembers.inviteToken, token),
    })

    if (!member) {
      return NextResponse.json({ error: "invitation not found" }, { status: 404 })
    }

    if (member.status === "revoked") {
      return NextResponse.json({ error: "this invitation has been revoked" }, { status: 400 })
    }

    if (member.status !== "invited") {
      return NextResponse.json({ error: "this invitation has already been used" }, { status: 409 })
    }

    if (new Date() > member.expiresAt) {
      return NextResponse.json({ error: "this invitation has expired" }, { status: 400 })
    }

    const now = new Date()
    await db
      .update(businessMembers)
      .set({ userId: auth.userId, status: "active", lastActivityAt: now })
      .where(eq(businessMembers.id, member.id))

    writeAuditLog(
      member.businessId,
      auth.userId,
      AUDIT_ACTIONS.MEMBER_ACCEPTED_INVITE,
      { memberId: member.id, role: member.role },
      getIp(req)
    )

    return NextResponse.json({ ok: true, businessId: member.businessId, role: member.role })
  } catch (error) {
    const message = error instanceof Error ? error.message : "unexpected error"
    if (message === "Unauthorized") {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 })
    }
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
