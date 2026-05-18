import { NextRequest } from "next/server"
import { createHash } from "crypto"
import { eq, and, desc } from "drizzle-orm"
import { db } from "@walty/db"
import { txIntents } from "@walty/db"
import { withErrorHandling, withAuth, ok, ValidationError, ConflictError } from "@/lib/api"
import { rateLimitByIp } from "@walty/shared/rate-limit"
import { isUniqueViolation } from "@walty/shared/db-errors"
import { validateAndNormalizePayload } from "@walty/shared/tx-intents/validate"
import { expireIfStale } from "@walty/shared/tx-intents/expire"
import type { TxIntentPayload, TxIntentType } from "@walty/shared/tx-intents/types"

function canonicalStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value)
  if (Array.isArray(value)) {
    return "[" + value.map(canonicalStringify).join(",") + "]"
  }
  const keys = Object.keys(value as Record<string, unknown>).sort()
  return (
    "{" +
    keys.map((k) => JSON.stringify(k) + ":" + canonicalStringify((value as Record<string, unknown>)[k])).join(",") +
    "}"
  )
}

function hashPayload(payload: TxIntentPayload, type: TxIntentType): string {
  return createHash("sha256")
    .update(type + "|" + canonicalStringify(payload))
    .digest("hex")
}

const VALID_TYPES: TxIntentType[] = [
  "transfer",
  "refund",
  "gas_funding",
  "collection",
]

const INTENT_TTL_MS = 5 * 60 * 1000 // 5 minutes

export const POST = withErrorHandling(withAuth(async (req: NextRequest, { auth }) => {
  await rateLimitByIp(`tx-create:${auth.userId}`, 10)

  const body = await req.json()
  const { payload, idempotencyKey, type: rawType } = body as {
    payload: TxIntentPayload
    idempotencyKey?: string
    type?: string
  }
  const intentType: TxIntentType = rawType && VALID_TYPES.includes(rawType as TxIntentType)
    ? (rawType as TxIntentType)
    : "transfer"

  if (!payload) throw new ValidationError("Missing payload")

  try {
    validateAndNormalizePayload(payload)
  } catch (err) {
    throw new ValidationError(err instanceof Error ? err.message : "Invalid payload")
  }

  const payloadHash = hashPayload(payload, intentType)

  // Idempotency: same key + same payload returns the existing intent. A
  // mismatched payload with a reused key is a programming error and must
  // never silently sign a different transaction.
  if (idempotencyKey) {
    const [existing] = await db
      .select()
      .from(txIntents)
      .where(
        and(
          eq(txIntents.userId, auth.userId),
          eq(txIntents.idempotencyKey, idempotencyKey)
        )
      )
      .limit(1)

    if (existing) {
      if (!(await expireIfStale(existing))) {
        if (existing.payloadHash && existing.payloadHash !== payloadHash) {
          throw new ConflictError("idempotency-key-payload-mismatch")
        }
        return ok(existing)
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

    return ok(intent)
  } catch (err) {
    if (idempotencyKey && isUniqueViolation(err)) {
      const [existing] = await db
        .select()
        .from(txIntents)
        .where(
          and(
            eq(txIntents.userId, auth.userId),
            eq(txIntents.idempotencyKey, idempotencyKey)
          )
        )
        .limit(1)

      if (existing) {
        if (existing.payloadHash && existing.payloadHash !== payloadHash) {
          throw new ConflictError("idempotency-key-payload-mismatch")
        }
        return ok(existing)
      }

      throw new ConflictError("idempotency-key-conflict")
    }

    throw err
  }
}))

export const GET = withErrorHandling(withAuth(async (req: NextRequest, { auth }) => {
  const { searchParams } = new URL(req.url)
  const rawLimit = parseInt(searchParams.get("limit") ?? "", 10)
  const limit = Math.min(Number.isFinite(rawLimit) && rawLimit >= 1 ? rawLimit : 20, 100)

  const rows = await db
    .select()
    .from(txIntents)
    .where(eq(txIntents.userId, auth.userId))
    .orderBy(desc(txIntents.createdAt))
    .limit(limit)

  return ok(rows)
}))
