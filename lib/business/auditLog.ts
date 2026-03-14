import { db } from "@/server/db"
import { businessAuditLogs } from "@/server/db/schema"

export const AUDIT_ACTIONS = {
  PAYMENT_REQUEST_CREATED: "payment_request.created",
  PAYMENT_REQUEST_CANCELLED: "payment_request.cancelled",
  MEMBER_INVITED: "member.invited",
  MEMBER_ROLE_CHANGED: "member.role_changed",
  MEMBER_SUSPENDED: "member.suspended",
  MEMBER_REVOKED: "member.revoked",
  MEMBER_ACCEPTED_INVITE: "member.accepted_invite",
  REFUND_REQUEST_CREATED: "refund_request.created",
  REFUND_REQUEST_APPROVED: "refund_request.approved",
  REFUND_REQUEST_REJECTED: "refund_request.rejected",
  REFUND_REQUEST_EXECUTED: "refund_request.executed",
} as const

export async function writeAuditLog(
  businessId: number,
  operatorId: number,
  action: string,
  metadata?: Record<string, unknown>,
  ipAddress?: string
): Promise<void> {
  try {
    await db.insert(businessAuditLogs).values({
      businessId,
      operatorId,
      action,
      metadata: metadata ? JSON.stringify(metadata) : null,
      ipAddress: ipAddress ?? null,
    })
  } catch {
    // fire-and-forget: never let audit log failures break the main flow
  }
}
