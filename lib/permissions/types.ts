import type { AuthPayload } from "@/lib/auth"
import type { BusinessContext } from "@/lib/business/getBusinessContext"

export const Permission = {
  // Base (all users)
  SEND_TOKEN: "send_token",
  MANAGE_CONTACTS: "manage_contacts",

  // Business context (any role)
  PAYMENT_REQUEST_CREATE: "payment_request.create",
  PAYMENT_REQUEST_READ: "payment_request.read",
  PAYMENT_REQUEST_CANCEL: "payment_request.cancel",
  PAYMENT_HISTORY_READ: "payment_history.read",
  BUSINESS_CONTEXT_READ: "business_context.read",

  // Cashier + owner
  REFUND_REQUEST_CREATE: "refund_request.create",
  REFUND_REQUEST_LIST: "refund_request.list",

  // Owner only
  MEMBER_LIST: "member.list",
  MEMBER_INVITE: "member.invite",
  MEMBER_MANAGE: "member.manage",
  REFUND_REVIEW: "refund.review",

  // Special
  JOIN_BUSINESS: "join_business",
} as const

export type Permission = (typeof Permission)[keyof typeof Permission]

export type Actor =
  | { type: "user"; user: AuthPayload }
  | { type: "agent"; agentId: string }

export interface PermissionContext {
  businessContext: BusinessContext | null
}
