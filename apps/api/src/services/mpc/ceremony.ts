// Transport-agnostic server-side orchestrator for a 2-of-3 DKLS23 ceremony
// (keygen/sign/refresh). Drives one MpcServer* state machine through its rounds
// and enforces the on-wire guards (sequence/replay, expiry, round order, keyId
// ownership, abort, timeout) without importing socket.io.
//
// Topology: browser runs device(0) and backup(2), server runs server(1). One
// ceremony per client connection. Client relays the bundle of wire frames
// addressed to the server; orchestrator feeds them in and returns the server's
// outbound bundle for the client to route to its local parties (by real partyId,
// inside MpcServerParty).
//
// One submitRound call per protocol step. Payload is base64(JSON(string[])) of
// base64 wire frames. Never logs payloads or share bytes.

import { and, eq } from "drizzle-orm"
import { db, mpcKeys, mpcServerShares, mpcChildAddresses } from "@walty/db"
import { randomUUID } from "node:crypto"
import type { MpcCeremonyType } from "@walty/shared/mpc/messages"
import {
  MpcServerKeygen,
  MpcServerSign,
  MpcServerRefresh,
  MpcServerRecover,
  loadServerKeyshare,
  persistServerKey,
} from "./MpcServerParty.js"
import { encryptShare, type ShareContext } from "./serverShareStore.js"
import type { EthSignature } from "./signature.js"

/** Window in which a round must make progress before it's reaped. Also the
 *  per-message expiresAt horizon. */
export const MPC_ROUND_TIMEOUT_MS = 30_000

/** Read at call time so tests can override via MPC_ROUND_TIMEOUT_MS env; unset
 *  in production. */
function roundTimeoutMs(): number {
  const raw = Number(process.env.MPC_ROUND_TIMEOUT_MS)
  return Number.isFinite(raw) && raw > 0 ? raw : MPC_ROUND_TIMEOUT_MS
}

const PARTICIPANTS = 3
const THRESHOLD = 2
const SERVER_PARTY_ID = 1

// Bundle codec: base64(JSON(string[])) of base64 wire frames. The WASM library
// only ever sees the inner bytes.
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

// Single typed error so transport reacts uniformly. Reasons are coarse and
// never carry sensitive material.
export type CeremonyErrorReason =
  | "invalid_payload"
  | "replay"
  | "expired"
  | "expiry_too_far"
  | "out_of_order"
  | "ownership"
  | "aborted"
  | "completed"
  | "timeout"
  | "ceremony_type_mismatch"
  | "key_required"
  | "party_mismatch"
  | "internal"

export class CeremonyError extends Error {
  reason: CeremonyErrorReason
  constructor(reason: CeremonyErrorReason, message?: string) {
    super(message ?? reason)
    this.name = "CeremonyError"
    this.reason = reason
  }
}

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
  /**
   * HD-under-MPC index for sign: omit/0 = owner master ("m"); i>=1 = cashier i's
   * child key ("m/i"). A child index must already be registered in
   * mpc_child_addresses (so the server knows the address to assemble against),
   * unless `derive` is set.
   */
  derivationIndex?: number
  /**
   * Derive mode: sign at m/i purely to learn the child address (the client
   * recovers it from the device [R,S]). The server skips assembly and does not
   * require the address to be registered. Only valid with derivationIndex>=1.
   */
  derive?: boolean
}

type Engine =
  | { kind: "dkg"; party: MpcServerKeygen }
  | { kind: "refresh"; party: MpcServerRefresh; keyId: string; ctx: ShareContext }
  | { kind: "recover"; party: MpcServerRecover; keyId: string; ctx: ShareContext }
  | {
      kind: "sign"
      party: MpcServerSign
      keyId: string
      hash: `0x${string}`
      address: string
      lastSent: boolean
      /** Derive mode: signing at m/i only to LEARN the child address (the client
       *  recovers it from the device [R,S]); the server skips assembly. */
      derive: boolean
    }

export class Ceremony {
  readonly ceremonyId: string
  readonly userId: number
  readonly ceremonyType: MpcCeremonyType
  /** keyId the ceremony is bound to (set for sign/refresh; set after DKG persist). */
  keyId: string | null

  /** Highest accepted sequence; next must be strictly greater (replay guard). */
  private lastSequence = -1
  /** Bound from the first accepted message; every later message must match
   *  ("party_mismatch"). */
  private boundPartyId: number | null = null
  /** Round expected next (0-based). */
  private step = 0
  private status: "init" | "running" | "completed" | "aborted" = "init"
  private engine: Engine | null = null
  /** Deadline for the next inbound step; refreshed on every step. */
  private deadline: number
  /** Fires at deadline to abort an idle ceremony so WASM state doesn't leak
   *  until disconnect. Reset every accepted round, cleared on teardown. */
  private reaper: ReturnType<typeof setTimeout> | null = null
  /** Fires once on terminal state so transport drops its map entry and the
   *  per-user live-ceremony counter. */
  private onTeardown: (() => void) | null = null
  private teardownNotified = false

  private constructor(init: CeremonyInit) {
    this.ceremonyId = randomUUID()
    this.userId = init.userId
    this.ceremonyType = init.ceremonyType
    this.keyId = init.keyId ?? null
    this.deadline = Date.now() + roundTimeoutMs()
  }

  /** Register the teardown hook and arm the reaper. If the ceremony already
   *  finished (fast-path error), the hook fires now. */
  onTeardownOnce(hook: () => void): void {
    this.onTeardown = hook
    if (this.isTerminal) {
      this.notifyTeardown()
      return
    }
    this.armReaper()
  }

  /** TEST-ONLY: force the next deadline so a test can hit the reap path without
   *  waiting the full timeout. Throws in production. */
  forceDeadlineForTest(deadline: number): void {
    if (process.env.NODE_ENV === "production") {
      throw new Error("forceDeadlineForTest must not be called in production")
    }
    this.deadline = deadline
    if (!this.isTerminal) this.armReaper()
  }

  private armReaper(): void {
    this.clearReaper()
    if (this.isTerminal) return
    const delay = Math.max(0, this.deadline - Date.now())
    this.reaper = setTimeout(() => {
      this.reaper = null
      this.abort("timeout")
    }, delay)
    // don't keep the process alive on a stalled ceremony
    this.reaper.unref?.()
  }

  private clearReaper(): void {
    if (this.reaper) {
      clearTimeout(this.reaper)
      this.reaper = null
    }
  }

  private notifyTeardown(): void {
    if (this.teardownNotified) return
    this.teardownNotified = true
    const hook = this.onTeardown
    this.onTeardown = null
    if (hook) {
      try {
        hook()
      } catch {
        /* best effort */
      }
    }
  }

  /** Expiry the client should stamp on its next message. */
  get expiresAt(): number {
    return this.deadline
  }

  /** Init a ceremony, loading any required keyshare and verifying keyId
   *  ownership. Returns the server's first outbound bundle for the client to
   *  relay. */
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
      ceremony.deadline = Date.now() + roundTimeoutMs()
      return { ceremony, firstOutbound, expiresAt: ceremony.deadline }
    }

    if (init.ceremonyType === "recover") {
      // keyId optional: look up the user's key if not provided (each user has one).
      let resolvedKeyId = init.keyId
      if (!resolvedKeyId) {
        const key = await db.query.mpcKeys.findFirst({
          where: eq(mpcKeys.userId, init.userId),
        })
        if (!key) throw new CeremonyError("key_required", "no MPC key found for user")
        resolvedKeyId = key.id
      }
      await ceremony.assertKeyOwnership(resolvedKeyId)
      ceremony.keyId = resolvedKeyId

      let loaded
      try {
        loaded = await loadServerKeyshare(resolvedKeyId)
      } catch {
        throw new CeremonyError("internal", "unable to load server keyshare")
      }

      const LOST_SHARES = new Uint8Array([0]) // party 0 (device) is lost
      const party = new MpcServerRecover(loaded.keyshareBytes, LOST_SHARES)
      ceremony.engine = { kind: "recover", party, keyId: resolvedKeyId, ctx: loaded.ctx }
      const firstOutbound = encodeBundle(party.firstMessage())
      ceremony.status = "running"
      ceremony.step = 1
      ceremony.deadline = Date.now() + roundTimeoutMs()
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

      // HD path + the address we'll assemble/verify against. Master ("m") is the
      // owner; a child ("m/i") is a cashier's derived key. In DERIVE mode we sign
      // at m/i only to let the client learn the address (it recovers it from the
      // device [R,S]); the server skips assembly and the address need not exist
      // yet. In normal mode a child address must already be registered.
      const index = init.derivationIndex ?? 0
      const derive = init.derive === true && index > 0
      let path = "m"
      let signAddress = keyRow.address
      if (index > 0) {
        path = `m/${index}`
        if (!derive) {
          const child = await db.query.mpcChildAddresses.findFirst({
            where: and(
              eq(mpcChildAddresses.keyId, init.keyId),
              eq(mpcChildAddresses.derivationIndex, index),
            ),
          })
          if (!child) {
            throw new CeremonyError("invalid_payload", `child address not registered for index ${index}`)
          }
          signAddress = child.address
        }
      }

      const party = new MpcServerSign(loaded.keyshareBytes, path)
      ceremony.engine = {
        kind: "sign",
        party,
        keyId: init.keyId,
        hash: init.signHash,
        address: signAddress,
        lastSent: false,
        derive,
      }
      const firstOutbound = encodeBundle(party.firstMessage())
      ceremony.status = "running"
      ceremony.step = 1
      ceremony.deadline = Date.now() + roundTimeoutMs()
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
    ceremony.deadline = Date.now() + roundTimeoutMs()
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

  /** Check one inbound message's metadata against the protocol guards before
   *  the payload is decoded. Throws CeremonyError on violation; never touches
   *  the WASM engine. */
  private guard(meta: {
    ceremonyType: MpcCeremonyType
    keyId: string
    partyId: number
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
    if (Date.now() > this.deadline) {
      this.abort("timeout")
      throw new CeremonyError("timeout", "ceremony round timed out")
    }
    if (Date.now() > meta.expiresAt) {
      throw new CeremonyError("expired", "message expired")
    }
    // upper-clamp expiry so a client can't stamp a huge value to defeat the
    // per-message expiry
    const SKEW = 5_000
    if (meta.expiresAt > Date.now() + roundTimeoutMs() + SKEW) {
      throw new CeremonyError("expiry_too_far", "expiresAt is unreasonably far in the future")
    }
    if (meta.ceremonyType !== this.ceremonyType) {
      throw new CeremonyError("ceremony_type_mismatch", "ceremonyType mismatch")
    }
    // sign/refresh: keyId must match the bound one. dkg: keyId is the client's
    // placeholder, only required to stay stable.
    if (this.keyId !== null && meta.keyId !== this.keyId) {
      throw new CeremonyError("ownership", "keyId mismatch for ceremony")
    }
    if (this.keyId === null && this.ceremonyType === "dkg") {
      this.keyId = meta.keyId
    }
    // bind partyId on first message; must stay constant
    if (this.boundPartyId === null) {
      this.boundPartyId = meta.partyId
    } else if (meta.partyId !== this.boundPartyId) {
      throw new CeremonyError("party_mismatch", "partyId changed mid-ceremony")
    }
    if (meta.sequence <= this.lastSequence) {
      throw new CeremonyError("replay", "sequence is not strictly increasing")
    }
    if (meta.round !== this.step) {
      throw new CeremonyError("out_of_order", "round out of order")
    }
  }

  /** Accept one validated step, advance the server party one round, return the
   *  outbound bundle. On the terminal round it finalises (dkg/refresh persist +
   *  keyId; sign returns the signature). meta is already schema-validated by
   *  transport. */
  async submitRound(meta: {
    ceremonyType: MpcCeremonyType
    keyId: string
    partyId: number
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
            : this.ceremonyType === "recover"
              ? await this.stepRecover(inbound)
              : await this.stepSign(inbound)

      // advance guard state only after the engine accepted the step, so a
      // rejected message doesn't burn the sequence
      this.lastSequence = meta.sequence
      this.step += 1
      this.deadline = Date.now() + roundTimeoutMs()
      result.expiresAt = this.deadline
      if (!this.isTerminal) this.armReaper()
      return result
    } catch (err) {
      // any engine error tears down the session (frees WASM); no resume
      if (!(err instanceof CeremonyError && err.reason === "completed")) {
        this.abort("engine_error")
      }
      if (err instanceof CeremonyError) throw err
      // Log the raw error before wrapping so we can diagnose WASM failures
      console.error("[ceremony] engine error at step", this.step, "type", this.ceremonyType, ":", err instanceof Error ? err.message : err)
      throw new CeremonyError("internal", "ceremony step failed")
    }
  }

  // server-party rounds, matching MpcServerKeygen.handle():
  //   1: r1 → r2 outbound + server commitment wire appended
  //   2: r2 → r3 outbound
  //   3: r3 + peer commitments → r4 outbound
  //   4: r4 → done; finish() + persist
  private async stepDkg(inbound: Uint8Array[]): Promise<CeremonyStepResult> {
    if (this.engine?.kind !== "dkg") throw new CeremonyError("internal")
    const party = this.engine.party
    const stepResult = party.handle(inbound)

    if (!stepResult.done) {
      const outFrames = [...stepResult.outbound]
      // server commitment only becomes available after round 1; client needs it
      // for its round-4a transition
      if (this.step === 1) {
        outFrames.push(party.getCommitmentWire())
      }
      return {
        outbound: encodeBundle(outFrames),
        done: false,
        expiresAt: this.deadline,
      }
    }

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

    // refreshed share keeps the same pubkey/keyId; re-encrypt and bump version
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

  private async stepRecover(inbound: Uint8Array[]): Promise<CeremonyStepResult> {
    if (this.engine?.kind !== "recover") throw new CeremonyError("internal")
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

    // Re-persist the server share under the same keyId (share may be refreshed).
    const recovered = party.finish()
    try {
      const nextVersion = ctx.version + 1
      const newCtx: ShareContext = { ...ctx, version: nextVersion }
      const enc = await encryptShare(newCtx, recovered.keyshareBytes)
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

  // server-party rounds, matching MpcServerSign:
  //   1: r1 → r2 outbound
  //   2: r2 → r3 outbound
  //   3: r3 → [] (internal), then lastMessage(hash) → last outbound
  //   4: combine(peer last) → assembled signature; done
  private async stepSign(inbound: Uint8Array[]): Promise<CeremonyStepResult> {
    if (this.engine?.kind !== "sign") throw new CeremonyError("internal")
    const eng = this.engine
    const party = eng.party

    // step 4: inbound is the peer's last message(s) to combine
    if (eng.lastSent) {
      // Derive mode: the device already produced its own [R,S] (the client uses
      // it to recover the child address). The server has nothing to assemble — it
      // doesn't know the address yet — so just complete.
      if (eng.derive) {
        this.teardown("completed")
        return { outbound: encodeBundle([]), done: true, expiresAt: this.deadline }
      }
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
      // rounds 1–2: P2P outbound
      return {
        outbound: encodeBundle(stepResult.outbound),
        done: false,
        expiresAt: this.deadline,
      }
    }

    // round 3 returns empty outbound, so emit the last message immediately
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

  /** Mark aborted, clear state, free WASM. Idempotent. */
  abort(_reason: string): void {
    if (this.status === "completed" || this.status === "aborted") {
      // already terminal, but still ensure engine/timer/hook are cleared
      this.freeEngine()
      this.clearReaper()
      if (this.status !== "completed") this.status = "aborted"
      this.notifyTeardown()
      return
    }
    this.teardown("aborted")
  }

  private teardown(finalStatus: "completed" | "aborted"): void {
    this.clearReaper()
    this.freeEngine()
    this.status = finalStatus
    // safe to call on a submitRound success path: the hook only touches the
    // transport's own maps/counters
    this.notifyTeardown()
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

  /** Terminal = completed or aborted. */
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
