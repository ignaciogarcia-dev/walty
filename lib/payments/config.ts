import type { Token } from "@/lib/tokens/tokenRegistry"
import { getTokensByChain } from "@/lib/tokens/tokenRegistry"

export const PAYMENT_CHAIN_ID = 137
export const PAYMENT_EXPIRY_MINUTES = 15
export const PAYMENT_REQUIRED_CONFIRMATIONS = 2
export const PAYMENT_MODAL_POLL_INTERVAL_MS = 3_000
export const PAYMENT_HOME_POLL_INTERVAL_MS = 5_000
export const PAYMENT_RECONCILE_INTERVAL_SECONDS = 30
export const PAYMENT_RECONCILE_HEADER = "x-reconcile-secret"
export const PAYMENT_ALLOWED_TOKENS = ["USDC", "USDT"] as const

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
