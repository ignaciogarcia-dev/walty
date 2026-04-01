import { randomBytes } from "crypto"
import { NextRequest } from "next/server"
import { lt } from "drizzle-orm"
import { db } from "@/server/db"
import { walletNonces } from "@/server/db/schema"
import { withErrorHandling, withAuth, ok } from "@/lib/api"
import { rateLimitByUser } from "@/lib/rate-limit"

export const POST = withErrorHandling(withAuth(async (_req: NextRequest, { auth }) => {
  await rateLimitByUser(auth.userId, 5, 60_000)

  // Clean up expired nonces before inserting a new one
  await db.delete(walletNonces).where(lt(walletNonces.expiresAt, new Date()))

  const nonce = randomBytes(16).toString("hex")

  await db.insert(walletNonces).values({
    userId: auth.userId,
    nonce,
    expiresAt: new Date(Date.now() + 5 * 60 * 1000),
  })

  return ok({ nonce })
}))
