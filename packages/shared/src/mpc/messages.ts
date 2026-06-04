import { z } from "zod"

// ---------------------------------------------------------------------------
// Ceremony types
// ---------------------------------------------------------------------------

export const CEREMONY_TYPES = ["dkg", "sign", "refresh"] as const
export const mpcCeremonyType = z.enum(CEREMONY_TYPES)
export type MpcCeremonyType = z.infer<typeof mpcCeremonyType>

// ---------------------------------------------------------------------------
// Payload size cap
//
// The Silence Labs ECDSA library produces key-share blobs of ~247 KB in the
// largest DKG round (2-of-2 party). Base64 encoding inflates that by ~33%,
// yielding ~330 KB per share.  A single round message carries at most one
// such blob, so the tightest mathematically correct cap would be ~350 KB.
// We set the limit at 2 MB (2_000_000 base64 chars) to give comfortable
// headroom for future share-size growth and multi-blob rounds while still
// providing a meaningful bound against payload-amplification abuse
// (an unbounded payload could exhaust server memory or browser JS heap if
// many parties send simultaneously).
// ---------------------------------------------------------------------------

export const MPC_PAYLOAD_MAX_BYTES = 2_000_000

// ---------------------------------------------------------------------------
// mpcRoundMessage — a single round message exchanged over the /mpc namespace
// ---------------------------------------------------------------------------

export const mpcRoundMessage = z.object({
  /** Unique identifier for this ceremony instance. */
  ceremonyId: z.string().uuid(),

  /** Identifier of the distributed key being generated / used / refreshed. */
  keyId: z.string().uuid(),

  /** Which ceremony this message belongs to. */
  ceremonyType: mpcCeremonyType,

  /**
   * The real DKG party index (not an array index) assigned by the session
   * coordinator.  Starts at 0; libraries typically label parties 1..n but
   * we normalise to 0-based here and let the adapter layer translate.
   */
  partyId: z.number().int().min(0),

  /** Round number within the ceremony.  Starts at 0. */
  round: z.number().int().min(0),

  /**
   * Monotonically increasing counter per (ceremonyId, partyId) pair.
   * Receivers must reject a message whose sequence is not strictly greater
   * than the last accepted sequence for that sender to prevent replay.
   */
  sequence: z.number().int().min(0),

  /**
   * Absolute expiry as epoch milliseconds.  Receivers must call
   * `Date.now() > expiresAt` and drop the message if the check is true.
   */
  expiresAt: z.number().int().positive(),

  /**
   * Base64-encoded opaque bytes produced by the MPC WASM library for this
   * round.  The receiver hands this blob directly to the library without
   * further parsing.
   *
   * Cap: 2 MB (see MPC_PAYLOAD_MAX_BYTES for rationale).
   */
  payload: z.string().max(MPC_PAYLOAD_MAX_BYTES),
})

export type MpcRoundMessage = z.infer<typeof mpcRoundMessage>

// ---------------------------------------------------------------------------
// mpcAbortMessage — explicit ceremony abort sent by any party
// ---------------------------------------------------------------------------

export const mpcAbortMessage = z.object({
  /** Identifies the ceremony being aborted. */
  ceremonyId: z.string().uuid(),

  /** Identifies the key associated with the ceremony. */
  keyId: z.string().uuid(),

  /** Human-readable reason for the abort (logged server-side, max 200 chars). */
  reason: z.string().max(200),
})

export type MpcAbortMessage = z.infer<typeof mpcAbortMessage>

// ---------------------------------------------------------------------------
// Helper: parse + narrow with a typed throw
// ---------------------------------------------------------------------------

/**
 * Validates `input` against the mpcRoundMessage schema and returns the typed
 * value.  Throws a `ZodError` (which is a subclass of `Error`) on failure —
 * consistent with how the rest of the codebase surfaces validation errors via
 * `schema.parse(...)`.
 */
export function parseMpcRoundMessage(input: unknown): MpcRoundMessage {
  return mpcRoundMessage.parse(input)
}
