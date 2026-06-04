import { z } from "zod"

// ---------------------------------------------------------------------------
// Ceremony types
// ---------------------------------------------------------------------------

export const CEREMONY_TYPES = ["dkg", "sign", "refresh"] as const
export const mpcCeremonyType = z.enum(CEREMONY_TYPES)
export type MpcCeremonyType = z.infer<typeof mpcCeremonyType>

// ---------------------------------------------------------------------------
// Payload size cap (reconciled with the socket.io transport buffer)
//
// A round `payload` is a base64(JSON(string[])) bundle of wire frames. The
// largest REAL bundle, measured end-to-end across DKG / sign / refresh in the
// live e2e (scripts/mpc-e2e), is the DKG/refresh round-3 inbound (and the
// round-2 outbound) at ~253 KB of base64 — a single ~187 KB keyshare blob plus
// the JSON envelope / per-frame base64 overhead. (The earlier "~330 KB" figure
// in this comment was a worst-case estimate; the measured value is ~253 KB.)
//
// We set the schema cap at 1 MB (1_000_000 base64 chars). That is ~4× the
// largest real round, leaving comfortable headroom for future share-size growth
// and multi-blob rounds, while still bounding payload-amplification abuse (an
// unbounded payload could exhaust server memory or the browser JS heap).
//
// IMPORTANT — this MUST agree with the socket.io `maxHttpBufferSize` set on the
// Server in apps/api/src/ws/io.ts. socket.io measures the WHOLE packet (the
// engine.io/JSON envelope, the event name, and the base64 payload string), so
// io.ts sets `maxHttpBufferSize` slightly ABOVE this value (1.2 MB) to fit a
// full 1 MB payload plus that envelope. The two caps describe the SAME ~1 MB
// effective bound: this one rejects oversize payloads at the schema layer; the
// transport one is the hard backstop that drops the connection before a frame
// of that size is ever buffered.
// ---------------------------------------------------------------------------

export const MPC_PAYLOAD_MAX_BYTES = 1_000_000

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
   * Cap: 1 MB (see MPC_PAYLOAD_MAX_BYTES for the reconciled rationale).
   */
  payload: z.string().max(MPC_PAYLOAD_MAX_BYTES),
})

export type MpcRoundMessage = z.infer<typeof mpcRoundMessage>

// ---------------------------------------------------------------------------
// mpcCeremonyStart — client request to begin a ceremony on the /mpc namespace
// ---------------------------------------------------------------------------

export const mpcCeremonyStart = z.object({
  /** Which ceremony to begin. */
  ceremonyType: mpcCeremonyType,

  /** Required for sign / refresh; ignored for dkg (a new key is generated). */
  keyId: z.string().uuid().optional(),

  /** For sign: the 32-byte message hash to sign, as 0x-prefixed hex. */
  signHash: z
    .string()
    .regex(/^0x[0-9a-fA-F]{64}$/)
    .optional(),
})

export type MpcCeremonyStart = z.infer<typeof mpcCeremonyStart>

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
