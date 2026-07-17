import { Router } from "express"
import { and, asc, desc, eq, inArray, isNull } from "drizzle-orm"
import { z } from "zod"
import {
  db,
  addresses,
  paymentRequests,
  splitPaymentContributions,
} from "@walty/db"
import {
  ConflictError,
  NotFoundError,
  ValidationError,
} from "@walty/shared/api-utils/errors"
import { getIp } from "@walty/shared/api-utils/get-ip"
import type { PaymentRequestHistoryItem } from "@walty/shared/activity/types"
import {
  AUDIT_ACTIONS,
  writeAuditLog,
} from "@walty/shared/business/auditLog"
import {
  toPaymentRequestView,
  toPublicPaymentRequestView,
} from "@walty/shared/payments/paymentRequests"
import { reconcilePendingPaymentRequests } from "@walty/shared/payments/reconcilePendingPaymentRequests"
import {
  paymentRequestCancelBody,
  paymentRequestCreateBody,
} from "@walty/shared/payments/schemas"
import type { SplitPaymentContribution } from "@walty/shared/payments/types"
import { Permission } from "@walty/shared/permissions"
import { canCancelPayment } from "@walty/shared/policies/payment.policy"
import { rateLimitByIp, rateLimitByUser } from "@walty/shared/rate-limit"
import { logSecurityEvent } from "@walty/shared/security/logSecurityEvent"
import { asyncHandler } from "../middleware/asyncHandler.js"
import { createPaymentRequestRecord } from "../services/paymentRequestService.js"
import { businessed } from "../middleware/typedHandlers.js"
import { validateBody } from "../middleware/validateBody.js"
import { withBusinessAuth } from "../middleware/withBusiness.js"
import {
  emitBusinessActiveChanged,
  emitPaymentRequestEvent,
} from "../ws/io.js"
import { reconcilerSink } from "../ws/reconcilerSink.js"

export const paymentRequestsRouter: Router = Router()

// ---------- /payment-requests (merchant) ----------
paymentRequestsRouter.get(
  "/payment-requests",
  ...withBusinessAuth(Permission.PAYMENT_REQUEST_READ),
  businessed(async (req, res) => {
    const { auth, business } = req

    const baseWhere = and(
      eq(paymentRequests.merchantId, business.businessId),
      inArray(paymentRequests.status, ["pending", "confirming"]),
    )
    // The home "active collection" card is the owner's OWN active charge — not
    // a cashier's or a POS terminal's — so those never hijack the owner's collect
    // flow. (A POS charge has operatorId null like an owner one, so exclude it by
    // posDeviceId too.) The owner still sees the whole business in activity/history.
    const whereClause = business.isOwner
      ? and(
          baseWhere,
          isNull(paymentRequests.operatorId),
          isNull(paymentRequests.posDeviceId),
        )
      : and(baseWhere, eq(paymentRequests.operatorId, auth.userId))

    const [request] = await db
      .select()
      .from(paymentRequests)
      .where(whereClause)
      .orderBy(desc(paymentRequests.createdAt))
      .limit(1)

    res.json({ request: request ? toPaymentRequestView(request) : null })
  }),
)

paymentRequestsRouter.patch(
  "/payment-requests",
  ...withBusinessAuth(Permission.PAYMENT_REQUEST_CANCEL),
  validateBody(paymentRequestCancelBody),
  businessed(async (req, res) => {
    const { auth, business, actor } = req
    const ip = req.clientIp

    const { id } = req.body as z.infer<typeof paymentRequestCancelBody>

    const [request] = await db
      .select()
      .from(paymentRequests)
      .where(
        and(
          eq(paymentRequests.id, id),
          eq(paymentRequests.merchantId, business.businessId),
        ),
      )
      .limit(1)

    if (!request) throw new NotFoundError("payment request not found")

    const policy = canCancelPayment(
      { status: request.status, merchantId: request.merchantId },
      business,
    )
    if (!policy.allowed) {
      logSecurityEvent({
        actor,
        action: "cancel_payment",
        result: "denied_policy",
        reason: policy.reason,
        ip,
        path: req.path,
      })
      throw new ValidationError(policy.reason)
    }

    // Status-guarded update (see the POS cancel route): gating on
    // status="pending" makes the cancel atomic against a concurrent reconciler
    // `paid` transition. 0 rows means the request is no longer cancellable.
    const [updated] = await db
      .update(paymentRequests)
      .set({ status: "cancelled", updatedAt: new Date() })
      .where(
        and(
          eq(paymentRequests.id, id),
          eq(paymentRequests.status, "pending"),
        ),
      )
      .returning()

    if (!updated) {
      throw new ConflictError("payment request is no longer cancellable")
    }

    writeAuditLog(
      business.businessId,
      auth.userId,
      AUDIT_ACTIONS.PAYMENT_REQUEST_CANCELLED,
      { requestId: id },
      ip,
    )

    emitPaymentRequestEvent({
      type: "cancelled",
      requestId: id,
      merchantId: business.businessId,
    })
    emitBusinessActiveChanged(business.businessId)

    res.json(toPaymentRequestView(updated))
  }),
)

paymentRequestsRouter.post(
  "/payment-requests",
  ...withBusinessAuth(Permission.PAYMENT_REQUEST_CREATE),
  validateBody(paymentRequestCreateBody),
  businessed(async (req, res) => {
    const { auth, business } = req
    const ip = req.clientIp

    await rateLimitByUser(auth.userId, "payment-request-create", 10)

    const { amountUsd, token, merchantWalletAddress, isSplitPayment } =
      req.body as z.infer<typeof paymentRequestCreateBody>

    if (business.isOwner) {
      const linkedAddress = await db.query.addresses.findFirst({
        where: and(
          eq(addresses.userId, business.businessId),
          eq(addresses.address, merchantWalletAddress),
        ),
      })
      if (!linkedAddress) {
        throw new ValidationError(
          "merchant wallet address is not linked to this account",
        )
      }
    } else {
      if (
        !business.walletAddress ||
        merchantWalletAddress.toLowerCase() !==
          business.walletAddress.toLowerCase()
      ) {
        throw new ValidationError(
          "merchant wallet address does not match your assigned wallet",
        )
      }
    }

    const request = await createPaymentRequestRecord({
      merchantId: business.businessId,
      merchantWalletAddress,
      amountUsd,
      token,
      isSplitPayment,
      operatorId: business.isOwner ? null : auth.userId,
    })

    writeAuditLog(
      business.businessId,
      auth.userId,
      AUDIT_ACTIONS.PAYMENT_REQUEST_CREATED,
      {
        requestId: request.id,
        amountUsd,
        token,
        operatorId: business.isOwner ? null : auth.userId,
      },
      ip,
    )

    emitBusinessActiveChanged(business.businessId)

    res.json(toPaymentRequestView(request))
  }),
)

// ---------- /payment-requests/history (merchant) ----------
paymentRequestsRouter.get(
  "/payment-requests/history",
  ...withBusinessAuth(Permission.PAYMENT_HISTORY_READ),
  businessed(async (req, res) => {
    const { auth, business } = req

    const statusParam = (req.query.status as string) || "all"
    const limit = Math.min(Number(req.query.limit ?? 50), 100)
    const offset = Number(req.query.offset ?? 0)

    const statusFilter =
      statusParam === "paid"
        ? ["paid"]
        : statusParam === "expired"
          ? ["expired"]
          : statusParam === "pending"
            ? ["pending"]
            : statusParam === "confirming"
              ? ["confirming"]
              : ["paid", "expired", "pending", "confirming"]

    const whereParts = [
      eq(paymentRequests.merchantId, business.businessId),
      inArray(paymentRequests.status, statusFilter),
    ]
    if (!business.isOwner) {
      whereParts.push(eq(paymentRequests.operatorId, auth.userId))
    }

    const rows = await db
      .select()
      .from(paymentRequests)
      .where(and(...whereParts))
      .orderBy(desc(paymentRequests.createdAt))
      .limit(limit)
      .offset(offset)

    const items: PaymentRequestHistoryItem[] = rows.map((row) => {
      let receivedAmountUsd: string | null = null
      if (row.status === "paid" && row.receivedAmountToken && row.amountToken) {
        const amountTokenBig = BigInt(row.amountToken)
        if (amountTokenBig > 0n) {
          const received =
            (parseFloat(row.amountUsd) *
              Number(BigInt(row.receivedAmountToken))) /
            Number(amountTokenBig)
          receivedAmountUsd = received.toFixed(2)
        }
      }
      return {
        id: row.id,
        status: row.status as "pending" | "confirming" | "paid" | "expired",
        amountUsd: row.amountUsd,
        receivedAmountUsd,
        tokenSymbol: row.tokenSymbol,
        createdAt: row.createdAt.toISOString(),
        paidAt: row.paidAt?.toISOString() ?? null,
        txHash: row.txHash,
        chainId: row.chainId,
        payerAddress: row.payerAddress,
      }
    })

    res.json({ items, total: items.length })
  }),
)

// ---------- /payment-requests/:id (public) ----------
paymentRequestsRouter.get(
  "/payment-requests/:id",
  asyncHandler(async (req, res) => {
    await rateLimitByIp(`payment-request-poll:${getIp(req)}`, 60, 60_000)

    const { id } = req.params

    // Ids are v4 UUIDs; reject anything else before it reaches the DB, otherwise
    // Postgres throws on the uuid cast and this public endpoint 500s.
    if (!z.string().uuid().safeParse(id).success) {
      throw new NotFoundError("not found")
    }

    await reconcilePendingPaymentRequests({ id, onEvent: reconcilerSink }).catch((err) => {
      // eslint-disable-next-line no-console
      console.error("[payment-requests/:id] reconcile error:", err)
    })

    const request = await db.query.paymentRequests.findFirst({
      where: eq(paymentRequests.id, id),
    })
    if (!request) throw new NotFoundError("not found")

    const view = toPublicPaymentRequestView(request)

    let contributionsSummary:
      | { count: number; confirmedCount: number }
      | undefined
    if (view.isSplitPayment) {
      const allCount = await db
        .select({
          id: splitPaymentContributions.id,
          status: splitPaymentContributions.status,
        })
        .from(splitPaymentContributions)
        .where(eq(splitPaymentContributions.paymentRequestId, id))
      const confirmedCount = await db
        .select({ id: splitPaymentContributions.id })
        .from(splitPaymentContributions)
        .where(
          and(
            eq(splitPaymentContributions.paymentRequestId, id),
            eq(splitPaymentContributions.status, "confirmed"),
          ),
        )
      contributionsSummary = {
        count: allCount.length,
        confirmedCount: confirmedCount.length,
      }
    }

    res.json({ ...view, contributionsSummary })
  }),
)

// ---------- /payment-requests/:id/contributions (public) ----------
paymentRequestsRouter.get(
  "/payment-requests/:id/contributions",
  asyncHandler(async (req, res) => {
    await rateLimitByIp(`contributions-poll:${getIp(req)}`, 30, 60_000)

    const { id } = req.params

    // Ids are v4 UUIDs; reject anything else before it reaches the DB (public
    // endpoint — a malformed id would otherwise 500 on the Postgres uuid cast).
    if (!z.string().uuid().safeParse(id).success) {
      throw new NotFoundError("not found")
    }

    const request = await db.query.paymentRequests.findFirst({
      where: eq(paymentRequests.id, id),
      columns: {
        id: true,
        totalPaidUsd: true,
        amountUsd: true,
        status: true,
      },
    })
    if (!request) throw new NotFoundError("not found")

    const all = await db
      .select({
        id: splitPaymentContributions.id,
        status: splitPaymentContributions.status,
      })
      .from(splitPaymentContributions)
      .where(eq(splitPaymentContributions.paymentRequestId, id))

    const confirmed = await db
      .select({ id: splitPaymentContributions.id })
      .from(splitPaymentContributions)
      .where(
        and(
          eq(splitPaymentContributions.paymentRequestId, id),
          eq(splitPaymentContributions.status, "confirmed"),
        ),
      )

    const amountUsd = parseFloat(request.amountUsd)
    const paidUsd = parseFloat(request.totalPaidUsd ?? "0")

    res.json({
      count: all.length,
      confirmedCount: confirmed.length,
      totalPaidUsd: request.totalPaidUsd ?? "0",
      fullyPaid: paidUsd >= amountUsd,
      status: request.status,
    })
  }),
)

// ---------- /business/payment-requests/:id (merchant, full detail) ----------
paymentRequestsRouter.get(
  "/business/payment-requests/:id",
  ...withBusinessAuth(Permission.PAYMENT_REQUEST_READ),
  businessed(async (req, res) => {
    const { business } = req
    const { id } = req.params

    await reconcilePendingPaymentRequests({ id, onEvent: reconcilerSink }).catch((err) => {
      // eslint-disable-next-line no-console
      console.error("[business/payment-requests/:id] reconcile error:", err)
    })

    const request = await db.query.paymentRequests.findFirst({
      where: and(
        eq(paymentRequests.id, id),
        eq(paymentRequests.merchantId, business.businessId),
      ),
    })
    if (!request) throw new NotFoundError("not found")

    const view = toPaymentRequestView(request)

    if (view.isSplitPayment) {
      const contributions = await db
        .select()
        .from(splitPaymentContributions)
        .where(eq(splitPaymentContributions.paymentRequestId, id))
        .orderBy(asc(splitPaymentContributions.createdAt))

      view.contributions = contributions.map((c) => ({
        id: c.id,
        paymentRequestId: c.paymentRequestId,
        txHash: c.txHash,
        payerAddress: c.payerAddress,
        amountToken: c.amountToken,
        amountUsd: c.amountUsd,
        tokenSymbol: c.tokenSymbol,
        confirmations: c.confirmations,
        status: c.status as SplitPaymentContribution["status"],
        blockNumber: c.blockNumber ?? null,
        detectedAt: c.detectedAt?.toISOString() ?? null,
        confirmedAt: c.confirmedAt?.toISOString() ?? null,
        createdAt: c.createdAt.toISOString(),
      }))
    }

    res.json(view)
  }),
)
