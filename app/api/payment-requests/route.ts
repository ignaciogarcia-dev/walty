import { NextRequest, NextResponse } from "next/server"
import { and, desc, eq, inArray } from "drizzle-orm"
import { parseUnits, isAddress } from "viem"
import { requireAuth } from "@/lib/auth"
import { PAYMENT_CHAIN_ID, PAYMENT_EXPIRY_MINUTES, PAYMENT_REQUIRED_CONFIRMATIONS, getPaymentTokenDefinition, isPaymentTokenSymbol } from "@/lib/payments/config"
import { toPaymentRequestView } from "@/lib/payments/paymentRequests"
import { db } from "@/server/db"
import { users, addresses, paymentRequests } from "@/server/db/schema"
import { getPublicClient } from "@/lib/rpc/getPublicClient"

async function requireBusinessUser(userId: number) {
  const user = await db.query.users.findFirst({
    where: eq(users.id, userId),
    columns: { userType: true },
  })

  if (user?.userType !== "business") {
    throw new Error("FORBIDDEN")
  }
}

export async function GET(req: NextRequest) {
  try {
    const auth = requireAuth(req)
    await requireBusinessUser(auth.userId)

    const [request] = await db
      .select()
      .from(paymentRequests)
      .where(
        and(
          eq(paymentRequests.merchantId, auth.userId),
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
    if (message === "FORBIDDEN") {
      return NextResponse.json({ error: "only business accounts can read payment requests" }, { status: 403 })
    }
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = requireAuth(req)
    await requireBusinessUser(auth.userId)

    const { amountUsd, token, merchantWalletAddress } = await req.json()

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

    const linkedAddress = await db.query.addresses.findFirst({
      where: and(
        eq(addresses.userId, auth.userId),
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

    const [request] = await db
      .insert(paymentRequests)
      .values({
        merchantId: auth.userId,
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
      })
      .returning()

    return NextResponse.json(toPaymentRequestView(request))
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unexpected error"
    if (msg === "Unauthorized") {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 })
    }
    if (msg === "FORBIDDEN") {
      return NextResponse.json({ error: "only business accounts can create payment requests" }, { status: 403 })
    }
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
