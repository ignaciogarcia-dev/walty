import { Permission, type Actor, type PermissionContext } from "./types"

const BASE: Permission[] = [
  Permission.SEND_TOKEN,
  Permission.MANAGE_CONTACTS,
]

const BUSINESS_ANY_ROLE: Permission[] = [
  Permission.PAYMENT_REQUEST_CREATE,
  Permission.PAYMENT_REQUEST_READ,
  Permission.PAYMENT_REQUEST_CANCEL,
  Permission.PAYMENT_HISTORY_READ,
  Permission.BUSINESS_CONTEXT_READ,
  // Cashiers can initiate refund requests
  Permission.REFUND_REQUEST_CREATE,
  Permission.REFUND_REQUEST_LIST,
]

const BUSINESS_OWNER: Permission[] = [
  Permission.MEMBER_LIST,
  Permission.MEMBER_INVITE,
  Permission.MEMBER_MANAGE,
  Permission.REFUND_REVIEW,
]

export function resolvePermissions(
  actor: Actor,
  ctx: PermissionContext = { businessContext: null }
): Permission[] {
  if (actor.type === "agent") {
    throw new Error("Agent permissions not implemented")
  }

  const { businessContext } = ctx
  const perms: Permission[] = [...BASE]

  if (!businessContext) {
    perms.push(Permission.JOIN_BUSINESS)
  }

  if (businessContext) {
    perms.push(...BUSINESS_ANY_ROLE)
    if (businessContext.isOwner) {
      perms.push(...BUSINESS_OWNER)
    }
  }

  return perms
}

// No cache: resolvePermissions is pure logic with no I/O, so the cost per call
// is negligible. A WeakMap keyed only on actor (not ctx) would return stale
// permissions if the same actor object is reused with a different context.
export function hasPermission(
  actor: Actor,
  permission: Permission,
  ctx?: PermissionContext
): boolean {
  return resolvePermissions(actor, ctx).includes(permission)
}
