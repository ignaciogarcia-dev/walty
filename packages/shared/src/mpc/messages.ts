import { z } from "zod"

export const CEREMONY_TYPES = ["dkg", "sign", "refresh", "recover"] as const
export const mpcCeremonyType = z.enum(CEREMONY_TYPES)
export type MpcCeremonyType = z.infer<typeof mpcCeremonyType>

// Schema-layer cap on a round payload (base64). Largest real round is ~253 KB
// (DKG/refresh keyshare blob); 1 MB leaves headroom while bounding memory-abuse.
// Must stay below the socket.io maxHttpBufferSize in apps/api/src/ws/io.ts
// (set to 1.2 MB to fit this payload plus the engine.io envelope) — same bound,
// this rejects at the schema layer, the transport cap is the hard backstop.
export const MPC_PAYLOAD_MAX_BYTES = 1_000_000

export const mpcRoundMessage = z.object({
  ceremonyId: z.string().uuid(),
  keyId: z.string().uuid(),
  ceremonyType: mpcCeremonyType,

  // Real DKG party index, not an array index — normalised to 0-based here
  // (libraries usually label 1..n); the adapter layer translates.
  partyId: z.number().int().min(0),

  round: z.number().int().min(0),

  // Strictly-increasing per ceremony. A ceremony has one bound remote party
  // (partyId fixed on the first message), so the server keeps one last-accepted
  // sequence and rejects anything not greater — replay guard.
  sequence: z.number().int().min(0),

  // Epoch ms; receivers drop the message once Date.now() > expiresAt.
  expiresAt: z.number().int().positive(),

  // Opaque base64 bytes from the MPC WASM lib, handed back to it unparsed.
  payload: z.string().max(MPC_PAYLOAD_MAX_BYTES),
})

export type MpcRoundMessage = z.infer<typeof mpcRoundMessage>

export const mpcCeremonyStart = z.object({
  ceremonyType: mpcCeremonyType,

  // Required for sign / refresh; ignored for dkg (generates a new key).
  keyId: z.string().uuid().optional(),

  // sign only: 32-byte message hash as 0x-prefixed hex.
  signHash: z
    .string()
    .regex(/^0x[0-9a-fA-F]{64}$/)
    .optional(),

  // HD-under-MPC derivation index for sign: omit/0 = owner master ("m"),
  // i>=1 = cashier i's child key ("m/i"). Non-hardened only.
  derivationIndex: z.number().int().min(0).optional(),

  // Derive mode: sign at m/i only to learn the child address (server skips
  // assembly, address need not be registered). Valid with derivationIndex>=1.
  derive: z.boolean().optional(),
})

export type MpcCeremonyStart = z.infer<typeof mpcCeremonyStart>

export const mpcAbortMessage = z.object({
  ceremonyId: z.string().uuid(),
  keyId: z.string().uuid(),
  // Logged server-side.
  reason: z.string().max(200),
})

export type MpcAbortMessage = z.infer<typeof mpcAbortMessage>

// Throws ZodError on failure, like the rest of the codebase's parse(...) calls.
export function parseMpcRoundMessage(input: unknown): MpcRoundMessage {
  return mpcRoundMessage.parse(input)
}
