import type { NextFunction, Request, Response } from "express"
import { AuthError } from "@walty/shared/api-utils/errors"
import { verifySessionToken } from "@walty/shared/auth/session-token"
import type { AuthPayload } from "@walty/shared/auth/payload"

declare module "express-serve-static-core" {
  interface Request {
    auth?: AuthPayload
  }
}

const BEARER = /^Bearer\s+(.+)$/i

function extractToken(req: Request): string | null {
  const cookie = req.cookies?.token
  if (typeof cookie === "string" && cookie.length > 0) return cookie
  const header = req.header("authorization")
  if (!header) return null
  const m = BEARER.exec(header)
  return m ? m[1] : null
}

export function withAuth(req: Request, _res: Response, next: NextFunction): void {
  const token = extractToken(req)
  if (!token) {
    next(new AuthError())
    return
  }
  try {
    req.auth = verifySessionToken(token)
    next()
  } catch {
    next(new AuthError())
  }
}
