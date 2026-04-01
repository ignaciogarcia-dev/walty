import { NextRequest } from "next/server"
import { and, eq } from "drizzle-orm"
import { verifyMessage } from "viem"
import { db } from "@/server/db"
import { walletNonces, addresses } from "@/server/db/schema"
import { withErrorHandling, withAuth, ok, ValidationError, ForbiddenError } from "@/lib/api"
import { rateLimitByUser } from "@/lib/rate-limit"

export const POST = withErrorHandling(withAuth(async (req: NextRequest, { auth }) => {
  await rateLimitByUser(auth.userId, 3, 60_000)

  const { address, signature, nonce } = await req.json()

  const record = await db.query.walletNonces.findFirst({
    where: and(
      eq(walletNonces.nonce, nonce),
      eq(walletNonces.userId, auth.userId),
    ),
  })

  if (!record || record.expiresAt < new Date()) throw new ValidationError("Invalid nonce")

  const message = `Link wallet ${address} nonce ${nonce}`

  const valid = await verifyMessage({ address, message, signature })

  if (!valid) throw new ForbiddenError("wallet.invalid_signature")

  await db.delete(walletNonces).where(eq(walletNonces.id, record.id))

  await db.insert(addresses).values({ userId: auth.userId, address })

  return ok({ ok: true })
}))
