import { createHash } from "node:crypto"
import { and, desc, eq } from "drizzle-orm"
import { Router } from "express"
import { db, txIntents } from "@walty/db"
import {
  ConflictError,
  NotFoundError,
  ValidationError,
} from "@walty/shared/api-utils/errors"
import { isUniqueViolation } from "@walty/shared/db-errors"
import { rateLimitByIp } from "@walty/shared/rate-limit"
import { broadcastRawTx } from "@walty/shared/transactions/broadcast"
import {
  assertNotExpired,
  expireIfStale,
} from "@walty/shared/tx-intents/expire"
import type {
  TxIntentPayload,
  TxIntentType,
} from "@walty/shared/tx-intents/types"
import { validateAndNormalizePayload } from "@walty/shared/tx-intents/validate"
import {
  assertSignedRawMatchesPayload,
  SignedTxMismatchError,
} from "@walty/shared/tx-intents/verifySigned"
import { authed } from "../middleware/typedHandlers.js"
import { withAuth } from "../middleware/withAuth.js"
import {
  emitTxIntentStatus,
  type TxIntentStatus,
} from "../ws/io.js"

export const txIntentsRouter: Router = Router()

const VALID_TYPES: TxIntentType[] = [
  "transfer",
  "refund",
  "gas_funding",
  "collection",
]

const INTENT_TTL_MS = 5 * 60 * 1000

function canonicalStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value)
  if (Array.isArray(value)) {
    return "[" + value.map(canonicalStringify).join(",") + "]"
  }
  const keys = Object.keys(value as Record<string, unknown>).sort()
  return (
    "{" +
    keys
      .map(
        (k) =>
          JSON.stringify(k) +
          ":" +
          canonicalStringify((value as Record<string, unknown>)[k]),
      )
      .join(",") +
    "}"
  )
}

function hashPayload(payload: TxIntentPayload, type: TxIntentType): string {
  return createHash("sha256")
    .update(type + "|" + canonicalStringify(payload))
    .digest("hex")
}

// ---------- POST /tx-intents ----------
txIntentsRouter.post(
  "/tx-intents",
  withAuth,
  authed(async (req, res) => {
    const { auth } = req
    await rateLimitByIp(`tx-create:${auth.userId}`, 10)

    const body = req.body ?? {}
    const { payload, idempotencyKey, type: rawType } = body as {
      payload: TxIntentPayload
      idempotencyKey?: string
      type?: string
    }
    const intentType: TxIntentType =
      rawType && VALID_TYPES.includes(rawType as TxIntentType)
        ? (rawType as TxIntentType)
        : "transfer"

    if (!payload) throw new ValidationError("Missing payload")

    try {
      validateAndNormalizePayload(payload)
    } catch (err) {
      throw new ValidationError(
        err instanceof Error ? err.message : "Invalid payload",
      )
    }

    const payloadHash = hashPayload(payload, intentType)

    if (idempotencyKey) {
      const [existing] = await db
        .select()
        .from(txIntents)
        .where(
          and(
            eq(txIntents.userId, auth.userId),
            eq(txIntents.idempotencyKey, idempotencyKey),
          ),
        )
        .limit(1)

      if (existing) {
        if (!(await expireIfStale(existing))) {
          if (existing.payloadHash && existing.payloadHash !== payloadHash) {
            throw new ConflictError("idempotency-key-payload-mismatch")
          }
          res.json(existing)
          return
        }
      }
    }

    const expiresAt = new Date(Date.now() + INTENT_TTL_MS)

    try {
      const [intent] = await db
        .insert(txIntents)
        .values({
          userId: auth.userId,
          type: intentType,
          payload,
          payloadHash,
          status: "pending",
          idempotencyKey: idempotencyKey ?? null,
          expiresAt,
        })
        .returning()

      emitTxIntentStatus({ id: intent.id, status: "pending" })
      res.json(intent)
    } catch (err) {
      if (idempotencyKey && isUniqueViolation(err)) {
        const [existing] = await db
          .select()
          .from(txIntents)
          .where(
            and(
              eq(txIntents.userId, auth.userId),
              eq(txIntents.idempotencyKey, idempotencyKey),
            ),
          )
          .limit(1)

        if (existing) {
          if (existing.payloadHash && existing.payloadHash !== payloadHash) {
            throw new ConflictError("idempotency-key-payload-mismatch")
          }
          res.json(existing)
          return
        }

        throw new ConflictError("idempotency-key-conflict")
      }
      throw err
    }
  }),
)

// ---------- GET /tx-intents ----------
txIntentsRouter.get(
  "/tx-intents",
  withAuth,
  authed(async (req, res) => {
    const { auth } = req
    const rawLimit = parseInt((req.query.limit as string) ?? "", 10)
    const limit = Math.min(
      Number.isFinite(rawLimit) && rawLimit >= 1 ? rawLimit : 20,
      100,
    )
    const rows = await db
      .select()
      .from(txIntents)
      .where(eq(txIntents.userId, auth.userId))
      .orderBy(desc(txIntents.createdAt))
      .limit(limit)
    res.json(rows)
  }),
)

// ---------- GET /tx-intents/:id ----------
txIntentsRouter.get(
  "/tx-intents/:id",
  withAuth,
  authed(async (req, res) => {
    const { auth } = req
    const { id } = req.params

    const [intent] = await db
      .select()
      .from(txIntents)
      .where(and(eq(txIntents.id, id), eq(txIntents.userId, auth.userId)))
      .limit(1)

    if (!intent) throw new NotFoundError("Intent not found")

    if (intent.status === "pending" && (await expireIfStale(intent))) {
      emitTxIntentStatus({ id, status: "expired" })
      res.json({ ...intent, status: "expired" })
      return
    }
    res.json(intent)
  }),
)

// ---------- PATCH /tx-intents/:id ----------
txIntentsRouter.patch(
  "/tx-intents/:id",
  withAuth,
  authed(async (req, res) => {
    const { auth } = req
    const { id } = req.params
    await rateLimitByIp(`tx-confirm:${auth.userId}`, 10)

    const status = (req.body ?? {}).status as string | undefined
    if (!status || !["confirmed", "failed"].includes(status)) {
      throw new ValidationError("Status must be 'confirmed' or 'failed'")
    }
    const finalStatus = status as "confirmed" | "failed"

    const [updated] = await db
      .update(txIntents)
      .set({ status: finalStatus })
      .where(
        and(
          eq(txIntents.id, id),
          eq(txIntents.userId, auth.userId),
          eq(txIntents.status, "broadcasted"),
        ),
      )
      .returning()

    if (!updated) {
      const [current] = await db
        .select()
        .from(txIntents)
        .where(and(eq(txIntents.id, id), eq(txIntents.userId, auth.userId)))
        .limit(1)
      if (!current) throw new NotFoundError("Intent not found")
      res.json(current)
      return
    }

    emitTxIntentStatus({
      id,
      status: finalStatus as TxIntentStatus,
      txHash: updated.txHash,
    })
    res.json(updated)
  }),
)

// ---------- POST /tx-intents/:id/sign ----------
txIntentsRouter.post(
  "/tx-intents/:id/sign",
  withAuth,
  authed(async (req, res) => {
    const { auth } = req
    const { id } = req.params
    await rateLimitByIp(`tx-sign:${auth.userId}`, 10)

    const { signedRaw } = (req.body ?? {}) as { signedRaw?: string }
    if (!signedRaw || !/^0x([0-9a-fA-F]{2})+$/.test(signedRaw)) {
      throw new ValidationError("Invalid signed transaction")
    }

    const [intent] = await db
      .select()
      .from(txIntents)
      .where(and(eq(txIntents.id, id), eq(txIntents.userId, auth.userId)))
      .limit(1)

    if (!intent) throw new NotFoundError("Intent not found")
    if (intent.status !== "pending") {
      throw new ValidationError(
        `Cannot sign intent in status "${intent.status}"`,
      )
    }

    await assertNotExpired(intent)

    // Independently verify the signed bytes match the authorized payload
    // before persisting them. A compromised client must not be able to
    // swap recipient/amount/asset between intent creation and signing.
    try {
      await assertSignedRawMatchesPayload(
        signedRaw as `0x${string}`,
        intent.payload as TxIntentPayload,
      )
    } catch (err) {
      if (err instanceof SignedTxMismatchError) {
        throw new ValidationError(`Signed tx does not match payload: ${err.code}`)
      }
      throw err
    }

    const [updated] = await db
      .update(txIntents)
      .set({ signedRaw, status: "signed" })
      .where(and(eq(txIntents.id, id), eq(txIntents.status, "pending")))
      .returning()

    if (!updated) throw new ValidationError("Intent already signed or expired")

    emitTxIntentStatus({ id, status: "signed" })
    res.json(updated)
  }),
)

// ---------- POST /tx-intents/:id/broadcast ----------
txIntentsRouter.post(
  "/tx-intents/:id/broadcast",
  withAuth,
  authed(async (req, res) => {
    const { auth } = req
    const { id } = req.params
    await rateLimitByIp(`tx-broadcast:${auth.userId}`, 5)

    const [claimed] = await db
      .update(txIntents)
      .set({ status: "broadcasting", updatedAt: new Date() })
      .where(
        and(
          eq(txIntents.id, id),
          eq(txIntents.userId, auth.userId),
          eq(txIntents.status, "signed"),
        ),
      )
      .returning()

    if (!claimed) {
      const [intent] = await db
        .select()
        .from(txIntents)
        .where(and(eq(txIntents.id, id), eq(txIntents.userId, auth.userId)))
        .limit(1)
      if (!intent) throw new NotFoundError("Intent not found")
      if (intent.status === "broadcasting" || intent.status === "broadcasted") {
        throw new ConflictError("Intent is already being broadcast")
      }
      throw new ValidationError(
        `Cannot broadcast intent in status "${intent.status}"`,
      )
    }

    if (!claimed.signedRaw) {
      await db
        .update(txIntents)
        .set({ status: "failed", updatedAt: new Date() })
        .where(and(eq(txIntents.id, id), eq(txIntents.status, "broadcasting")))
      emitTxIntentStatus({ id, status: "failed" })
      throw new ValidationError("No signed transaction data")
    }

    await assertNotExpired(claimed)

    emitTxIntentStatus({ id, status: "broadcasting" })

    const payload = claimed.payload as TxIntentPayload
    let txHash: string
    try {
      txHash = await broadcastRawTx(
        claimed.signedRaw as `0x${string}`,
        payload.chainId,
      )
    } catch (err) {
      await db
        .update(txIntents)
        .set({ status: "pending", signedRaw: null, updatedAt: new Date() })
        .where(and(eq(txIntents.id, id), eq(txIntents.status, "broadcasting")))
      emitTxIntentStatus({ id, status: "pending" })
      throw err
    }

    const [updated] = await db
      .update(txIntents)
      .set({
        txHash,
        status: "broadcasted",
        signedRaw: null,
        updatedAt: new Date(),
      })
      .where(and(eq(txIntents.id, id), eq(txIntents.status, "broadcasting")))
      .returning()

    emitTxIntentStatus({ id, status: "broadcasted", txHash })
    res.json(updated)
  }),
)

// ---------- POST /tx-intents/:id/retry ----------
txIntentsRouter.post(
  "/tx-intents/:id/retry",
  withAuth,
  authed(async (req, res) => {
    const { auth } = req
    const { id } = req.params
    await rateLimitByIp(`tx-retry:${auth.userId}`, 5)

    const [intent] = await db
      .select()
      .from(txIntents)
      .where(and(eq(txIntents.id, id), eq(txIntents.userId, auth.userId)))
      .limit(1)
    if (!intent) throw new NotFoundError("Intent not found")
    if (intent.status !== "failed") {
      throw new ValidationError(
        `Cannot reset intent in status "${intent.status}"`,
      )
    }

    const [updated] = await db
      .update(txIntents)
      .set({ status: "pending", signedRaw: null })
      .where(and(eq(txIntents.id, id), eq(txIntents.status, "failed")))
      .returning()

    if (!updated) throw new ValidationError("Intent already updated")

    emitTxIntentStatus({ id, status: "pending" })
    res.json(updated)
  }),
)
