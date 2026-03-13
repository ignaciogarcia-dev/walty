import { PAYMENT_CHAIN_ID, PAYMENT_REQUIRED_CONFIRMATIONS, getPaymentTokenDefinition } from "@/lib/payments/config"
import type { PaymentRequestStatus, PaymentRequestView } from "@/lib/payments/types"
import { paymentRequests } from "@/server/db/schema"

export type PaymentRequestRecord = typeof paymentRequests.$inferSelect

export type NormalizedPaymentRequest = PaymentRequestRecord & {
  status: PaymentRequestStatus
  chainId: number
  tokenAddress: `0x${string}`
  tokenDecimals: number
  lastScannedBlock: string
  confirmations: number
  requiredConfirmations: number
  txHash: string | null
}

export function normalizePaymentRequestStatus(status: string): PaymentRequestStatus {
  switch (status) {
    case "confirming":
    case "paid":
    case "expired":
      return status
    case "pending":
    default:
      return "pending"
  }
}

export function normalizePaymentRequest(record: PaymentRequestRecord): NormalizedPaymentRequest {
  const tokenDef = getPaymentTokenDefinition(record.tokenSymbol)

  if (!tokenDef?.address) {
    throw new Error(`Unsupported payment token: ${record.tokenSymbol}`)
  }

  return {
    ...record,
    status: normalizePaymentRequestStatus(record.status),
    chainId: record.chainId ?? PAYMENT_CHAIN_ID,
    tokenAddress: (record.tokenAddress ?? tokenDef.address) as `0x${string}`,
    tokenDecimals: record.tokenDecimals ?? tokenDef.decimals,
    lastScannedBlock: record.lastScannedBlock ?? record.startBlock,
    confirmations: record.confirmations ?? 0,
    requiredConfirmations: record.requiredConfirmations ?? PAYMENT_REQUIRED_CONFIRMATIONS,
    txHash: record.txHash ?? null,
  }
}

export function toPaymentRequestView(record: PaymentRequestRecord): PaymentRequestView {
  const normalized = normalizePaymentRequest(record)

  const isSplitPayment = normalized.isSplitPayment ?? false
  const totalPaidUsd = normalized.totalPaidUsd ?? "0"
  const amountUsdNum = parseFloat(normalized.amountUsd)
  const totalPaidUsdNum = parseFloat(totalPaidUsd)
  const remainingAmountUsd = Math.max(0, amountUsdNum - totalPaidUsdNum).toFixed(2)

  return {
    id: normalized.id,
    status: normalized.status,
    chainId: normalized.chainId,
    amountUsd: normalized.amountUsd,
    tokenSymbol: normalized.tokenSymbol,
    merchantWalletAddress: normalized.merchantWalletAddress,
    expiresAt: normalized.expiresAt.toISOString(),
    confirmations: normalized.confirmations,
    requiredConfirmations: normalized.requiredConfirmations,
    txHash: normalized.txHash,
    isSplitPayment,
    totalPaidUsd,
    remainingAmountUsd,
  }
}
