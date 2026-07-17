import { and, desc, eq, inArray } from "drizzle-orm"
import { Router } from "express"
import { isHex, type Hex } from "viem"
import { z } from "zod"
import {
  db,
  businessMembers,
  paymentRequests,
  posDevices,
  refundRequests,
  txIntents,
  users,
} from "@walty/db"
import {
  ConflictError,
  NotFoundError,
  ValidationError,
} from "@walty/shared/api-utils/errors"
import {
  AUDIT_ACTIONS,
  writeAuditLog,
} from "@walty/shared/business/auditLog"
import { Permission } from "@walty/shared/permissions"
import {
  canApproveRefund,
  canExecuteRefund,
  canRejectRefund,
  canRequestRefund,
} from "@walty/shared/policies/payment.policy"
import {
  refundCreateBody,
  refundPatchBody,
} from "@walty/shared/payments/refundSchemas"
import { rateLimitByUser } from "@walty/shared/rate-limit"
import {
  TxVerificationError,
  verifyTransaction,
} from "@walty/shared/transactions/verify"
import type { TxIntentPayload } from "@walty/shared/tx-intents/types"
import { logSecurityEvent } from "@walty/shared/security/logSecurityEvent"
import { businessed } from "../middleware/typedHandlers.js"
import { validateBody } from "../middleware/validateBody.js"
import { withBusinessAuth } from "../middleware/withBusiness.js"
import { emitTxIntentStatus } from "../ws/io.js"

export const refundRequestsRouter: Router = Router()

const TX_INTENT_TTL_MS = 24 * 60 * 60 * 1000

type RefundStatus =
  | "pending"
  | "approved"
  | "approved_pending_signature"
  | "rejected"
  | "executed"

// ---------- GET /business/refund-requests ----------
refundRequestsRouter.get(
  "/business/refund-requests",
  ...withBusinessAuth(Permission.REFUND_REQUEST_LIST),
  businessed(async (req, res) => {
    const { auth, business } = req

    const statusParam = (req.query.status as string) || "pending"
    let statusFilter: RefundStatus[]
    if (statusParam === "all") {
      statusFilter = ["pending", "approved_pending_signature", "rejected", "executed"]
    } else if (statusParam === "pending") {
      statusFilter = ["pending", "approved_pending_signature"]
    } else if (
      (["approved_pending_signature", "rejected", "executed"] as string[]).includes(
        statusParam,
      )
    ) {
      statusFilter = [statusParam as RefundStatus]
    } else {
      statusFilter = ["pending", "approved_pending_signature"]
    }

    const refundWhereParts = [
      eq(refundRequests.businessId, business.businessId),
      inArray(refundRequests.status, statusFilter),
    ]
    if (!business.isOwner) {
      refundWhereParts.push(eq(paymentRequests.operatorId, auth.userId))
    }

    const rows = await db
      .select({
        id: refundRequests.id,
        paymentRequestId: refundRequests.paymentRequestId,
        requestedBy: refundRequests.requestedBy,
        amountToken: refundRequests.amountToken,
        amountUsd: refundRequests.amountUsd,
        destinationAddress: refundRequests.destinationAddress,
        reason: refundRequests.reason,
        status: refundRequests.status,
        txHash: refundRequests.txHash,
        txIntentId: refundRequests.txIntentId,
        createdAt: refundRequests.createdAt,
        reviewedAt: refundRequests.reviewedAt,
        tokenSymbol: paymentRequests.tokenSymbol,
        requestedByEmail: users.email,
      })
      .from(refundRequests)
      .innerJoin(
        paymentRequests,
        eq(refundRequests.paymentRequestId, paymentRequests.id),
      )
      .leftJoin(users, eq(refundRequests.requestedBy, users.id))
      .where(and(...refundWhereParts))
      .orderBy(desc(refundRequests.createdAt))

    res.json({
      refundRequests: rows.map((r) => ({
        id: r.id,
        paymentRequestId: r.paymentRequestId,
        requestedBy: { id: r.requestedBy, email: r.requestedByEmail },
        amountToken: r.amountToken,
        amountUsd: r.amountUsd,
        tokenSymbol: r.tokenSymbol ?? "USDC",
        destinationAddress: r.destinationAddress,
        reason: r.reason,
        status: r.status,
        txHash: r.txHash ?? null,
        txIntentId: r.txIntentId ?? null,
        createdAt: r.createdAt.toISOString(),
        reviewedAt: r.reviewedAt?.toISOString() ?? null,
      })),
    })
  }),
)

// ---------- POST /business/refund-requests ----------
refundRequestsRouter.post(
  "/business/refund-requests",
  ...withBusinessAuth(Permission.REFUND_REQUEST_CREATE),
  validateBody(refundCreateBody),
  businessed(async (req, res) => {
    const { auth, business, actor } = req
    const ip = req.clientIp

    await rateLimitByUser(auth.userId, "refund-request-create", 5)

    const {
      paymentRequestId,
      destinationAddress,
      reason,
      amountToken: overrideToken,
      amountUsd: overrideUsd,
    } = req.body as z.infer<typeof refundCreateBody>

    const [payment] = await db
      .select()
      .from(paymentRequests)
      .where(
        and(
          eq(paymentRequests.id, paymentRequestId),
          eq(paymentRequests.merchantId, business.businessId),
        ),
      )
      .limit(1)

    if (!payment) throw new NotFoundError("payment request not found")

    const policy = canRequestRefund(
      { status: payment.status, merchantId: payment.merchantId },
      business,
    )
    if (!policy.allowed) {
      logSecurityEvent({
        actor,
        action: "request_refund",
        result: "denied_policy",
        reason: policy.reason,
        ip,
        path: req.path,
      })
      throw new ValidationError(policy.reason)
    }

    let finalAmountToken = payment.receivedAmountToken ?? payment.amountToken
    let finalAmountUsd = payment.receivedAmountUsd ?? payment.amountUsd
    if (overrideToken && overrideUsd) {
      const overrideBigInt = BigInt(overrideToken)
      if (overrideBigInt <= 0n) {
        throw new ValidationError("invalid refund amount")
      }
      const capBigInt = payment.receivedAmountToken
        ? BigInt(payment.receivedAmountToken)
        : BigInt(payment.amountToken)
      if (overrideBigInt > capBigInt) {
        throw new ValidationError("refund amount exceeds collected amount")
      }
      finalAmountToken = String(overrideToken)
      finalAmountUsd = String(overrideUsd)
    }

    const [existing] = await db
      .select({ id: refundRequests.id })
      .from(refundRequests)
      .where(
        and(
          eq(refundRequests.paymentRequestId, paymentRequestId),
          inArray(refundRequests.status, [
            "pending",
            "approved_pending_signature",
          ]),
        ),
      )
      .limit(1)

    if (existing) {
      throw new ConflictError(
        "a refund request is already pending for this payment",
      )
    }

    const [refund] = await db
      .insert(refundRequests)
      .values({
        paymentRequestId,
        requestedBy: auth.userId,
        businessId: business.businessId,
        amountToken: finalAmountToken,
        amountUsd: finalAmountUsd,
        destinationAddress,
        reason: reason.trim(),
      })
      .returning()

    writeAuditLog(
      business.businessId,
      auth.userId,
      AUDIT_ACTIONS.REFUND_REQUEST_CREATED,
      {
        refundId: refund.id,
        paymentRequestId,
        amountUsd: refund.amountUsd,
      },
      ip,
    )

    res.json({ ok: true, id: refund.id })
  }),
)

// ---------- PATCH /business/refund-requests/:id ----------
refundRequestsRouter.patch(
  "/business/refund-requests/:id",
  ...withBusinessAuth(Permission.REFUND_REVIEW),
  validateBody(refundPatchBody),
  businessed(async (req, res) => {
    const { auth, business, actor } = req
    const ip = req.clientIp

    const { id } = req.params
    const { action, txHash } = req.body as z.infer<typeof refundPatchBody>

    const [refund] = await db
      .select()
      .from(refundRequests)
      .where(
        and(
          eq(refundRequests.id, id),
          eq(refundRequests.businessId, business.businessId),
        ),
      )
      .limit(1)

    if (!refund) throw new NotFoundError("refund request not found")

    const now = new Date()

    if (action === "approve") {
      const policy = canApproveRefund({ status: refund.status })
      if (!policy.allowed) {
        logSecurityEvent({
          actor,
          action: "approve_refund",
          result: "denied_policy",
          reason: policy.reason,
          ip,
          path: req.path,
        })
        throw new ValidationError(policy.reason)
      }

      const [payment] = await db
        .select()
        .from(paymentRequests)
        .where(eq(paymentRequests.id, refund.paymentRequestId))
        .limit(1)
      if (!payment) {
        throw new NotFoundError("original payment request not found")
      }

      // The refund must be signed from the child wallet that received the
      // payment (m/derivationIndex), not the owner master. POS-created payments
      // carry posDeviceId; cashier-created ones are matched by wallet address.
      let childDerivationIndex: number | null = null
      if (payment.posDeviceId != null) {
        const device = await db.query.posDevices.findFirst({
          where: eq(posDevices.id, payment.posDeviceId),
          columns: { derivationIndex: true },
        })
        childDerivationIndex = device?.derivationIndex ?? null
      } else if (payment.merchantWalletAddress) {
        const operatorMember = await db.query.businessMembers.findFirst({
          where: and(
            eq(businessMembers.businessId, business.businessId),
            eq(businessMembers.walletAddress, payment.merchantWalletAddress),
          ),
          columns: { derivationIndex: true },
        })
        childDerivationIndex = operatorMember?.derivationIndex ?? null
      }

      const decimals = payment.tokenDecimals
      const raw = BigInt(refund.amountToken)
      const divisor = BigInt(10 ** decimals)
      const whole = raw / divisor
      const frac = raw % divisor
      const fracStr = frac
        .toString()
        .padStart(decimals, "0")
        .replace(/0+$/, "")
      const amount = fracStr ? `${whole}.${fracStr}` : `${whole}`

      const payload: TxIntentPayload = {
        to: refund.destinationAddress,
        amount,
        chainId: payment.chainId,
        token: {
          symbol: payment.tokenSymbol,
          address: payment.tokenAddress,
          type: payment.tokenAddress ? "erc20" : "native",
          decimals,
        },
        from: payment.merchantWalletAddress,
      }
      if (childDerivationIndex != null) {
        payload.derivationIndex = childDerivationIndex
      }

      const [intent] = await db
        .insert(txIntents)
        .values({
          userId: payment.merchantId,
          type: "refund",
          payload,
          status: "pending",
          expiresAt: new Date(now.getTime() + TX_INTENT_TTL_MS),
        })
        .returning()

      await db
        .update(refundRequests)
        .set({
          status: "approved_pending_signature",
          reviewedAt: now,
          reviewedBy: auth.userId,
          approvedBy: auth.userId,
          approvedAt: now,
          txIntentId: intent.id,
        })
        .where(eq(refundRequests.id, id))

      writeAuditLog(
        business.businessId,
        auth.userId,
        AUDIT_ACTIONS.REFUND_REQUEST_APPROVED,
        {
          refundId: id,
          txIntentId: intent.id,
          requestedBy: refund.requestedBy,
          requestedAt: refund.createdAt.toISOString(),
        },
        ip,
      )

      emitTxIntentStatus({ id: intent.id, status: "pending" })

      res.json({ ok: true, txIntentId: intent.id })
      return
    }

    if (action === "reject") {
      const policy = canRejectRefund({ status: refund.status })
      if (!policy.allowed) {
        logSecurityEvent({
          actor,
          action: "reject_refund",
          result: "denied_policy",
          reason: policy.reason,
          ip,
          path: req.path,
        })
        throw new ValidationError(policy.reason)
      }
      await db
        .update(refundRequests)
        .set({ status: "rejected", reviewedAt: now, reviewedBy: auth.userId })
        .where(eq(refundRequests.id, id))

      writeAuditLog(
        business.businessId,
        auth.userId,
        AUDIT_ACTIONS.REFUND_REQUEST_REJECTED,
        {
          refundId: id,
          requestedBy: refund.requestedBy,
          requestedAt: refund.createdAt.toISOString(),
        },
        ip,
      )
      res.json({ ok: true })
      return
    }

    if (action === "mark_executed") {
      const policy = canExecuteRefund({ status: refund.status })
      if (!policy.allowed) {
        logSecurityEvent({
          actor,
          action: "execute_refund",
          result: "denied_policy",
          reason: policy.reason,
          ip,
          path: req.path,
        })
        throw new ValidationError(policy.reason)
      }
      if (!txHash || typeof txHash !== "string" || !isHex(txHash)) {
        throw new ValidationError(
          "txHash is required and must be a valid hex hash",
        )
      }

      let alreadyVerified = false
      if (refund.txIntentId) {
        const [intent] = await db
          .select()
          .from(txIntents)
          .where(eq(txIntents.id, refund.txIntentId))
          .limit(1)

        if (
          intent &&
          intent.status === "confirmed" &&
          intent.txHash === txHash
        ) {
          alreadyVerified = true
        }
      }

      if (!alreadyVerified) {
        const [payment] = await db
          .select()
          .from(paymentRequests)
          .where(eq(paymentRequests.id, refund.paymentRequestId))
          .limit(1)
        if (!payment) {
          throw new NotFoundError("original payment request not found")
        }

        let verified
        for (let attempt = 0; attempt < 3; attempt++) {
          try {
            verified = await verifyTransaction(txHash as Hex, {
              chainId: payment.chainId,
              from: payment.merchantWalletAddress,
              to: refund.destinationAddress,
              tokenAddress: payment.tokenAddress || undefined,
            })
            break
          } catch (err) {
            if (err instanceof TxVerificationError) {
              throw new ValidationError(
                `Refund tx verification failed: ${err.message}`,
              )
            }
            if (attempt < 2) {
              await new Promise((r) => setTimeout(r, 2_000))
              continue
            }
            throw new ValidationError(
              "Refund transaction not found on-chain — RPC may be temporarily unavailable",
            )
          }
        }

        if (!verified || verified.status !== "confirmed") {
          throw new ValidationError(
            "Refund transaction has not been confirmed on-chain",
          )
        }
      }

      await db
        .update(refundRequests)
        .set({ status: "executed", txHash })
        .where(eq(refundRequests.id, id))

      writeAuditLog(
        business.businessId,
        auth.userId,
        AUDIT_ACTIONS.REFUND_REQUEST_EXECUTED,
        {
          refundId: id,
          txHash,
          requestedBy: refund.requestedBy,
          requestedAt: refund.createdAt.toISOString(),
          approvedBy: refund.approvedBy,
          approvedAt: refund.approvedAt?.toISOString() ?? null,
        },
        ip,
      )
      res.json({ ok: true })
      return
    }

    throw new ValidationError("invalid action")
  }),
)
