import { NextRequest } from "next/server"
import { eq, and, desc } from "drizzle-orm"
import { db } from "@/server/db"
import { txIntents } from "@/server/db/schema"
import { withErrorHandling, withAuth, ok, ValidationError, ConflictError } from "@/lib/api"
import { rateLimitByIp } from "@/lib/rate-limit"
import { isUniqueViolation } from "@/lib/db/errors"
import { validateAndNormalizePayload } from "@/lib/tx-intents/validate"
import { expireIfStale } from "@/lib/tx-intents/expire"
import type { TxIntentPayload, TxIntentType } from "@/lib/tx-intents/types"

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

  // Idempotency: if key already exists for this user, return existing intent
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
        return ok(existing)
      }
      // Intent was expired; fall through to create a new one
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
        status: "pending",
        idempotencyKey: idempotencyKey ?? null,
        expiresAt,
      })
      .returning()

    return ok(intent)
  } catch (err) {
    // Two concurrent requests with the same idempotencyKey can both pass the
    // existence check above and then race to insert.  The second insert hits the
    // unique constraint; treat it as an idempotent success by returning the row
    // that the first request created.
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

      if (existing) return ok(existing)

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
