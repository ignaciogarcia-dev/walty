import { z } from "zod"
import { evmAddress } from "@walty/shared/api-utils/zodHelpers"

// Request-boundary schemas for the POS-device endpoints.

// Owner creates a POS: the browser derives the child wallet (walletAddress at
// derivationIndex, via the owner MPC ceremony) and generates the Ed25519
// keypair, sending only the public key (32-byte hex).
export const posDeviceCreateBody = z.object({
  name: z.string().trim().min(1).max(64),
  publicKey: z.string().regex(/^[0-9a-fA-F]{64}$/, "publicKey must be 32-byte hex"),
  derivationIndex: z.number().int().positive(),
  walletAddress: evmAddress,
})

// A POS creating a charge: the destination wallet is forced to the device's own
// child wallet server-side, so it is not part of the body.
export const posPaymentCreateBody = z.object({
  amountUsd: z.string().min(1),
  token: z.string().min(1),
  isSplitPayment: z.boolean().optional(),
})

export const posPaymentCancelParams = z.object({
  id: z.string().min(1),
})
