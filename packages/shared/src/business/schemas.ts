import { z } from "zod"
import { evmAddress } from "@walty/shared/api-utils/zodHelpers"

// Structural request-boundary schemas for the business management endpoints.
// Membership/role uniqueness, derivation-index collisions, operator-balance
// gates and MPC child registration stay in the route handlers (DB/chain bound).

export const businessSettingsBody = z.object({
  name: z.string().trim().min(2).max(80),
})

export const memberInviteBody = z.object({
  role: z.enum(["cashier"]),
  walletAddress: evmAddress,
  // Non-hardened HD child index for the cashier's operator wallet; >= 1.
  derivationIndex: z.number().int().min(1),
  inviteEmail: z.string().email().optional(),
  // Clamped to [1, 30] in the handler; default 7 when omitted.
  expiresInDays: z.number().int().positive().optional(),
})

export const memberPatchBody = z.object({
  action: z.enum(["change_role", "suspend", "revoke", "reactivate"]),
  // Required only for change_role; the handler enforces the valid role there.
  role: z.enum(["cashier"]).optional(),
})
