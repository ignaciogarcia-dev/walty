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
import type { PosContext } from "./withPos.js"

export interface AuthedRequest extends Request {
  auth: AuthPayload
}

export interface BusinessContextRequest extends Request {
  auth: AuthPayload
  business: BusinessContext
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
 * For handlers composed behind withAuth + withBusinessContext only (no
 * permission gate). Caller still has auth + business; actor / clientIp
 * are not populated.
 */
export function withBusinessHandler(
  handler: (
    req: BusinessContextRequest,
    res: Response,
    next: NextFunction,
  ) => Promise<unknown> | unknown,
): RequestHandler {
  return asyncHandler(async (req, res, next) => {
    if (!req.auth || !req.business) {
      throw new Error(
        "withBusinessHandler: missing auth/business (middleware order)",
      )
    }
    return handler(req as BusinessContextRequest, res, next)
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

export interface PosRequest extends Request {
  pos: PosContext
  business: BusinessContext
  actor: Actor
  clientIp: string
}

/**
 * For handlers composed behind withPosAuth — a POS device (agent actor). There
 * is no req.auth (no user); the device context lives on req.pos and the derived
 * business context on req.business.
 */
export function posed(
  handler: (
    req: PosRequest,
    res: Response,
    next: NextFunction,
  ) => Promise<unknown> | unknown,
): RequestHandler {
  return asyncHandler(async (req, res, next) => {
    if (!req.pos || !req.business || !req.actor || !req.clientIp) {
      throw new Error("posed: missing POS context (middleware order)")
    }
    return handler(req as PosRequest, res, next)
  })
}
