import { NextRequest } from "next/server"
import { eq, and, lt } from "drizzle-orm"
import { db } from "@/server/db"
import { transactions, txIntents } from "@/server/db/schema"
import { getPublicClient } from "@/lib/rpc/getPublicClient"
import { withErrorHandling, withAuth, ok } from "@/lib/api"
import { rateLimitByUser } from "@/lib/rate-limit"

/** Intents stuck in "broadcasting" longer than this are considered failed. */
const BROADCASTING_TIMEOUT_MS = 5 * 60 * 1000 // 5 minutes

export const POST = withErrorHandling(withAuth(async (_req: NextRequest, { auth }) => {
  await rateLimitByUser(auth.userId, 5, 60_000)

  const txs = await db
    .select()
    .from(transactions)
    .where(eq(transactions.userId, auth.userId))

  for (const tx of txs) {
    if (tx.status === "confirmed") continue

    const publicClient = getPublicClient(tx.chainId)

    const receipt = await publicClient
      .getTransactionReceipt({ hash: tx.hash as `0x${string}` })
      .catch(() => null)

    if (receipt) {
      await db
        .update(transactions)
        .set({
          status: receipt.status === "success" ? "confirmed" : "failed",
          gasUsed: receipt.gasUsed?.toString() ?? null,
          blockNumber: receipt.blockNumber?.toString() ?? null,
        })
        .where(eq(transactions.id, tx.id))
    }
  }

  // Fail intents stuck in "broadcasting" (process died between claim and send)
  const staleThreshold = new Date(Date.now() - BROADCASTING_TIMEOUT_MS)
  await db
    .update(txIntents)
    .set({ status: "failed" })
    .where(and(
      eq(txIntents.userId, auth.userId),
      eq(txIntents.status, "broadcasting"),
      lt(txIntents.createdAt, staleThreshold)
    ))

  // Sync tx_intents that are "broadcasted" with a txHash
  const intents = await db
    .select()
    .from(txIntents)
    .where(and(
      eq(txIntents.userId, auth.userId),
      eq(txIntents.status, "broadcasted")
    ))

  for (const intent of intents) {
    if (!intent.txHash) continue
    const payload = intent.payload as { chainId: number }
    const publicClient = getPublicClient(payload.chainId)
    const receipt = await publicClient
      .getTransactionReceipt({ hash: intent.txHash as `0x${string}` })
      .catch(() => null)

    if (receipt) {
      await db
        .update(txIntents)
        .set({ status: receipt.status === "success" ? "confirmed" : "failed" })
        .where(and(eq(txIntents.id, intent.id), eq(txIntents.status, "broadcasted")))
    }
  }

  return ok({ ok: true })
}))
