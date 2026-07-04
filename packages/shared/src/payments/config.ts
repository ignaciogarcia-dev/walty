import type { Token } from "@walty/shared/tokens/tokenRegistry"
import { getTokensByChain } from "@walty/shared/tokens/tokenRegistry"

export const PAYMENT_CHAIN_ID = 137
export const PAYMENT_EXPIRY_MINUTES = 15
export const PAYMENT_REQUIRED_CONFIRMATIONS = 2
export const PAYMENT_RECONCILE_HEADER = "x-reconcile-secret"
export const PAYMENT_ALLOWED_TOKENS = ["USDC"] as const

/** Hard cap on a single payment request amount (sanity check, fraud floor). */
export const PAYMENT_MAX_AMOUNT_USD = 1_000_000

/**
 * Minimum contribution accepted by the split-payment reconciler, in token
 * base units. Below this the contribution is dropped (anti-spam — a
 * malicious sender could otherwise flood the request with 1-wei transfers
 * and inflate the contribution counter). 100_000 = $0.10 USDC (6 decimals).
 */
export const SPLIT_MIN_CONTRIBUTION_TOKEN = 100_000n

export type PaymentTokenSymbol = typeof PAYMENT_ALLOWED_TOKENS[number]

export function isPaymentTokenSymbol(value: string): value is PaymentTokenSymbol {
  return PAYMENT_ALLOWED_TOKENS.includes(value as PaymentTokenSymbol)
}

export function getPaymentTokenDefinition(symbol: string): Token | null {
  const token = getTokensByChain(PAYMENT_CHAIN_ID).find((candidate) => candidate.symbol === symbol)
  if (!token || token.type !== "erc20" || !token.address) {
    return null
  }
  return token
}
