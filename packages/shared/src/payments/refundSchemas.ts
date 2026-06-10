import { z } from "zod"
import { evmAddress } from "@walty/shared/api-utils/zodHelpers"

// Structural request-boundary schemas for the refund-request endpoints. The
// amount-cap check (override ≤ collected), refund policy gates and on-chain tx
// verification stay in the route handler — they need the payment row and RPC.

export const refundCreateBody = z.object({
  paymentRequestId: z.string().min(1),
  destinationAddress: evmAddress,
  reason: z.string().trim().min(1),
  // Optional override amounts in base units / USD, both as strings (the client
  // sends BigInt#toString() and a formatted decimal). Parsed with BigInt in the
  // handler, which enforces > 0 and ≤ collected.
  amountToken: z.string().min(1).optional(),
  amountUsd: z.string().min(1).optional(),
})

export const refundPatchBody = z.object({
  action: z.enum(["approve", "reject", "mark_executed"]),
  // Required only for mark_executed; the handler enforces presence + hex there
  // (it also runs on-chain verification on it).
  txHash: z.string().optional(),
})
