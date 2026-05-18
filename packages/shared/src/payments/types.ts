export type PaymentRequestStatus = "pending" | "confirming" | "paid" | "expired" | "cancelled"

export type PaymentDiscrepancy = "exact" | "overpaid" | "underpaid"

export type SplitPaymentContributionStatus = "pending" | "confirming" | "confirmed"

export type SplitPaymentContribution = {
  id: number
  paymentRequestId: string
  txHash: string
  payerAddress: string
  amountToken: string
  amountUsd: string
  tokenSymbol: string
  confirmations: number
  status: SplitPaymentContributionStatus
  blockNumber: string | null
  detectedAt: string | null
  confirmedAt: string | null
  createdAt: string
}

export type PaymentRequestView = {
  id: string
  status: PaymentRequestStatus
  chainId: number
  amountUsd: string
  amountToken: string
  tokenSymbol: string
  tokenAddress: string
  tokenDecimals: number
  merchantWalletAddress: string
  expiresAt: string
  confirmations: number
  requiredConfirmations: number
  txHash: string | null
  payerAddress: string | null
  isSplitPayment?: boolean
  totalPaidUsd?: string
  remainingAmountUsd?: string
  contributions?: SplitPaymentContribution[]
  // Discrepancy tracking
  receivedAmountToken: string | null
  receivedAmountUsd: string | null
  paymentDiscrepancy: PaymentDiscrepancy | null
}

export function getPaymentRequestStatus(
  request: Pick<PaymentRequestView, "status" | "expiresAt">,
  now: number = Date.now()
): PaymentRequestStatus {
  if (request.status === "pending" && new Date(request.expiresAt).getTime() <= now) {
    return "expired"
  }
  return request.status
}

export function isPaymentRequestActive(
  request: Pick<PaymentRequestView, "status" | "expiresAt">,
  now: number = Date.now()
): boolean {
  const status = getPaymentRequestStatus(request, now)
  return status === "pending" || status === "confirming"
}

export function getPaymentRequestCountdown(
  expiresAt: string,
  now: number = Date.now()
): { expired: boolean; label: string; seconds: number } {
  const seconds = Math.max(0, Math.floor((new Date(expiresAt).getTime() - now) / 1000))
  const minutesLabel = Math.floor(seconds / 60).toString().padStart(2, "0")
  const secondsLabel = (seconds % 60).toString().padStart(2, "0")

  return {
    expired: seconds === 0,
    label: `${minutesLabel}:${secondsLabel}`,
    seconds,
  }
}

export function getPaymentShareText(request: Pick<PaymentRequestView, "amountUsd" | "tokenSymbol">, url: string): string {
  return `Pagar $${request.amountUsd} ${request.tokenSymbol} en Walty: ${url}`
}
