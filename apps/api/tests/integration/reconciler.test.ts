import { eq } from "drizzle-orm"
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest"

import {
  db,
  addresses,
  businessMembers,
  businessSettings,
  paymentRequests,
  splitPaymentContributions,
  users,
} from "@walty/db"

// EIP-55 mixed-case 20-byte hex addresses — fixtures are stored as-is in the
// DB and the reconciler receives lowercase `from` from viem logs, so this
// shape genuinely exercises the case-insensitive compare.
const MERCHANT_WALLET = "0xAbCdEf0123456789AbCdEf0123456789AbCdEf01"
const LINKED_WALLET = "0xfEdCbA9876543210FedcbA9876543210fEdCBa98"
const OPERATOR_WALLET = "0x1234567890aBcDeF1234567890AbCdEf12345678"
const REVOKED_OPERATOR_WALLET = "0x9876543210FEDCba9876543210FedcbA98765432"
const STRANGER_A = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
const STRANGER_B = "0xBbBbBbBbBbBbBbBbBbBbBbBbBbBbBbBbBbBbBbBb"
const USDC = "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359"

// Pinned block window the fake RPC always reports as "current".
const CURRENT_BLOCK = 100n
const TX_BLOCK = 95n
const PR_START_BLOCK = 90n

function transferLog(opts: { from: string; value: bigint; txHash: string }) {
  return {
    transactionHash: opts.txHash,
    blockNumber: TX_BLOCK,
    logIndex: 0,
    address: USDC,
    args: {
      from: opts.from as `0x${string}`,
      to: MERCHANT_WALLET as `0x${string}`,
      value: opts.value,
    },
  }
}

vi.mock("@walty/shared/rpc/getPublicClient", () => {
  const fake = {
    logs: [] as ReturnType<typeof transferLog>[],
    getBlockNumber: vi.fn(async () => CURRENT_BLOCK),
    getLogs: vi.fn(async () => fake.logs as unknown[]),
    getBlock: vi.fn(async () => ({
      timestamp: BigInt(Math.floor(Date.now() / 1000)),
    })),
    getTransactionReceipt: vi.fn(async () => null),
  }
  return {
    getPublicClient: vi.fn(() => fake),
    __fake: fake,
  }
})

let fakeRpc: {
  logs: ReturnType<typeof transferLog>[]
  getBlockNumber: ReturnType<typeof vi.fn>
  getLogs: ReturnType<typeof vi.fn>
  getBlock: ReturnType<typeof vi.fn>
  getTransactionReceipt: ReturnType<typeof vi.fn>
}
let reconcilePendingPaymentRequests: (typeof import("@walty/shared/payments/reconcilePendingPaymentRequests"))["reconcilePendingPaymentRequests"]

beforeAll(async () => {
  const mod = (await import("@walty/shared/rpc/getPublicClient")) as unknown as {
    __fake: typeof fakeRpc
  }
  fakeRpc = mod.__fake
  ;({ reconcilePendingPaymentRequests } = await import(
    "@walty/shared/payments/reconcilePendingPaymentRequests"
  ))
})

afterEach(() => {
  fakeRpc.logs = []
})

async function seedMerchantAndRequest(opts: {
  isSplitPayment: boolean
  amountToken: string
  amountUsd: string
}) {
  const [user] = await db
    .insert(users)
    .values({ email: `mer-${Date.now()}@example.com`, passwordHash: "x" })
    .returning()
  await db.insert(businessSettings).values({ userId: user.id, name: "Acme" })
  await db
    .insert(addresses)
    .values({ userId: user.id, address: LINKED_WALLET })
  await db.insert(businessMembers).values([
    {
      businessId: user.id,
      role: "cashier",
      status: "active",
      invitedBy: user.id,
      expiresAt: new Date(Date.now() + 86_400_000),
      derivationIndex: 1,
      walletAddress: OPERATOR_WALLET,
    },
    {
      businessId: user.id,
      role: "cashier",
      status: "revoked",
      invitedBy: user.id,
      expiresAt: new Date(Date.now() + 86_400_000),
      derivationIndex: 2,
      walletAddress: REVOKED_OPERATOR_WALLET,
    },
  ])

  const now = new Date()
  const [pr] = await db
    .insert(paymentRequests)
    .values({
      merchantId: user.id,
      chainId: 137,
      amountUsd: opts.amountUsd,
      amountToken: opts.amountToken,
      tokenSymbol: "USDC",
      tokenAddress: USDC,
      tokenDecimals: 6,
      merchantWalletAddress: MERCHANT_WALLET,
      startBlock: PR_START_BLOCK.toString(),
      lastScannedBlock: PR_START_BLOCK.toString(),
      requiredConfirmations: 1,
      confirmations: 0,
      updatedAt: now,
      expiresAt: new Date(now.getTime() + 60 * 60 * 1000),
      isSplitPayment: opts.isSplitPayment,
      totalPaidToken: opts.isSplitPayment ? "0" : null,
      totalPaidUsd: opts.isSplitPayment ? "0" : null,
    })
    .returning()
  return { user, pr }
}

describe("reconciler — wash payment rejection (real db)", () => {
  it("skips a split contribution from the merchant's own destination wallet", async () => {
    const { pr } = await seedMerchantAndRequest({
      isSplitPayment: true,
      amountToken: "10000000",
      amountUsd: "10",
    })
    fakeRpc.logs = [
      transferLog({ from: MERCHANT_WALLET, value: 5_000_000n, txHash: "0xaa" }),
    ]
    await reconcilePendingPaymentRequests({ id: pr.id })

    const contributions = await db
      .select()
      .from(splitPaymentContributions)
      .where(eq(splitPaymentContributions.paymentRequestId, pr.id))
    expect(contributions).toHaveLength(0)
  })

  it("skips a split contribution from a linked owner address", async () => {
    const { pr } = await seedMerchantAndRequest({
      isSplitPayment: true,
      amountToken: "10000000",
      amountUsd: "10",
    })
    fakeRpc.logs = [
      transferLog({ from: LINKED_WALLET, value: 5_000_000n, txHash: "0xbb" }),
    ]
    await reconcilePendingPaymentRequests({ id: pr.id })

    const contributions = await db
      .select()
      .from(splitPaymentContributions)
      .where(eq(splitPaymentContributions.paymentRequestId, pr.id))
    expect(contributions).toHaveLength(0)
  })

  it("skips a split contribution from an operator wallet of the same business", async () => {
    const { pr } = await seedMerchantAndRequest({
      isSplitPayment: true,
      amountToken: "10000000",
      amountUsd: "10",
    })
    fakeRpc.logs = [
      transferLog({ from: OPERATOR_WALLET, value: 5_000_000n, txHash: "0xcc" }),
    ]
    await reconcilePendingPaymentRequests({ id: pr.id })

    const contributions = await db
      .select()
      .from(splitPaymentContributions)
      .where(eq(splitPaymentContributions.paymentRequestId, pr.id))
    expect(contributions).toHaveLength(0)
  })

  it("accepts a split contribution from a stranger and rejects mixed self-payments", async () => {
    const { pr } = await seedMerchantAndRequest({
      isSplitPayment: true,
      amountToken: "10000000",
      amountUsd: "10",
    })
    fakeRpc.logs = [
      transferLog({ from: STRANGER_A, value: 4_000_000n, txHash: "0xdd" }),
      transferLog({ from: OPERATOR_WALLET, value: 999_000n, txHash: "0xee" }),
      transferLog({ from: STRANGER_B, value: 6_000_000n, txHash: "0xff" }),
    ]
    await reconcilePendingPaymentRequests({ id: pr.id })

    const contributions = await db
      .select()
      .from(splitPaymentContributions)
      .where(eq(splitPaymentContributions.paymentRequestId, pr.id))
    expect(contributions).toHaveLength(2)
    const payers = contributions.map((c) => c.payerAddress.toLowerCase()).sort()
    expect(payers).toEqual(
      [STRANGER_A.toLowerCase(), STRANGER_B.toLowerCase()].sort(),
    )
  })

  it("skips a non-split self-payment, leaves the request pending", async () => {
    const { pr } = await seedMerchantAndRequest({
      isSplitPayment: false,
      amountToken: "10000000",
      amountUsd: "10",
    })
    fakeRpc.logs = [
      transferLog({ from: LINKED_WALLET, value: 10_000_000n, txHash: "0x11" }),
    ]
    await reconcilePendingPaymentRequests({ id: pr.id })

    const [after] = await db
      .select()
      .from(paymentRequests)
      .where(eq(paymentRequests.id, pr.id))
    expect(after.status).toBe("pending")
    expect(after.txHash).toBeNull()
  })

  it("split skips a contribution from a REVOKED operator (key still controlled by ex-cashier)", async () => {
    const { pr } = await seedMerchantAndRequest({
      isSplitPayment: true,
      amountToken: "10000000",
      amountUsd: "10",
    })
    fakeRpc.logs = [
      transferLog({
        from: REVOKED_OPERATOR_WALLET,
        value: 5_000_000n,
        txHash: "0x33",
      }),
    ]
    await reconcilePendingPaymentRequests({ id: pr.id })

    const contributions = await db
      .select()
      .from(splitPaymentContributions)
      .where(eq(splitPaymentContributions.paymentRequestId, pr.id))
    expect(contributions).toHaveLength(0)
  })

  it("compares case-insensitively: EIP-55 stored address vs lowercase log.from", async () => {
    const { pr } = await seedMerchantAndRequest({
      isSplitPayment: true,
      amountToken: "10000000",
      amountUsd: "10",
    })
    // Viem normalizes log.args.from to lowercase; the DB stores OPERATOR_WALLET
    // in EIP-55 mixed case. Without the lowercase compare, this contribution
    // would be accepted as if it came from a stranger.
    fakeRpc.logs = [
      transferLog({
        from: OPERATOR_WALLET.toLowerCase(),
        value: 5_000_000n,
        txHash: "0x44",
      }),
    ]
    await reconcilePendingPaymentRequests({ id: pr.id })

    const contributions = await db
      .select()
      .from(splitPaymentContributions)
      .where(eq(splitPaymentContributions.paymentRequestId, pr.id))
    expect(contributions).toHaveLength(0)
  })

  it("non-split accepts a stranger's transfer of the right amount", async () => {
    const { pr } = await seedMerchantAndRequest({
      isSplitPayment: false,
      amountToken: "10000000",
      amountUsd: "10",
    })
    fakeRpc.logs = [
      transferLog({ from: STRANGER_A, value: 10_000_000n, txHash: "0x22" }),
    ]
    await reconcilePendingPaymentRequests({ id: pr.id })

    const [after] = await db
      .select()
      .from(paymentRequests)
      .where(eq(paymentRequests.id, pr.id))
    expect(after.status).toBe("paid")
    expect(after.txHash).toBe("0x22")
  })
})
