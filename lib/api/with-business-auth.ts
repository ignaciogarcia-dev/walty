import type { NextRequest } from "next/server"
import type { AuthPayload } from "@/lib/auth"
import type { BusinessContext } from "@/lib/business/getBusinessContext"
import type { Actor, Permission } from "@/lib/permissions"
import { withErrorHandling } from "./with-error-handling"
import { withAuth, withBusinessContext, withPermission } from "./pipeline"

export interface BusinessAuthContext {
  auth: AuthPayload
  business: BusinessContext
  actor: Actor
  ip: string
}

/**
 * Full business authorization pipeline.
 * Composes: withErrorHandling → withAuth → withBusinessContext → withPermission → handler
 *
 * Usage:
 *   export const GET = withBusinessAuth(Permission.X, async (req, { auth, business, actor, ip }) => { ... })
 */
export function withBusinessAuth<TRoute = unknown>(
  permission: Permission,
  handler: (req: NextRequest, ctx: BusinessAuthContext & TRoute) => Promise<Response>
) {
  return withErrorHandling<TRoute>(
    withAuth(
      withBusinessContext(
        withPermission(permission, handler as Parameters<typeof withPermission>[1])
      )
    ) as (req: NextRequest, ctx: TRoute) => Promise<Response>
  )
}
