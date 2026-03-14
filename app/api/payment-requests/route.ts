import { NextRequest, NextResponse } from "next/server"
import { and, desc, eq, inArray } from "drizzle-orm"
import { parseUnits, isAddress } from "viem"
import { requireAuth } from "@/lib/auth"
import { PAYMENT_CHAIN_ID, PAYMENT_EXPIRY_MINUTES, PAYMENT_REQUIRED_CONFIRMATIONS, getPaymentTokenDefinition, isPaymentTokenSymbol } from "@/lib/payments/config"
import { toPaymentRequestView } from "@/lib/payments/paymentRequests"
import { db } from "@/server/db"
import { addresses, paymentRequests } from "@/server/db/schema"
import { getPublicClient } from "@/lib/rpc/getPublicClient"
import { isPaymentRequestActive } from "@/lib/payments/types"
import { getBusinessContext } from "@/lib/business/getBusinessContext"
import { writeAuditLog, AUDIT_ACTIONS } from "@/lib/business/auditLog"

function getIp(req: NextRequest) {
  return req.headers.get("x-forwarded-for") ?? req.headers.get("x-real-ip") ?? "unknown"
}

export async function GET(req: NextRequest) {
  try {
    const auth = requireAuth(req)
    const ctx = await getBusinessContext(auth.userId)
    if (!ctx) {
      return NextResponse.json({ error: "only business accounts can read payment requests" }, { status: 403 })
    }

    const [request] = await db
      .select()
      .from(paymentRequests)
      .where(
        and(
          eq(paymentRequests.merchantId, ctx.businessId),
          inArray(paymentRequests.status, ["pending", "confirming"])
        )
      )
      .orderBy(desc(paymentRequests.createdAt))
      .limit(1)

    return NextResponse.json({
      request: request ? toPaymentRequestView(request) : null,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "unexpected error"
    if (message === "Unauthorized") {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 })
    }
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const auth = requireAuth(req)
    const ctx = await getBusinessContext(auth.userId)
    if (!ctx) {
      return NextResponse.json({ error: "only business accounts can cancel payment requests" }, { status: 403 })
    }

    const { id } = await req.json()
    if (!id || typeof id !== "string") {
      return NextResponse.json({ error: "invalid id" }, { status: 400 })
    }

    const [request] = await db
      .select()
      .from(paymentRequests)
      .where(and(eq(paymentRequests.id, id), eq(paymentRequests.merchantId, ctx.businessId)))
      .limit(1)

    if (!request) {
      return NextResponse.json({ error: "not found" }, { status: 404 })
    }

    if (!isPaymentRequestActive(toPaymentRequestView(request))) {
      return NextResponse.json({ error: "only active requests can be cancelled" }, { status: 400 })
    }

    const [updated] = await db
      .update(paymentRequests)
      .set({ status: "cancelled", updatedAt: new Date() })
      .where(eq(paymentRequests.id, id))
      .returning()

    writeAuditLog(ctx.businessId, auth.userId, AUDIT_ACTIONS.PAYMENT_REQUEST_CANCELLED, { requestId: id }, getIp(req))

    return NextResponse.json(toPaymentRequestView(updated))
  } catch (error) {
    const message = error instanceof Error ? error.message : "unexpected error"
    if (message === "Unauthorized") {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 })
    }
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = requireAuth(req)
    const ctx = await getBusinessContext(auth.userId)
    if (!ctx) {
      return NextResponse.json({ error: "only business accounts can create payment requests" }, { status: 403 })
    }

    const { amountUsd, token, merchantWalletAddress, isSplitPayment } = await req.json()

    if (!isPaymentTokenSymbol(token)) {
      return NextResponse.json({ error: "token must be USDC or USDT" }, { status: 400 })
    }

    const amount = parseFloat(amountUsd)
    if (!amountUsd || isNaN(amount) || amount <= 0) {
      return NextResponse.json({ error: "invalid amount" }, { status: 400 })
    }

    if (!merchantWalletAddress || !isAddress(merchantWalletAddress)) {
      return NextResponse.json({ error: "invalid merchant wallet address" }, { status: 400 })
    }

    // Validate address is linked to the BUSINESS account (not the operator's account)
    const linkedAddress = await db.query.addresses.findFirst({
      where: and(
        eq(addresses.userId, ctx.businessId),
        eq(addresses.address, merchantWalletAddress)
      ),
    })

    if (!linkedAddress) {
      return NextResponse.json({ error: "merchant wallet address is not linked to this account" }, { status: 400 })
    }

    const tokenDef = getPaymentTokenDefinition(token)
    if (!tokenDef?.address) {
      return NextResponse.json({ error: "token must be USDC or USDT" }, { status: 400 })
    }

    const amountToken = parseUnits(amountUsd, tokenDef.decimals).toString()

    const client = await getPublicClient(PAYMENT_CHAIN_ID)
    const startBlock = (await client.getBlockNumber()).toString()

    const expiresAt = new Date(Date.now() + PAYMENT_EXPIRY_MINUTES * 60 * 1000)
    const now = new Date()

    const insertValues: typeof paymentRequests.$inferInsert = {
      merchantId: ctx.businessId,
      operatorId: ctx.isOwner ? null : auth.userId,
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
      ctx.businessId,
      auth.userId,
      AUDIT_ACTIONS.PAYMENT_REQUEST_CREATED,
      { requestId: request.id, amountUsd, token, operatorId: ctx.isOwner ? null : auth.userId },
      getIp(req)
    )

    return NextResponse.json(toPaymentRequestView(request))
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unexpected error"
    if (msg === "Unauthorized") {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 })
    }
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
