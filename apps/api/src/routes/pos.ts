import { and, desc, eq, inArray } from "drizzle-orm"
import { Router } from "express"
import { z } from "zod"
import { db, paymentRequests, posDevices, refundRequests } from "@walty/db"
import {
  ConflictError,
  NotFoundError,
  ValidationError,
} from "@walty/shared/api-utils/errors"
import { AUDIT_ACTIONS, writeAuditLog } from "@walty/shared/business/auditLog"
import { getActiveMpcKey } from "@walty/shared/business/mpcStatus"
import { isUniqueViolation } from "@walty/shared/db-errors"
import { toPaymentRequestView } from "@walty/shared/payments/paymentRequests"
import { refundCreateBody } from "@walty/shared/payments/refundSchemas"
import { canCancelPayment, canRequestRefund } from "@walty/shared/policies/payment.policy"
import { Permission } from "@walty/shared/permissions"
import { rateLimitByIp } from "@walty/shared/rate-limit"
import { logSecurityEvent } from "@walty/shared/security/logSecurityEvent"
import {
  posDeviceCreateBody,
  posPaymentCreateBody,
} from "@walty/shared/pos/schemas"
import { registerChildAddress } from "../services/mpc/MpcServerParty.js"
import { getNextDerivationIndex } from "../services/derivationIndex.js"
import { createPaymentRequestRecord } from "../services/paymentRequestService.js"
import { businessed, posed } from "../middleware/typedHandlers.js"
import { validateBody } from "../middleware/validateBody.js"
import { withBusinessAuth } from "../middleware/withBusiness.js"
import { withPosAuth } from "../middleware/withPos.js"
import {
  emitBusinessActiveChanged,
  emitPaymentRequestEvent,
} from "../ws/io.js"

export const posRouter: Router = Router()

// =====================================================================
// Owner-facing management (dashboard)
// =====================================================================

function toPosView(row: typeof posDevices.$inferSelect) {
  return {
    id: row.id,
    name: row.name,
    status: row.status,
    walletAddress: row.walletAddress,
    derivationIndex: row.derivationIndex,
    lastSeenAt: row.lastSeenAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    revokedAt: row.revokedAt?.toISOString() ?? null,
  }
}

// ---------- GET /business/pos ----------
posRouter.get(
  "/business/pos",
  ...withBusinessAuth(Permission.POS_MANAGE),
  businessed(async (req, res) => {
    const { business } = req
    const rows = await db
      .select()
      .from(posDevices)
      .where(eq(posDevices.businessId, business.businessId))
      .orderBy(desc(posDevices.createdAt))
    res.json({ devices: rows.map(toPosView) })
  }),
)

// ---------- GET /business/pos/next-index ----------
posRouter.get(
  "/business/pos/next-index",
  ...withBusinessAuth(Permission.POS_MANAGE),
  businessed(async (req, res) => {
    const { business } = req
    const nextIndex = await getNextDerivationIndex(business.businessId)
    res.json({ nextIndex })
  }),
)

// ---------- POST /business/pos ----------
posRouter.post(
  "/business/pos",
  ...withBusinessAuth(Permission.POS_MANAGE),
  validateBody(posDeviceCreateBody),
  businessed(async (req, res) => {
    const { auth, business } = req
    const ip = req.clientIp

    const { name, publicKey, derivationIndex, walletAddress } =
      req.body as z.infer<typeof posDeviceCreateBody>

    const indexTaken = await db.query.posDevices.findFirst({
      where: and(
        eq(posDevices.businessId, business.businessId),
        eq(posDevices.derivationIndex, derivationIndex),
      ),
      columns: { id: true },
    })
    if (indexTaken) {
      throw new ValidationError("derivation index already in use for this business")
    }

    let device: typeof posDevices.$inferSelect
    try {
      ;[device] = await db
        .insert(posDevices)
        .values({
          businessId: business.businessId,
          name: name.trim(),
          publicKey: publicKey.toLowerCase(),
          derivationIndex,
          walletAddress,
          status: "pending",
        })
        .returning()
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new ValidationError("derivation-index-conflict")
      }
      throw err
    }

    // MPC business: register the HD child (m/derivationIndex) the owner just
    // derived so the sign ceremony can later assemble child signatures for this
    // terminal's sweeps/refunds. Mirrors the cashier invite flow.
    const mpcKey = await getActiveMpcKey(business.businessId)
    if (mpcKey) {
      try {
        await registerChildAddress(mpcKey.keyId, derivationIndex, walletAddress)
      } catch (err) {
        // Roll back the device so a failed registration doesn't leave an orphan
        // holding a derivation index with a key that only existed in the browser.
        await db.delete(posDevices).where(eq(posDevices.id, device.id))
        throw err
      }
    }

    writeAuditLog(
      business.businessId,
      auth.userId,
      AUDIT_ACTIONS.POS_DEVICE_CREATED,
      { posDeviceId: device.id, name: device.name, derivationIndex, walletAddress },
      ip,
    )

    res.json(toPosView(device))
  }),
)

// ---------- DELETE /business/pos/:id ----------
posRouter.delete(
  "/business/pos/:id",
  ...withBusinessAuth(Permission.POS_MANAGE),
  businessed(async (req, res) => {
    const { auth, business } = req
    const ip = req.clientIp

    const id = Number(req.params.id)
    if (!Number.isInteger(id)) throw new ValidationError("invalid pos id")

    const [device] = await db
      .select()
      .from(posDevices)
      .where(
        and(eq(posDevices.id, id), eq(posDevices.businessId, business.businessId)),
      )
      .limit(1)
    if (!device) throw new NotFoundError("pos device not found")

    if (device.status !== "revoked") {
      await db
        .update(posDevices)
        .set({ status: "revoked", revokedAt: new Date() })
        .where(eq(posDevices.id, id))

      writeAuditLog(
        business.businessId,
        auth.userId,
        AUDIT_ACTIONS.POS_DEVICE_REVOKED,
        { posDeviceId: id, name: device.name },
        ip,
      )
    }

    res.json({ ok: true })
  }),
)

// =====================================================================
// POS-facing operation (signed by the device)
// =====================================================================

// ---------- POST /pos/payment-requests ----------
posRouter.post(
  "/pos/payment-requests",
  ...withPosAuth(Permission.PAYMENT_REQUEST_CREATE),
  validateBody(posPaymentCreateBody),
  posed(async (req, res) => {
    const { pos } = req
    const ip = req.clientIp

    await rateLimitByIp(`pos:${pos.id}:payment-request-create`, 30)

    const { amountUsd, token, isSplitPayment } =
      req.body as z.infer<typeof posPaymentCreateBody>

    // The destination is always the device's own derived child wallet.
    const request = await createPaymentRequestRecord({
      merchantId: pos.businessId,
      merchantWalletAddress: pos.walletAddress,
      amountUsd,
      token,
      isSplitPayment,
      operatorId: null,
      posDeviceId: pos.id,
    })

    writeAuditLog(
      pos.businessId,
      pos.businessId,
      AUDIT_ACTIONS.PAYMENT_REQUEST_CREATED,
      { requestId: request.id, amountUsd, token, posDeviceId: pos.id },
      ip,
    )

    emitBusinessActiveChanged(pos.businessId)

    res.json(toPaymentRequestView(request))
  }),
)

// ---------- PATCH /pos/payment-requests/:id/cancel ----------
posRouter.patch(
  "/pos/payment-requests/:id/cancel",
  ...withPosAuth(Permission.PAYMENT_REQUEST_CANCEL),
  posed(async (req, res) => {
    const { pos, actor } = req
    const ip = req.clientIp

    const { id } = req.params

    const [request] = await db
      .select()
      .from(paymentRequests)
      .where(
        and(
          eq(paymentRequests.id, id),
          eq(paymentRequests.merchantId, pos.businessId),
          eq(paymentRequests.posDeviceId, pos.id),
        ),
      )
      .limit(1)

    if (!request) throw new NotFoundError("payment request not found")

    const policy = canCancelPayment(
      { status: request.status, merchantId: request.merchantId },
      req.business,
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

    const [updated] = await db
      .update(paymentRequests)
      .set({ status: "cancelled", updatedAt: new Date() })
      .where(eq(paymentRequests.id, id))
      .returning()

    writeAuditLog(
      pos.businessId,
      pos.businessId,
      AUDIT_ACTIONS.PAYMENT_REQUEST_CANCELLED,
      { requestId: id, posDeviceId: pos.id },
      ip,
    )

    emitPaymentRequestEvent({
      type: "cancelled",
      requestId: id,
      merchantId: pos.businessId,
    })
    emitBusinessActiveChanged(pos.businessId)

    res.json(toPaymentRequestView(updated))
  }),
)

// ---------- POST /pos/refund-requests ----------
posRouter.post(
  "/pos/refund-requests",
  ...withPosAuth(Permission.REFUND_REQUEST_CREATE),
  validateBody(refundCreateBody),
  posed(async (req, res) => {
    const { pos, actor } = req
    const ip = req.clientIp

    await rateLimitByIp(`pos:${pos.id}:refund-request-create`, 10)

    const {
      paymentRequestId,
      destinationAddress,
      reason,
      amountToken: overrideToken,
      amountUsd: overrideUsd,
    } = req.body as z.infer<typeof refundCreateBody>

    // A POS can only refund a payment it itself created.
    const [payment] = await db
      .select()
      .from(paymentRequests)
      .where(
        and(
          eq(paymentRequests.id, paymentRequestId),
          eq(paymentRequests.merchantId, pos.businessId),
          eq(paymentRequests.posDeviceId, pos.id),
        ),
      )
      .limit(1)

    if (!payment) throw new NotFoundError("payment request not found")

    const policy = canRequestRefund(
      { status: payment.status, merchantId: payment.merchantId },
      req.business,
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

    let finalAmountToken = payment.amountToken
    let finalAmountUsd = payment.amountUsd
    if (overrideToken && overrideUsd) {
      const overrideBigInt = BigInt(overrideToken)
      if (overrideBigInt <= 0n) throw new ValidationError("invalid refund amount")
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
          inArray(refundRequests.status, ["pending", "approved_pending_signature"]),
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
        requestedBy: null,
        posDeviceId: pos.id,
        businessId: pos.businessId,
        amountToken: finalAmountToken,
        amountUsd: finalAmountUsd,
        destinationAddress,
        reason: reason.trim(),
      })
      .returning()

    writeAuditLog(
      pos.businessId,
      pos.businessId,
      AUDIT_ACTIONS.REFUND_REQUEST_CREATED,
      { refundId: refund.id, paymentRequestId, amountUsd: refund.amountUsd, posDeviceId: pos.id },
      ip,
    )

    res.json({ ok: true, id: refund.id })
  }),
)
