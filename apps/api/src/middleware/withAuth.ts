import type { NextFunction, Request, Response } from "express"
import { AuthError } from "@walty/shared/api-utils/errors"
import { verifySessionToken } from "@walty/shared/auth/session-token"
import type { AuthPayload } from "@walty/shared/auth/payload"
import { findSession, touchSessionSeen } from "../services/deviceSessions.js"

declare module "express-serve-static-core" {
  interface Request {
    auth?: AuthPayload
    // True once the device session proved it holds the wallet key (attested).
    // Read by the wallet-backup gate; set here from the session row.
    deviceTrusted?: boolean
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

  let payload: AuthPayload
  try {
    payload = verifySessionToken(token)
  } catch {
    next(new AuthError())
    return
  }

  // Legacy tokens without a session id are rejected so every active session is
  // backed by a revocable device_sessions row (one-time re-login after deploy).
  if (!payload.sid) {
    next(new AuthError())
    return
  }

  // The JWT is integrity-protected and the sid is bound to its userId at
  // issuance, so userId comes from the token; the session row only tells us
  // whether the device is still active (not revoked) and trusted (attested).
  findSession(payload.sid)
    .then((session) => {
      if (!session || session.revokedAt) {
        next(new AuthError())
        return
      }
      req.auth = payload
      req.deviceTrusted = session.trustedAt != null
      touchSessionSeen(session)
      next()
    })
    .catch(next)
}
