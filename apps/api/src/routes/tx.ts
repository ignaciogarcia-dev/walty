import { and, desc, eq, lt } from "drizzle-orm"
import { Router } from "express"
import { isHex, type Hex } from "viem"
import { db, addresses, transactions, txIntents } from "@walty/db"
import { ValidationError } from "@walty/shared/api-utils/errors"
import type { TransactionActivityItem } from "@walty/shared/activity/types"
import { rateLimitByUser } from "@walty/shared/rate-limit"
import { getPublicClient } from "@walty/shared/rpc/getPublicClient"
import { verifyTransaction } from "@walty/shared/transactions/verify"
import { asyncHandler } from "../middleware/asyncHandler.js"
import { withAuth } from "../middleware/withAuth.js"

export const txRouter: Router = Router()

const BROADCASTING_TIMEOUT_MS = 5 * 60 * 1000

// ---------- POST /tx ----------
txRouter.post(
  "/tx",
  withAuth,
  asyncHandler(async (req, res) => {
    const auth = req.auth!
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
    } = req.body ?? {}

    if (!hash || !isHex(hash)) throw new ValidationError("Invalid transaction hash")
    if (!chainId || typeof chainId !== "number") {
      throw new ValidationError("chainId is required")
    }
    if (!tokenSymbol) throw new ValidationError("tokenSymbol is required")

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

    res.json({ ok: true })
  }),
)

// ---------- GET /tx ----------
txRouter.get(
  "/tx",
  withAuth,
  asyncHandler(async (req, res) => {
    const auth = req.auth!
    const limit = Math.min(Number(req.query.limit ?? 20), 100)
    const offset = Number(req.query.offset ?? 0)

    const rows = await db
      .select()
      .from(transactions)
      .where(eq(transactions.userId, auth.userId))
      .orderBy(desc(transactions.createdAt))
      .limit(limit)
      .offset(offset)

    res.json(rows)
  }),
)

// ---------- PATCH /tx ----------
txRouter.patch(
  "/tx",
  withAuth,
  asyncHandler(async (req, res) => {
    const auth = req.auth!
    await rateLimitByUser(auth.userId, 20, 60_000)

    const { hash } = req.body ?? {}
    if (!hash || !isHex(hash)) throw new ValidationError("Invalid transaction hash")

    const [existing] = await db
      .select({ chainId: transactions.chainId })
      .from(transactions)
      .where(
        and(eq(transactions.hash, hash), eq(transactions.userId, auth.userId)),
      )
      .limit(1)
    if (!existing) throw new ValidationError("Transaction not found")

    let verified
    try {
      verified = await verifyTransaction(hash as Hex, {
        chainId: existing.chainId,
      })
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
      .where(
        and(eq(transactions.hash, hash), eq(transactions.userId, auth.userId)),
      )

    res.json({ ok: true, status: verified.status })
  }),
)

// ---------- GET /tx/activity ----------
txRouter.get(
  "/tx/activity",
  withAuth,
  asyncHandler(async (req, res) => {
    const auth = req.auth!
    await rateLimitByUser(auth.userId, 20, 60_000)

    const userAddresses = await db
      .select({ address: addresses.address })
      .from(addresses)
      .where(eq(addresses.userId, auth.userId))

    if (userAddresses.length === 0) {
      res.json({ items: [], total: 0 })
      return
    }

    const addressList = userAddresses.map((a) => a.address.toLowerCase())
    const typeParam = (req.query.type as string) || "all"
    const limit = Math.min(Number(req.query.limit ?? 50), 100)
    const offset = Number(req.query.offset ?? 0)

    const allRows = await db
      .select()
      .from(transactions)
      .where(eq(transactions.userId, auth.userId))
      .orderBy(desc(transactions.createdAt))

    const classifiedRows = allRows
      .map((tx) => {
        const isSender = addressList.includes(tx.fromAddress.toLowerCase())
        const isReceiver = addressList.includes(tx.toAddress.toLowerCase())

        if (tx.type === "receive" && !isSender) {
          return { tx, kind: "receive" as const }
        }
        if (
          tx.type === null &&
          isReceiver &&
          !isSender &&
          tx.status === "confirmed"
        ) {
          return { tx, kind: "collected" as const }
        }
        if (isReceiver && !isSender && tx.status === "confirmed") {
          return { tx, kind: "refund" as const }
        }
        if (isSender && tx.status === "confirmed") {
          return { tx, kind: "payment" as const }
        }
        if (isSender) return { tx, kind: "send" as const }
        return null
      })
      .filter((r): r is NonNullable<typeof r> => r !== null)

    const PRIORITY: Record<string, number> = {
      payment: 3,
      collected: 3,
      refund: 3,
      send: 2,
      receive: 1,
    }
    const byHash = new Map<string, (typeof classifiedRows)[number]>()
    for (const row of classifiedRows) {
      const existing = byHash.get(row.tx.hash)
      if (!existing || (PRIORITY[row.kind] ?? 0) > (PRIORITY[existing.kind] ?? 0)) {
        byHash.set(row.tx.hash, row)
      }
    }
    const deduped = Array.from(byHash.values()).sort(
      (a, b) =>
        (b.tx.createdAt?.getTime() ?? 0) - (a.tx.createdAt?.getTime() ?? 0),
    )

    let filteredRows = deduped
    if (typeParam === "payments") {
      filteredRows = deduped.filter(
        (r) => r.kind === "payment" || r.kind === "refund",
      )
    } else if (typeParam === "sends") {
      filteredRows = deduped.filter((r) => r.kind === "send")
    }

    const paginatedRows = filteredRows.slice(offset, offset + limit)
    const items: TransactionActivityItem[] = paginatedRows.map(({ tx, kind }) => ({
      id: tx.id,
      type: kind,
      hash: tx.hash,
      chainId: tx.chainId,
      fromAddress: tx.fromAddress,
      toAddress: tx.toAddress,
      value: tx.value,
      tokenSymbol: tx.tokenSymbol,
      status: tx.status as "pending" | "confirmed" | "failed",
      createdAt: tx.createdAt?.toISOString() ?? new Date().toISOString(),
    }))

    res.json({ items, total: filteredRows.length })
  }),
)

// ---------- POST /tx/sync ----------
txRouter.post(
  "/tx/sync",
  withAuth,
  asyncHandler(async (req, res) => {
    const auth = req.auth!
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

    const staleThreshold = new Date(Date.now() - BROADCASTING_TIMEOUT_MS)
    await db
      .update(txIntents)
      .set({ status: "failed" })
      .where(
        and(
          eq(txIntents.userId, auth.userId),
          eq(txIntents.status, "broadcasting"),
          lt(txIntents.createdAt, staleThreshold),
        ),
      )

    const intents = await db
      .select()
      .from(txIntents)
      .where(
        and(
          eq(txIntents.userId, auth.userId),
          eq(txIntents.status, "broadcasted"),
        ),
      )

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
          .set({
            status: receipt.status === "success" ? "confirmed" : "failed",
          })
          .where(
            and(
              eq(txIntents.id, intent.id),
              eq(txIntents.status, "broadcasted"),
            ),
          )
      }
    }

    res.json({ ok: true })
  }),
)

// ---------- POST /tx/scan-incoming ----------
// Always 410 — superseded by server-side reconciler.
txRouter.post("/tx/scan-incoming", (_req, res) => {
  res.status(410).json({
    error:
      "This endpoint is no longer available. Incoming transfers are reconciled server-side.",
  })
})
