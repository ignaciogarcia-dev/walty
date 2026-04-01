/**
 * POST /api/tx/relay
 *
 * Gasless transfer endpoint. The client signs a permit() off-chain (no gas),
 * sends it here. This server:
 *   1. Validates the request
 *   2. Calls permit() on the token — sets allowance from user → sponsor
 *   3. Calls transferFrom() user → recipient (net amount)
 *   4. Calls transferFrom() user → feeRecipient (fee amount)
 *   5. Returns tx hashes
 *
 * The sponsor wallet pays all MATIC gas. The user pays the fee in the token.
 *
 * Security:
 *   - feeBps and feeRecipient are read from server env, never from the request
 *   - permit deadline enforced on-chain
 *   - amount validated against permit.value
 */

import { type NextRequest, NextResponse } from "next/server"
import {
  decodeEventLog,
  parseUnits,
  formatUnits,
  getAddress,
  isAddress,
} from "viem"
import {
  getSponsorWalletClient,
  getSponsorPublicClient,
  getFeeConfig,
} from "@/lib/wallet/SponsorWallet"
import {
  calcFeeAmount,
  calcNetAmount,
  USDC_POLYGON_DECIMALS,
  PERMIT_ABI,
} from "@/lib/transactions/permit"
import { TRANSFER_FROM_ABI, TRANSFER_EVENT_ABI } from "@/lib/tokens/erc20"
import { getRelayToken } from "@/lib/tokens/tokenRegistry"
import { db } from "@/server/db"
import { addresses, businessMembers, transactions } from "@/server/db/schema"
import { ilike } from "drizzle-orm"
import { requireApiAuth } from "@/lib/auth"
import { rateLimitByUser, RateLimitError } from "@/lib/rate-limit"

// ─── Request schema ───────────────────────────────────────────────────────────

type RelayRequest = {
  /** Address of the ERC-20 token (must support EIP-2612) */
  tokenAddress: string
  /** Token decimals */
  decimals: number
  /** Chain ID */
  chainId: number
  /** Gross amount the user wants to send (before fee), as decimal string e.g. "100.00" */
  grossAmount: string
  /** Final recipient address */
  recipient: string
  /** EIP-2612 permit signature from the user */
  permit: {
    owner:    string
    spender:  string
    value:    string  // bigint as string
    deadline: string  // bigint as string
    nonce:    string  // bigint as string
    v:        number
    r:        string
    s:        string
  }
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  // ── 0. Auth + rate limit (before reading body) ─────────────────────────────
  let userId: number
  try {
    userId = requireApiAuth(req).userId
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  try {
    await rateLimitByUser(userId, 10, 60_000)
  } catch (err) {
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429, headers: { "Retry-After": String(err instanceof RateLimitError ? (err.retryAfter ?? 60) : 60) } },
    )
  }

  try {
    const body = (await req.json()) as RelayRequest

    // ── 1. Validate inputs ──────────────────────────────────────────────────
    if (!isAddress(body.tokenAddress)) {
      return NextResponse.json({ error: "Invalid tokenAddress" }, { status: 400 })
    }
    if (!isAddress(body.recipient)) {
      return NextResponse.json({ error: "Invalid recipient" }, { status: 400 })
    }
    if (!isAddress(body.permit.owner)) {
      return NextResponse.json({ error: "Invalid permit.owner" }, { status: 400 })
    }

    const tokenAddress = getAddress(body.tokenAddress)
    const recipient    = getAddress(body.recipient)
    const owner        = getAddress(body.permit.owner)

    // Only USDC is accepted for relay transfers
    const relayToken = getRelayToken(body.chainId)
    if (!relayToken || relayToken.address === null) {
      return NextResponse.json({ error: "Unsupported chainId for relay" }, { status: 400 })
    }
    if (tokenAddress.toLowerCase() !== relayToken.address.toLowerCase()) {
      return NextResponse.json(
        { error: `Only USDC (${relayToken.address}) is accepted on chain ${body.chainId}` },
        { status: 400 },
      )
    }

    const decimals    = body.decimals ?? USDC_POLYGON_DECIMALS
    const grossRaw    = parseUnits(body.grossAmount, decimals)
    const permitValue = BigInt(body.permit.value)

    // permit.value must cover the gross amount exactly
    if (permitValue !== grossRaw) {
      return NextResponse.json(
        { error: `permit.value (${permitValue}) must equal grossAmount (${grossRaw})` },
        { status: 400 },
      )
    }

    // deadline must not be in the past
    const deadline = BigInt(body.permit.deadline)
    if (deadline < BigInt(Math.floor(Date.now() / 1000))) {
      return NextResponse.json({ error: "Permit deadline expired" }, { status: 400 })
    }

    // ── 2. Fee config from server env (never from request) ──────────────────
    const { feeBps, feeRecipient } = getFeeConfig()
    const feeAmount = calcFeeAmount(grossRaw, feeBps)
    const netAmount = calcNetAmount(grossRaw, feeBps)

    const sponsorClient  = getSponsorWalletClient()
    const publicClient   = getSponsorPublicClient(body.chainId)
    const sponsorAddress = sponsorClient.account!.address

    // ── 3. Call permit() — sets allowance owner → sponsor ───────────────────
    const permitHash = await sponsorClient.writeContract({
      account:      sponsorClient.account!,
      chain:        sponsorClient.chain,
      address:      tokenAddress,
      abi:          PERMIT_ABI,
      functionName: "permit",
      args: [
        owner,
        sponsorAddress,
        grossRaw,
        deadline,
        body.permit.v,
        body.permit.r as `0x${string}`,
        body.permit.s as `0x${string}`,
      ],
    })

    await publicClient.waitForTransactionReceipt({
      hash:    permitHash,
      timeout: 60_000,
    })

    // ── 4. transferFrom owner → recipient (net) ─────────────────────────────
    const transferHash = await sponsorClient.writeContract({
      account:      sponsorClient.account!,
      chain:        sponsorClient.chain,
      address:      tokenAddress,
      abi:          TRANSFER_FROM_ABI,
      functionName: "transferFrom",
      args:         [owner, recipient, netAmount],
    })

    // ── 5. transferFrom owner → feeRecipient (fee) ──────────────────────────
    const feeHash = await sponsorClient.writeContract({
      account:      sponsorClient.account!,
      chain:        sponsorClient.chain,
      address:      tokenAddress,
      abi:          TRANSFER_FROM_ABI,
      functionName: "transferFrom",
      args:         [owner, feeRecipient, feeAmount],
    })

    // Wait for both in parallel
    const [transferReceipt, feeReceipt] = await Promise.all([
      publicClient.waitForTransactionReceipt({ hash: transferHash, timeout: 60_000 }),
      publicClient.waitForTransactionReceipt({ hash: feeHash,      timeout: 60_000 }),
    ])

    if (transferReceipt.status !== "success") {
      return NextResponse.json({ error: "Transfer tx failed on-chain" }, { status: 500 })
    }

    if (feeReceipt.status !== "success") {
      console.error("[relay] Fee transfer failed", {
        feeHash,
        owner,
        feeAmount: feeAmount.toString(),
      })
    }

    const transferLog = transferReceipt.logs.find((log) => {
      if (log.address.toLowerCase() !== tokenAddress.toLowerCase()) return false

      try {
        const decoded = decodeEventLog({
          abi: TRANSFER_EVENT_ABI,
          data: log.data,
          topics: log.topics,
        })

        return (
          decoded.eventName === "Transfer" &&
          decoded.args.from?.toLowerCase() === owner.toLowerCase() &&
          decoded.args.to?.toLowerCase() === recipient.toLowerCase() &&
          decoded.args.value === netAmount
        )
      } catch {
        return false
      }
    })

    // ── 6. Record to DB (fire and forget) ────────────────────────────────────
    void recordRelay({
      owner,
      recipient,
      tokenAddress,
      chainId:      body.chainId,
      netAmount:    formatUnits(netAmount, decimals),
      feeAmount:    formatUnits(feeAmount, decimals),
      feeBps,
      transferHash,
      feeHash,
      permitHash,
      transferBlockNumber: transferReceipt.blockNumber.toString(),
      transferLogIndex: transferLog?.logIndex != null ? Number(transferLog.logIndex) : null,
    })

    return NextResponse.json({
      data: {
        transferHash,
        feeHash,
        permitHash,
        netAmount: formatUnits(netAmount, decimals),
        feeAmount: formatUnits(feeAmount, decimals),
        feeBps,
      },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown relay error"
    console.error("[relay] Error:", message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

// ─── DB recording (fire and forget) ──────────────────────────────────────────

async function recordRelay(params: {
  owner:        string
  recipient:    string
  tokenAddress: string
  chainId:      number
  netAmount:    string
  feeAmount:    string
  feeBps:       number
  transferHash: string
  feeHash:      string
  permitHash:   string
  transferBlockNumber: string
  transferLogIndex: number | null
}) {
  try {
    const senderAddress = await db.query.addresses.findFirst({
      where: ilike(addresses.address, params.owner),
    })

    if (senderAddress) {
      await db.insert(transactions).values({
        userId:       senderAddress.userId,
        hash:         params.transferHash,
        chainId:      params.chainId,
        chainType:    "EVM",
        tokenAddress: params.tokenAddress,
        tokenSymbol:  "USDC",
        fromAddress:  params.owner,
        toAddress:    params.recipient,
        value:        params.netAmount,
        status:       "confirmed",
        blockNumber:  params.transferBlockNumber,
      }).onConflictDoNothing({
        target: [transactions.hash, transactions.logIndex],
      })
    } else {
      console.warn("[relay] recordRelay: no sender user found for address", params.owner)
    }

    if (params.transferLogIndex == null) {
      console.warn("[relay] recordRelay: transfer log not found, skipping receiver activity")
      return
    }

    const receiverUserIds = new Set<number>()

    const linkedRecipient = await db.query.addresses.findFirst({
      where: ilike(addresses.address, params.recipient),
    })
    if (linkedRecipient) {
      receiverUserIds.add(linkedRecipient.userId)
    }

    const operatorRecipient = await db.query.businessMembers.findFirst({
      where: ilike(businessMembers.walletAddress, params.recipient),
      columns: { businessId: true },
    })
    if (operatorRecipient) {
      receiverUserIds.add(operatorRecipient.businessId)
    }

    if (senderAddress) {
      receiverUserIds.delete(senderAddress.userId)
    }

    for (const receiverUserId of receiverUserIds) {
      await db.insert(transactions).values({
        userId:       receiverUserId,
        hash:         params.transferHash,
        logIndex:     params.transferLogIndex,
        chainId:      params.chainId,
        chainType:    "EVM",
        tokenAddress: params.tokenAddress,
        tokenSymbol:  "USDC",
        fromAddress:  params.owner,
        toAddress:    params.recipient,
        value:        params.netAmount,
        status:       "confirmed",
        blockNumber:  params.transferBlockNumber,
        type:         null,
      }).onConflictDoNothing({
        target: [transactions.hash, transactions.logIndex],
      })
    }
  } catch (err) {
    console.error("[relay] Failed to record tx:", err)
  }
}
