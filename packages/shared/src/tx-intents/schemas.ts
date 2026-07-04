import { z } from "zod"
import { evmAddress, hexString } from "@walty/shared/api-utils/zodHelpers"

// Structural request-boundary schemas for the tx-intent endpoints. These pin
// shape, types and basic format so handlers receive a typed, normalized body
// and malformed input is rejected with a uniform 400 before any DB work. Deep
// semantic checks — token-registry membership, amount precision/positivity,
// and the signed-tx ↔ payload binding — stay in their domain helpers
// (validate.ts / verifySigned.ts), which need context this layer doesn't have.

export const TX_INTENT_TYPES = [
  "transfer",
  "refund",
  "gas_funding",
  "collection",
] as const
export const txIntentType = z.enum(TX_INTENT_TYPES)

export const txIntentPayloadSchema = z.object({
  to: evmAddress,
  from: evmAddress,
  // Human-readable amount (e.g. "1.5"); precision/positivity is validated
  // against the canonical token decimals in validate.ts.
  amount: z.string().min(1),
  chainId: z.number().int().positive(),
  token: z.object({
    symbol: z.string().min(1),
    // null for native assets; omitted/null for erc20 is backfilled from the
    // registry in validate.ts.
    address: evmAddress.nullable().optional(),
    type: z.enum(["native", "erc20"]),
    decimals: z.number().int().nonnegative().optional(),
  }),
  derivationIndex: z.number().int().nonnegative().optional(),
})

export const createTxIntentBody = z.object({
  payload: txIntentPayloadSchema,
  type: txIntentType.default("transfer"),
  idempotencyKey: z.string().min(1).optional(),
})

export const patchTxIntentBody = z.object({
  status: z.enum(["confirmed", "failed"]),
})

export const signTxIntentBody = z.object({
  signedRaw: hexString,
})
