import type {
  NextFunction,
  Request,
  RequestHandler,
  Response,
} from "express"
import type { AuthPayload } from "@walty/shared/auth/payload"
import type { BusinessContext } from "@walty/shared/business/getBusinessContext"
import type { Actor } from "@walty/shared/permissions"
import { asyncHandler } from "./asyncHandler.js"

export interface AuthedRequest extends Request {
  auth: AuthPayload
}

export interface BusinessRequest extends Request {
  auth: AuthPayload
  business: BusinessContext
  actor: Actor
  clientIp: string
}

/**
 * Wraps an authenticated handler so the body sees `req.auth` typed as
 * non-null. The wrapper still asserts at runtime so a future middleware
 * reorder produces a clear 500 instead of a silent type lie.
 */
export function authed(
  handler: (
    req: AuthedRequest,
    res: Response,
    next: NextFunction,
  ) => Promise<unknown> | unknown,
): RequestHandler {
  return asyncHandler(async (req, res, next) => {
    if (!req.auth) throw new Error("authed: req.auth missing (middleware order)")
    return handler(req as AuthedRequest, res, next)
  })
}

/**
 * Same idea for handlers composed behind withBusinessAuth — auth, business,
 * actor and clientIp are all guaranteed by the upstream middleware.
 */
export function businessed(
  handler: (
    req: BusinessRequest,
    res: Response,
    next: NextFunction,
  ) => Promise<unknown> | unknown,
): RequestHandler {
  return asyncHandler(async (req, res, next) => {
    if (!req.auth || !req.business || !req.actor || !req.clientIp) {
      throw new Error(
        "businessed: missing business context (middleware order)",
      )
    }
    return handler(req as BusinessRequest, res, next)
  })
}
