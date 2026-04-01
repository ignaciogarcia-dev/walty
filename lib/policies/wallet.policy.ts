import type { Actor, PermissionContext } from "@/lib/permissions"
import { allow, deny, type PolicyResult } from "./types"

export function canSendToken(actor: Actor, ctx: PermissionContext): PolicyResult {
  if (actor.type !== "user") return deny("agent_not_supported")
  // Operators cannot send directly; owner can (they own the wallet)
  if (ctx.businessContext && !ctx.businessContext.isOwner) return deny("business_cannot_send_directly")
  return allow
}

export function canAccessPersonRoutes(actor: Actor, ctx: PermissionContext): PolicyResult {
  if (actor.type !== "user") return deny("agent_not_supported")
  // Operators are confined to business routes; owner can access everything
  if (ctx.businessContext && !ctx.businessContext.isOwner) return deny("business_context_active")
  return allow
}
