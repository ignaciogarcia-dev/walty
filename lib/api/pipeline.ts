import type { NextRequest } from "next/server"
import { requireApiAuth, type AuthPayload } from "@/lib/auth"
import { getBusinessContext, type BusinessContext } from "@/lib/business/getBusinessContext"
import { hasPermission, type Permission, type Actor } from "@/lib/permissions"
import { logSecurityEvent } from "@/lib/security/logSecurityEvent"
import { ForbiddenError } from "./errors"
import { getIp } from "./get-ip"

type Handler<T> = (req: NextRequest, ctx: T) => Promise<Response>

/**
 * Authorization pipeline (execution order when composed):
 * 1. withErrorHandling — catches all errors, maps to HTTP responses
 * 2. withAuth           — resolves JWT, adds `auth` to context
 * 3. withBusinessContext — resolves business context, adds `business` (non-null)
 * 4. withPermission      — checks permission, adds `actor` + `ip`, auto-logs denial
 * 5. Handler             — policy validation (resource state) + business logic
 *
 * Rules:
 *   - Permission = access (role/capability) → always in withPermission layer
 *   - Policy = resource state → always inside handler, returns 400 not 403
 *   - Routes NEVER call logSecurityEvent for permission denials
 *   - Routes NEVER try/catch auth errors
 *   - Routes NEVER return error.message to client
 */

/**
 * Layer 1: Authentication.
 * Resolves JWT → adds `auth: AuthPayload` to context.
 * Throws AuthError if token is missing/invalid (caught by withErrorHandling).
 */
export function withAuth<T>(
  handler: Handler<T & { auth: AuthPayload }>
): Handler<T> {
  return async (req, ctx) => {
    const auth = requireApiAuth(req)
    return handler(req, { ...ctx, auth })
  }
}

/**
 * Layer 2: Business context resolution.
 * Resolves business membership → adds `business: BusinessContext` (non-null).
 * Throws ForbiddenError if user has no business context.
 * Requires: `auth` in context (must compose after withAuth).
 */
export function withBusinessContext<T extends { auth: AuthPayload }>(
  handler: Handler<T & { business: BusinessContext }>
): Handler<T> {
  return async (req, ctx) => {
    const business = await getBusinessContext(ctx.auth.userId)

    if (!business) {
      throw new ForbiddenError("BUSINESS_CONTEXT_REQUIRED")
    }

    return handler(req, { ...ctx, business })
  }
}

/**
 * Layer 3: Permission check.
 * Checks actor has permission → adds `actor: Actor` and `ip: string`.
 * Auto-logs denial. Throws ForbiddenError on denial.
 * Requires: `auth` and `business` in context (must compose after withAuth + withBusinessContext).
 */
export function withPermission<
  T extends { auth: AuthPayload; business: BusinessContext }
>(
  permission: Permission,
  handler: Handler<T & { actor: Actor; ip: string }>
): Handler<T> {
  return async (req, ctx) => {
    const actor: Actor = { type: "user", user: ctx.auth }

    if (!hasPermission(actor, permission, { businessContext: ctx.business })) {
      logSecurityEvent({
        actor,
        action: permission,
        result: "denied_permission",
        reason: "missing_permission",
        ip: getIp(req),
        path: req.nextUrl.pathname,
      })

      throw new ForbiddenError(permission)
    }

    return handler(req, {
      ...ctx,
      actor,
      ip: getIp(req),
    })
  }
}
