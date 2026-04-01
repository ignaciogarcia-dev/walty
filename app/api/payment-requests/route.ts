import { NextRequest } from "next/server"
import { and, desc, eq, inArray } from "drizzle-orm"
import { parseUnits, isAddress } from "viem"
import { rateLimitByUser } from "@/lib/rate-limit"
import { canCancelPayment } from "@/lib/policies/payment.policy"
import { logSecurityEvent } from "@/lib/security/logSecurityEvent"
import {
  PAYMENT_CHAIN_ID,
  PAYMENT_EXPIRY_MINUTES,
  PAYMENT_REQUIRED_CONFIRMATIONS,
  getPaymentTokenDefinition,
  isPaymentTokenSymbol,
} from "@/lib/payments/config"
import { toPaymentRequestView } from "@/lib/payments/paymentRequests"
import { db } from "@/server/db"
import { addresses, paymentRequests } from "@/server/db/schema"
import { getPublicClient } from "@/lib/rpc/getPublicClient"
import { writeAuditLog, AUDIT_ACTIONS } from "@/lib/business/auditLog"
import { withBusinessAuth, ok, ValidationError, NotFoundError } from "@/lib/api"
import { Permission } from "@/lib/permissions"

export const GET = withBusinessAuth(Permission.PAYMENT_REQUEST_READ, async (_req: NextRequest, { auth, business }) => {
  const baseWhere = and(
    eq(paymentRequests.merchantId, business.businessId),
    inArray(paymentRequests.status, ["pending", "confirming"])
  )

  const whereClause = business.isOwner
    ? baseWhere
    : and(baseWhere, eq(paymentRequests.operatorId, auth.userId))

  const [request] = await db
    .select()
    .from(paymentRequests)
    .where(whereClause)
    .orderBy(desc(paymentRequests.createdAt))
    .limit(1)

  return ok({ request: request ? toPaymentRequestView(request) : null })
})

export const PATCH = withBusinessAuth(Permission.PAYMENT_REQUEST_CANCEL, async (req: NextRequest, { auth, business, actor, ip }) => {
  const { id } = await req.json()
  if (!id || typeof id !== "string") throw new ValidationError("invalid id")

  const [request] = await db
    .select()
    .from(paymentRequests)
    .where(and(eq(paymentRequests.id, id), eq(paymentRequests.merchantId, business.businessId)))
    .limit(1)

  if (!request) throw new NotFoundError("payment request not found")

  const policy = canCancelPayment({ status: request.status, merchantId: request.merchantId }, business)
  if (!policy.allowed) {
    logSecurityEvent({ actor, action: "cancel_payment", result: "denied_policy", reason: policy.reason, ip, path: req.nextUrl.pathname })
    throw new ValidationError(policy.reason)
  }

  const [updated] = await db
    .update(paymentRequests)
    .set({ status: "cancelled", updatedAt: new Date() })
    .where(eq(paymentRequests.id, id))
    .returning()

  writeAuditLog(business.businessId, auth.userId, AUDIT_ACTIONS.PAYMENT_REQUEST_CANCELLED, { requestId: id }, ip)

  return ok(toPaymentRequestView(updated))
})

export const POST = withBusinessAuth(Permission.PAYMENT_REQUEST_CREATE, async (req: NextRequest, { auth, business, ip }) => {
  await rateLimitByUser(auth.userId, 10)

  const { amountUsd, token, merchantWalletAddress, isSplitPayment } = await req.json()

  if (!isPaymentTokenSymbol(token)) throw new ValidationError("token must be USDC or USDT")

  const amount = parseFloat(amountUsd)
  if (!amountUsd || isNaN(amount) || amount <= 0) throw new ValidationError("invalid amount")

  if (!merchantWalletAddress || !isAddress(merchantWalletAddress)) {
    throw new ValidationError("invalid merchant wallet address")
  }

  if (business.isOwner) {
    const linkedAddress = await db.query.addresses.findFirst({
      where: and(
        eq(addresses.userId, business.businessId),
        eq(addresses.address, merchantWalletAddress)
      ),
    })
    if (!linkedAddress) throw new ValidationError("merchant wallet address is not linked to this account")
  } else {
    if (
      !business.walletAddress ||
      merchantWalletAddress.toLowerCase() !== business.walletAddress.toLowerCase()
    ) {
      throw new ValidationError("merchant wallet address does not match your assigned wallet")
    }
  }

  const tokenDef = getPaymentTokenDefinition(token)
  if (!tokenDef?.address) throw new ValidationError("token must be USDC or USDT")

  const amountToken = parseUnits(amountUsd, tokenDef.decimals).toString()

  const client = getPublicClient(PAYMENT_CHAIN_ID)
  const startBlock = (await client.getBlockNumber()).toString()

  const expiresAt = new Date(Date.now() + PAYMENT_EXPIRY_MINUTES * 60 * 1000)
  const now = new Date()

  const insertValues: typeof paymentRequests.$inferInsert = {
    merchantId: business.businessId,
    operatorId: business.isOwner ? null : auth.userId,
    chainId: PAYMENT_CHAIN_ID,
    amountUsd,
    amountToken,
    tokenSymbol: token,
    tokenAddress: tokenDef.address,
    tokenDecimals: tokenDef.decimals,
    merchantWalletAddress,
    startBlock,
    lastScannedBlock: startBlock,
    requiredConfirmations: PAYMENT_REQUIRED_CONFIRMATIONS,
    confirmations: 0,
    updatedAt: now,
    expiresAt,
    isSplitPayment: Boolean(isSplitPayment),
  }

  if (Boolean(isSplitPayment)) {
    insertValues.totalPaidToken = "0"
    insertValues.totalPaidUsd = "0"
  }

  const [request] = await db
    .insert(paymentRequests)
    .values(insertValues)
    .returning()

  writeAuditLog(
    business.businessId,
    auth.userId,
    AUDIT_ACTIONS.PAYMENT_REQUEST_CREATED,
    { requestId: request.id, amountUsd, token, operatorId: business.isOwner ? null : auth.userId },
    ip
  )

  return ok(toPaymentRequestView(request))
})
