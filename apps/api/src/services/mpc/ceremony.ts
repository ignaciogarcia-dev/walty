// apps/api/src/services/mpc/ceremony.ts
//
// TRANSPORT-AGNOSTIC ceremony orchestrator for the SERVER side of a 2-of-3
// DKLS23 MPC ceremony. It drives one of the MpcServer* state machines
// (keygen / sign / refresh) through its rounds and enforces the on-wire
// protocol guards (sequence/replay, expiry, round ordering, keyId ownership,
// abort, per-round timeout) WITHOUT importing socket.io.
//
// Topology (see task spec):
//   During DKG the BROWSER runs device(0) and backup(2); the SERVER runs
//   server(1). A ceremony is between ONE client connection and the server's
//   party. The client sends the bundle of wire messages addressed to the
//   server; the orchestrator feeds them to the server party and returns the
//   server's outbound bundle for the client to route to its local parties.
//   Routing is by REAL partyId and is handled inside MpcServerParty.
//
// Step model (one `submitRound` call per protocol step):
//   - The client base64-encodes a JSON array of wire-message envelopes
//     (the [from][to][payload] frames produced by the client's parties,
//     plus 0xfe commitment frames in the relevant DKG/refresh round) and
//     sends it as the `payload` of an mpcRoundMessage.
//   - The orchestrator decodes that bundle, advances the server party one
//     round, and returns the server's outbound bundle (base64 JSON array of
//     wire frames) to send back. When the underlying party signals done the
//     ceremony finalises (DKG/refresh → persist; sign → assemble signature).
//
// The orchestrator NEVER logs payloads or share bytes.

import { eq } from "drizzle-orm"
import { db, mpcKeys, mpcServerShares } from "@walty/db"
import { randomUUID } from "node:crypto"
import type { MpcCeremonyType } from "@walty/shared/mpc/messages"
import {
  MpcServerKeygen,
  MpcServerSign,
  MpcServerRefresh,
  loadServerKeyshare,
  persistServerKey,
} from "./MpcServerParty.js"
import { encryptShare, type ShareContext } from "./serverShareStore.js"
import type { EthSignature } from "./signature.js"

// ---------------------------------------------------------------------------
// Tunables
// ---------------------------------------------------------------------------

/** A single round must make progress within this window or the ceremony is
 *  abortable/cleanable. Also used as the per-message `expiresAt` horizon. */
export const MPC_ROUND_TIMEOUT_MS = 30_000

const PARTICIPANTS = 3
const THRESHOLD = 2
const SERVER_PARTY_ID = 1

// ---------------------------------------------------------------------------
// Bundle codec — a step's payload is a base64(JSON(string[])) of wire frames,
// each wire frame itself base64-encoded. Kept deliberately simple and free of
// any framing the WASM library cares about (it only sees the inner bytes).
// ---------------------------------------------------------------------------

function encodeBundle(frames: Uint8Array[]): string {
  const arr = frames.map((f) => Buffer.from(f).toString("base64"))
  return Buffer.from(JSON.stringify(arr), "utf8").toString("base64")
}

function decodeBundle(payloadB64: string): Uint8Array[] {
  let parsed: unknown
  try {
    parsed = JSON.parse(Buffer.from(payloadB64, "base64").toString("utf8"))
  } catch {
    throw new CeremonyError("invalid_payload", "payload is not a valid bundle")
  }
  if (!Array.isArray(parsed) || !parsed.every((x) => typeof x === "string")) {
    throw new CeremonyError("invalid_payload", "bundle must be an array of strings")
  }
  return (parsed as string[]).map((s) => new Uint8Array(Buffer.from(s, "base64")))
}

// ---------------------------------------------------------------------------
// Errors — a single typed error so the transport layer can react uniformly.
// Reasons are coarse-grained and never carry sensitive material.
// ---------------------------------------------------------------------------

export type CeremonyErrorReason =
  | "invalid_payload"
  | "replay"
  | "expired"
  | "out_of_order"
  | "ownership"
  | "aborted"
  | "completed"
  | "timeout"
  | "ceremony_type_mismatch"
  | "key_required"
  | "internal"

export class CeremonyError extends Error {
  reason: CeremonyErrorReason
  constructor(reason: CeremonyErrorReason, message?: string) {
    super(message ?? reason)
    this.name = "CeremonyError"
    this.reason = reason
  }
}

// ---------------------------------------------------------------------------
// Step result returned to the transport layer.
// ---------------------------------------------------------------------------

export interface CeremonyStepResult {
  /** Base64 bundle of server outbound wire frames to relay to the client. */
  outbound: string
  /** True once the ceremony has fully completed and torn down. */
  done: boolean
  /** Present on DKG/refresh completion. */
  keyId?: string
  /** Present on sign completion. */
  signature?: EthSignature
  /** Fresh per-message expiry the client should stamp on its next message. */
  expiresAt: number
}

export interface CeremonyInit {
  userId: number
  ceremonyType: MpcCeremonyType
  /** Required for sign and refresh; must be omitted/ignored for dkg. */
  keyId?: string
  /** For sign: the 32-byte message hash (0x-prefixed) to be signed. */
  signHash?: `0x${string}`
}

// ---------------------------------------------------------------------------
// Ceremony — the orchestrator state machine.
// ---------------------------------------------------------------------------

type Engine =
  | { kind: "dkg"; party: MpcServerKeygen }
  | { kind: "refresh"; party: MpcServerRefresh; keyId: string; ctx: ShareContext }
  | {
      kind: "sign"
      party: MpcServerSign
      keyId: string
      hash: `0x${string}`
      address: string
      lastSent: boolean
    }

export class Ceremony {
  readonly ceremonyId: string
  readonly userId: number
  readonly ceremonyType: MpcCeremonyType
  /** keyId the ceremony is bound to (set for sign/refresh; set after DKG persist). */
  keyId: string | null

  /** Highest accepted client sequence; the next must be strictly greater. */
  private lastSequence = -1
  /** Current protocol round the orchestrator expects next (0-based step index). */
  private step = 0
  private status: "init" | "running" | "completed" | "aborted" = "init"
  private engine: Engine | null = null
  /** Absolute deadline for the next inbound step; refreshed on every step. */
  private deadline: number

  private constructor(init: CeremonyInit) {
    this.ceremonyId = randomUUID()
    this.userId = init.userId
    this.ceremonyType = init.ceremonyType
    this.keyId = init.keyId ?? null
    this.deadline = Date.now() + MPC_ROUND_TIMEOUT_MS
  }

  /** Per-message expiry the client should stamp on its NEXT message. */
  get expiresAt(): number {
    return this.deadline
  }

  /**
   * Create + initialise a ceremony, loading any required keyshare and
   * verifying keyId ownership. Returns the orchestrator plus the server's
   * FIRST outbound bundle (round 0). The client kicks off by relaying this.
   */
  static async create(
    init: CeremonyInit,
  ): Promise<{ ceremony: Ceremony; firstOutbound: string; expiresAt: number }> {
    const ceremony = new Ceremony(init)

    if (init.ceremonyType === "dkg") {
      const party = new MpcServerKeygen(PARTICIPANTS, THRESHOLD, SERVER_PARTY_ID)
      ceremony.engine = { kind: "dkg", party }
      const firstOutbound = encodeBundle(party.firstMessage())
      ceremony.status = "running"
      ceremony.step = 1
      ceremony.deadline = Date.now() + MPC_ROUND_TIMEOUT_MS
      return { ceremony, firstOutbound, expiresAt: ceremony.deadline }
    }

    // sign / refresh both need an owned, loadable keyId.
    if (!init.keyId) {
      throw new CeremonyError("key_required", "keyId is required for this ceremony")
    }
    await ceremony.assertKeyOwnership(init.keyId)

    let loaded
    try {
      loaded = await loadServerKeyshare(init.keyId)
    } catch {
      throw new CeremonyError("internal", "unable to load server keyshare")
    }

    if (init.ceremonyType === "sign") {
      if (!init.signHash) {
        throw new CeremonyError("invalid_payload", "signHash is required for sign")
      }
      const keyRow = await db.query.mpcKeys.findFirst({
        where: eq(mpcKeys.id, init.keyId),
      })
      if (!keyRow) throw new CeremonyError("ownership", "key not found")
      const party = new MpcServerSign(loaded.keyshareBytes)
      ceremony.engine = {
        kind: "sign",
        party,
        keyId: init.keyId,
        hash: init.signHash,
        address: keyRow.address,
        lastSent: false,
      }
      const firstOutbound = encodeBundle(party.firstMessage())
      ceremony.status = "running"
      ceremony.step = 1
      ceremony.deadline = Date.now() + MPC_ROUND_TIMEOUT_MS
      return { ceremony, firstOutbound, expiresAt: ceremony.deadline }
    }

    // refresh
    const party = new MpcServerRefresh(loaded.keyshareBytes)
    ceremony.engine = {
      kind: "refresh",
      party,
      keyId: init.keyId,
      ctx: loaded.ctx,
    }
    const firstOutbound = encodeBundle(party.firstMessage())
    ceremony.status = "running"
    ceremony.step = 1
    ceremony.deadline = Date.now() + MPC_ROUND_TIMEOUT_MS
    return { ceremony, firstOutbound, expiresAt: ceremony.deadline }
  }

  private async assertKeyOwnership(keyId: string): Promise<void> {
    const row = await db.query.mpcKeys.findFirst({
      where: eq(mpcKeys.id, keyId),
    })
    if (!row || row.userId !== this.userId) {
      throw new CeremonyError("ownership", "keyId does not belong to user")
    }
  }

  /**
   * Validate + apply one inbound round message's metadata against the protocol
   * guards. Throws CeremonyError on any violation. Does NOT touch the WASM
   * engine — callers run this before decoding the payload bundle.
   */
  private guard(meta: {
    ceremonyType: MpcCeremonyType
    keyId: string
    round: number
    sequence: number
    expiresAt: number
  }): void {
    if (this.status === "aborted") {
      throw new CeremonyError("aborted", "ceremony already aborted")
    }
    if (this.status === "completed") {
      throw new CeremonyError("completed", "ceremony already completed")
    }
    // Per-round timeout: no progress past the deadline → abortable.
    if (Date.now() > this.deadline) {
      this.abort("timeout")
      throw new CeremonyError("timeout", "ceremony round timed out")
    }
    // Expiry: the client-stamped expiry must still be in the future.
    if (Date.now() > meta.expiresAt) {
      throw new CeremonyError("expired", "message expired")
    }
    // Ceremony-type must match what this ceremony was created for.
    if (meta.ceremonyType !== this.ceremonyType) {
      throw new CeremonyError("ceremony_type_mismatch", "ceremonyType mismatch")
    }
    // keyId ownership/consistency: for sign/refresh the message keyId must
    // match the bound keyId. For DKG the keyId is the placeholder the client
    // chose; we only require it to be stable across the ceremony.
    if (this.keyId !== null && meta.keyId !== this.keyId) {
      throw new CeremonyError("ownership", "keyId mismatch for ceremony")
    }
    if (this.keyId === null && this.ceremonyType === "dkg") {
      // First DKG message fixes the placeholder keyId so subsequent messages
      // must keep using the same correlation id.
      this.keyId = meta.keyId
    }
    // Replay / old sequence: must be strictly greater than the last accepted.
    if (meta.sequence <= this.lastSequence) {
      throw new CeremonyError("replay", "sequence is not strictly increasing")
    }
    // Round ordering: the message's round must match the step we expect next.
    if (meta.round !== this.step) {
      throw new CeremonyError("out_of_order", "round out of order")
    }
  }

  /**
   * Accept one validated inbound step, advance the server party one round, and
   * return the server's outbound bundle. On the terminal round the ceremony
   * finalises (DKG/refresh → persist + return keyId; sign → return signature).
   *
   * @param meta  Parsed mpcRoundMessage fields (already schema-validated by the
   *              transport layer via parseMpcRoundMessage).
   */
  async submitRound(meta: {
    ceremonyType: MpcCeremonyType
    keyId: string
    round: number
    sequence: number
    expiresAt: number
    payload: string
  }): Promise<CeremonyStepResult> {
    this.guard(meta)

    const inbound = decodeBundle(meta.payload)

    try {
      const result =
        this.ceremonyType === "dkg"
          ? await this.stepDkg(inbound)
          : this.ceremonyType === "refresh"
            ? await this.stepRefresh(inbound)
            : await this.stepSign(inbound)

      // Commit guard state only after the engine accepted the step.
      this.lastSequence = meta.sequence
      this.step += 1
      this.deadline = Date.now() + MPC_ROUND_TIMEOUT_MS
      result.expiresAt = this.deadline
      return result
    } catch (err) {
      // ANY engine error tears down the session (frees WASM) — no resume.
      if (!(err instanceof CeremonyError && err.reason === "completed")) {
        this.abort("engine_error")
      }
      if (err instanceof CeremonyError) throw err
      throw new CeremonyError("internal", "ceremony step failed")
    }
  }

  // --- DKG -----------------------------------------------------------------
  // Steps (server party rounds), matching MpcServerKeygen.handle():
  //   step 1: handle r1 → r2 outbound + server commitment wire appended
  //   step 2: handle r2 → r3 outbound
  //   step 3: handle r3 + peer commitments → r4 outbound
  //   step 4: handle r4 → done; finish() + persist
  private async stepDkg(inbound: Uint8Array[]): Promise<CeremonyStepResult> {
    if (this.engine?.kind !== "dkg") throw new CeremonyError("internal")
    const party = this.engine.party
    const stepResult = party.handle(inbound)

    if (!stepResult.done) {
      const outFrames = [...stepResult.outbound]
      // After round 1's handle the server commitment becomes available and the
      // client needs it for its round-4a transition — append the commitment
      // wire to this step's outbound bundle.
      if (this.step === 1) {
        outFrames.push(party.getCommitmentWire())
      }
      return {
        outbound: encodeBundle(outFrames),
        done: false,
        expiresAt: this.deadline,
      }
    }

    // Terminal: extract the share and persist.
    const dkg = party.finish()
    let keyId: string
    try {
      const persisted = await persistServerKey(this.userId, dkg)
      keyId = persisted.keyId
    } finally {
      this.teardown("completed")
    }
    this.keyId = keyId
    return {
      outbound: encodeBundle([]),
      done: true,
      keyId,
      expiresAt: this.deadline,
    }
  }

  // --- Refresh -------------------------------------------------------------
  private async stepRefresh(inbound: Uint8Array[]): Promise<CeremonyStepResult> {
    if (this.engine?.kind !== "refresh") throw new CeremonyError("internal")
    const { party, keyId, ctx } = this.engine
    const stepResult = party.handle(inbound)

    if (!stepResult.done) {
      const outFrames = [...stepResult.outbound]
      if (this.step === 1) {
        outFrames.push(party.getCommitmentWire())
      }
      return {
        outbound: encodeBundle(outFrames),
        done: false,
        expiresAt: this.deadline,
      }
    }

    // Terminal: the refreshed share has the SAME pubkey; re-encrypt + bump
    // the version, keeping the same keyId/pubkey.
    const refreshed = party.finish()
    try {
      const nextVersion = ctx.version + 1
      const newCtx: ShareContext = { ...ctx, version: nextVersion }
      const enc = await encryptShare(newCtx, refreshed.keyshareBytes)
      await db
        .update(mpcServerShares)
        .set({
          ciphertext: enc.ciphertext,
          nonce: enc.nonce,
          wrappedDek: enc.wrappedDek,
          version: enc.version,
        })
        .where(eq(mpcServerShares.keyId, keyId))
      await db
        .update(mpcKeys)
        .set({ version: nextVersion })
        .where(eq(mpcKeys.id, keyId))
    } finally {
      this.teardown("completed")
    }
    return {
      outbound: encodeBundle([]),
      done: true,
      keyId,
      expiresAt: this.deadline,
    }
  }

  // --- Sign ----------------------------------------------------------------
  // Steps (server party rounds), matching MpcServerSign:
  //   step 1: handle r1 → r2 outbound
  //   step 2: handle r2 → r3 outbound
  //   step 3: handle r3 → [] (internal), then lastMessage(hash) → last outbound
  //   step 4: combine(peer last) → assembled signature; done
  private async stepSign(inbound: Uint8Array[]): Promise<CeremonyStepResult> {
    if (this.engine?.kind !== "sign") throw new CeremonyError("internal")
    const eng = this.engine
    const party = eng.party

    // step 4 = combine: the inbound bundle is the peer's last-message(s).
    if (eng.lastSent) {
      const sig = await party.combineAndAssemble(
        inbound,
        eng.hash,
        eng.address as `0x${string}`,
      )
      this.teardown("completed")
      return {
        outbound: encodeBundle([]),
        done: true,
        signature: sig,
        expiresAt: this.deadline,
      }
    }

    const stepResult = party.handle(inbound)
    if (!stepResult.done && stepResult.outbound.length > 0) {
      // rounds 1–2 produced P2P outbound.
      return {
        outbound: encodeBundle(stepResult.outbound),
        done: false,
        expiresAt: this.deadline,
      }
    }

    // round 3 returns empty outbound → immediately emit the last message.
    const lastFrames = party.lastMessage(
      Uint8Array.from(Buffer.from(eng.hash.slice(2), "hex")),
    )
    eng.lastSent = true
    return {
      outbound: encodeBundle(lastFrames),
      done: false,
      expiresAt: this.deadline,
    }
  }

  // --- Abort / teardown ----------------------------------------------------

  /** Mark aborted, clear all state, and free WASM. Idempotent. */
  abort(_reason: string): void {
    if (this.status === "completed" || this.status === "aborted") {
      // Already terminal — still ensure engine freed.
      this.freeEngine()
      if (this.status !== "completed") this.status = "aborted"
      return
    }
    this.teardown("aborted")
  }

  private teardown(finalStatus: "completed" | "aborted"): void {
    this.freeEngine()
    this.status = finalStatus
  }

  private freeEngine(): void {
    if (this.engine) {
      try {
        this.engine.party.free()
      } catch {
        /* already freed */
      }
      this.engine = null
    }
  }

  /** True once the ceremony reached a terminal state (completed or aborted). */
  get isTerminal(): boolean {
    return this.status === "completed" || this.status === "aborted"
  }

  get isAborted(): boolean {
    return this.status === "aborted"
  }

  get isCompleted(): boolean {
    return this.status === "completed"
  }
}
