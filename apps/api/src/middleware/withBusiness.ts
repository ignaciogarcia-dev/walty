import type { NextFunction, Request, RequestHandler, Response } from "express"
import { ForbiddenError } from "@walty/shared/api-utils/errors"
import { getIp } from "@walty/shared/api-utils/get-ip"
import {
  getBusinessContext,
  type BusinessContext,
} from "@walty/shared/business/getBusinessContext"
import {
  hasPermission,
  type Actor,
  type Permission,
} from "@walty/shared/permissions"
import { logSecurityEvent } from "@walty/shared/security/logSecurityEvent"
import { asyncHandler } from "./asyncHandler.js"
import { withAuth } from "./withAuth.js"

declare module "express-serve-static-core" {
  interface Request {
    business?: BusinessContext
    actor?: Actor
    clientIp?: string
  }
}

export const withBusinessContext: RequestHandler = asyncHandler(
  async (req: Request, _res: Response, next: NextFunction) => {
    const auth = req.auth
    if (!auth) {
      next(new ForbiddenError("BUSINESS_CONTEXT_REQUIRED"))
      return
    }
    const business = await getBusinessContext(auth.userId)
    if (!business) {
      next(new ForbiddenError("BUSINESS_CONTEXT_REQUIRED"))
      return
    }
    req.business = business
    next()
  },
)

export function withPermission(permission: Permission): RequestHandler {
  return (req, _res, next) => {
    const auth = req.auth
    const business = req.business
    if (!auth || !business) {
      next(new ForbiddenError(permission))
      return
    }
    const actor: Actor = { type: "user", user: auth }

    if (!hasPermission(actor, permission, { businessContext: business })) {
      logSecurityEvent({
        actor,
        action: permission,
        result: "denied_permission",
        reason: "missing_permission",
        ip: getIp(req),
        path: req.path,
      })
      next(new ForbiddenError(permission))
      return
    }

    req.actor = actor
    req.clientIp = getIp(req)
    next()
  }
}

/**
 * Composes auth + business context + permission check into a single
 * middleware list to spread into router.METHOD(path, ...withBusinessAuth(P), handler).
 */
export function withBusinessAuth(permission: Permission): RequestHandler[] {
  return [withAuth, withBusinessContext, withPermission(permission)]
}
