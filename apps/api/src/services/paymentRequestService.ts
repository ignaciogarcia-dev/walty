import { parseUnits } from "viem"
import { db, paymentRequests } from "@walty/db"
import { ValidationError } from "@walty/shared/api-utils/errors"
import {
  PAYMENT_CHAIN_ID,
  PAYMENT_EXPIRY_MINUTES,
  PAYMENT_MAX_AMOUNT_USD,
  PAYMENT_REQUIRED_CONFIRMATIONS,
  getPaymentTokenDefinition,
  isPaymentTokenSymbol,
} from "@walty/shared/payments/config"
import { getPublicClient } from "@walty/shared/rpc/getPublicClient"

export type CreatePaymentRequestInput = {
  merchantId: number
  merchantWalletAddress: string
  amountUsd: string
  token: string
  isSplitPayment?: boolean
  /** Cashier user id, or null for owner-created and POS-created requests. */
  operatorId?: number | null
  /** POS terminal id when the request originates from a device; null otherwise. */
  posDeviceId?: number | null
}

/**
 * Validates amount/token and inserts a payment request row. Shared by the user
 * route (owner/cashier) and the POS route so both produce identical records and
 * on-chain reconciliation metadata. Wallet-ownership authorization is the
 * caller's responsibility (it differs per actor); this only trusts the address.
 */
export async function createPaymentRequestRecord(
  input: CreatePaymentRequestInput,
): Promise<typeof paymentRequests.$inferSelect> {
  const {
    merchantId,
    merchantWalletAddress,
    amountUsd,
    token,
    isSplitPayment,
    operatorId = null,
    posDeviceId = null,
  } = input

  if (!isPaymentTokenSymbol(token)) {
    throw new ValidationError("token must be USDC or USDT")
  }
  const amount = parseFloat(amountUsd)
  if (isNaN(amount) || amount <= 0) {
    throw new ValidationError("invalid amount")
  }
  if (amount > PAYMENT_MAX_AMOUNT_USD) {
    throw new ValidationError("amount exceeds maximum allowed")
  }

  const tokenDef = getPaymentTokenDefinition(token)
  if (!tokenDef?.address) throw new ValidationError("token must be USDC or USDT")

  let amountToken: string
  try {
    amountToken = parseUnits(amountUsd, tokenDef.decimals).toString()
  } catch {
    throw new ValidationError("amount format is invalid")
  }

  const client = getPublicClient(PAYMENT_CHAIN_ID)
  const startBlock = (await client.getBlockNumber()).toString()

  const now = new Date()
  const expiresAt = new Date(now.getTime() + PAYMENT_EXPIRY_MINUTES * 60 * 1000)

  const insertValues: typeof paymentRequests.$inferInsert = {
    merchantId,
    operatorId,
    posDeviceId,
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

  const [request] = await db.insert(paymentRequests).values(insertValues).returning()
  return request
}
