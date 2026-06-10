import { z } from "zod"
import { evmAddress } from "@walty/shared/api-utils/zodHelpers"

// Structural request-boundary schemas for the payment-request endpoints. Shape
// and format only; the numeric range (amount > 0, ≤ max), token-symbol support
// and wallet-ownership checks stay in the route handler, which has the token
// config and DB context this layer doesn't.

export const paymentRequestCreateBody = z.object({
  // Human-readable USD amount as a string (matches the form input and the
  // parseUnits call); range/precision validated in the handler.
  amountUsd: z.string().min(1),
  // USDC / USDT — membership checked with isPaymentTokenSymbol in the handler.
  token: z.string().min(1),
  merchantWalletAddress: evmAddress,
  isSplitPayment: z.boolean().optional(),
})

export const paymentRequestCancelBody = z.object({
  id: z.string().min(1),
})
