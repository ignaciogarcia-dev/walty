import { NextRequest } from "next/server"
import { and, eq, desc } from "drizzle-orm"
import { isHex, type Hex } from "viem"
import { db } from "@/server/db"
import { transactions } from "@/server/db/schema"
import { withErrorHandling, withAuth, ok, ValidationError } from "@/lib/api"
import { verifyTransaction } from "@/lib/transactions/verify"
import { rateLimitByUser } from "@/lib/rate-limit"

export const POST = withErrorHandling(withAuth(async (req: NextRequest, { auth }) => {
  await rateLimitByUser(auth.userId, 20, 60_000)
  const {
    hash,
    chainId,
    chainType,
    tokenAddress,
    tokenSymbol,
    intentId,
    from,
    to,
    value,
  } = await req.json()

  if (!hash || !isHex(hash)) {
    throw new ValidationError("Invalid transaction hash")
  }
  if (!chainId || typeof chainId !== "number") {
    throw new ValidationError("chainId is required")
  }
  if (!tokenSymbol) {
    throw new ValidationError("tokenSymbol is required")
  }

  // Store immediately as pending — the tx may not be mined yet at this point.
  // Status will be updated to confirmed/failed by PATCH once the receipt is available.
  await db.insert(transactions).values({
    userId: auth.userId,
    hash,
    chainId,
    chainType: chainType ?? "EVM",
    fromAddress: from ?? "",
    toAddress: to ?? "",
    tokenAddress: tokenAddress ?? null,
    tokenSymbol,
    value: value ?? "0",
    intentId: intentId ?? null,
    status: "pending",
  })

  return ok({ ok: true })
}))

export const GET = withErrorHandling(withAuth(async (req: NextRequest, { auth }) => {
  const { searchParams } = new URL(req.url)
  const limit = Math.min(Number(searchParams.get("limit") ?? 20), 100)
  const offset = Number(searchParams.get("offset") ?? 0)

  const rows = await db
    .select()
    .from(transactions)
    .where(eq(transactions.userId, auth.userId))
    .orderBy(desc(transactions.createdAt))
    .limit(limit)
    .offset(offset)

  return ok(rows)
}))

export const PATCH = withErrorHandling(withAuth(async (req: NextRequest, { auth }) => {
  await rateLimitByUser(auth.userId, 20, 60_000)

  const { hash } = await req.json()

  if (!hash || !isHex(hash)) {
    throw new ValidationError("Invalid transaction hash")
  }

  // Find the existing tx record to get chainId
  const [existing] = await db
    .select({ chainId: transactions.chainId })
    .from(transactions)
    .where(and(eq(transactions.hash, hash), eq(transactions.userId, auth.userId)))
    .limit(1)

  if (!existing) {
    throw new ValidationError("Transaction not found")
  }

  let verified
  try {
    verified = await verifyTransaction(hash as Hex, { chainId: existing.chainId })
  } catch {
    throw new ValidationError("Transaction not found on-chain")
  }

  await db
    .update(transactions)
    .set({
      status: verified.status,
      gasUsed: verified.gasUsed,
      blockNumber: verified.blockNumber,
    })
    .where(and(eq(transactions.hash, hash), eq(transactions.userId, auth.userId)))

  return ok({ ok: true, status: verified.status })
}))
