import jwt from "jsonwebtoken"
import { SESSION_MAX_AGE_SEC } from "./constants"
import type { AuthPayload } from "@walty/shared/auth/payload"

const ALGORITHM = "HS256" as const

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET
  if (!secret || secret.length === 0) {
    throw new Error("JWT_SECRET is not configured")
  }
  if (process.env.NODE_ENV === "production" && secret.length < 32) {
    throw new Error(
      "JWT_SECRET must be at least 32 characters in production (use openssl rand -base64 32)",
    )
  }
  return secret
}

export function signSessionToken(payload: AuthPayload): string {
  return jwt.sign(
    { userId: payload.userId },
    getJwtSecret(),
    {
      algorithm: ALGORITHM,
      expiresIn: SESSION_MAX_AGE_SEC,
    },
  )
}

export function verifySessionToken(token: string): AuthPayload {
  const decoded = jwt.verify(token, getJwtSecret(), {
    algorithms: [ALGORITHM],
  }) as jwt.JwtPayload & { userId?: unknown }

  if (typeof decoded.userId !== "number" || !Number.isFinite(decoded.userId)) {
    throw new Error("Invalid token payload")
  }

  return { userId: decoded.userId }
}
