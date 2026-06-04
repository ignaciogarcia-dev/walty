// apps/api/src/services/mpc/MpcServerParty.ts
//
// Transport-agnostic wrapper that drives the SERVER party through the
// DKLS23 keygen / sign / refresh state machine.
//
// Design:
//   - Takes and returns raw protocol message bytes (Uint8Array).
//   - Round sequencing mirrors scripts/mpc-dkls-spike.ts exactly.
//   - Routes messages by REAL DKG partyId (from_id / to_id in Message),
//     NOT array index — critical invariant for the {server,backup} quorum.
//   - Enforces .free() on all WASM objects to avoid WASM memory leaks.
//   - Persistence functions use serverShareStore + @walty/db.
//
// Wire message format (Uint8Array envelope):
//   byte 0  — from_id (source party id)
//   byte 1  — to_id   (dest party id, 0xff = broadcast)
//   byte 2+ — WASM Message payload
//
// Commitment wire format (used in round-3 → round-4 transition):
//   byte 0  — from_id (party that computed this commitment)
//   byte 1  — 0xfe    (sentinel distinguishing commitment from regular message)
//   byte 2+ — Uint8Array from calculateChainCodeCommitment()
//
// Transport (socket.io /mpc namespace) wraps these in envelopes — Task 5.

import {
  KeygenSession,
  Keyshare,
  Message,
  SignSession,
} from "@silencelaboratories/dkls-wasm-ll-node"
import { publicKeyToAddress } from "viem/utils"
import { encryptShare, decryptShare, type ShareContext } from "./serverShareStore.js"
import { db, mpcKeys, mpcServerShares } from "@walty/db"
import { eq } from "drizzle-orm"

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface RoundStep {
  /** Outbound messages to be forwarded to peer parties. */
  outbound: Uint8Array[]
  /** True when this round produces a terminal result (call finish() next). */
  done: boolean
}

// ---------------------------------------------------------------------------
// Wire-format helpers
// ---------------------------------------------------------------------------

const COMMITMENT_SENTINEL = 0xfe
const BROADCAST_SENTINEL = 0xff

/** Serialize a WASM Message to the wire envelope, then free it. */
function serializeMessage(msg: Message): Uint8Array {
  const payload = msg.payload
  const result = new Uint8Array(2 + payload.length)
  result[0] = msg.from_id
  result[1] = msg.to_id === undefined ? BROADCAST_SENTINEL : msg.to_id
  result.set(payload, 2)
  msg.free()
  return result
}

/** Deserialize a wire envelope to a WASM Message. */
function deserializeMessage(raw: Uint8Array): Message {
  const from = raw[0]
  const toRaw = raw[1]
  const payload = raw.slice(2)
  const to = toRaw === BROADCAST_SENTINEL ? undefined : toRaw
  return new Message(payload, from, to)
}

/** Broadcast filter: all messages NOT from `partyId`, cloned. */
function filterMessages(msgs: Message[], partyId: number): Message[] {
  return msgs.filter((m) => m.from_id !== partyId).map((m) => m.clone())
}

/** P2P select: messages addressed to `partyId`, cloned. */
function selectMessages(msgs: Message[], partyId: number): Message[] {
  return msgs.filter((m) => m.to_id === partyId).map((m) => m.clone())
}

/**
 * Split an inbound Uint8Array[] into:
 *   - Regular wire messages (deserialised to WASM Message)
 *   - Commitment payloads keyed by from_id (byte 1 === COMMITMENT_SENTINEL)
 */
function splitInbound(
  inbound: Uint8Array[],
): { messages: Message[]; commitments: Map<number, Uint8Array> } {
  const messages: Message[] = []
  const commitments = new Map<number, Uint8Array>()
  for (const raw of inbound) {
    if (raw[1] === COMMITMENT_SENTINEL) {
      commitments.set(raw[0], raw.slice(2))
    } else {
      messages.push(deserializeMessage(raw))
    }
  }
  return { messages, commitments }
}

// ---------------------------------------------------------------------------
// Public wire-format utilities (used by tests and Task 5 transport layer)
// ---------------------------------------------------------------------------

/**
 * Encode a chain-code commitment into the sentinel wire format.
 * Format: [from_id][0xfe][commitment bytes]
 */
export function encodeCommitment(fromPartyId: number, commitmentBytes: Uint8Array): Uint8Array {
  const result = new Uint8Array(2 + commitmentBytes.length)
  result[0] = fromPartyId
  result[1] = COMMITMENT_SENTINEL
  result.set(commitmentBytes, 2)
  return result
}

// ---------------------------------------------------------------------------
// Pubkey utilities (mirrors spike's decompressPubkey + viem publicKeyToAddress)
// ---------------------------------------------------------------------------

const P_SECP256K1 = 0xfffffffffffffffffffffffffffffffffffffffffffffffffffffffefffffc2fn

function modPow(base: bigint, exp: bigint, mod: bigint): bigint {
  let result = 1n
  base %= mod
  while (exp > 0n) {
    if (exp & 1n) result = (result * base) % mod
    exp >>= 1n
    base = (base * base) % mod
  }
  return result
}

function u8ToHex(u: Uint8Array): `0x${string}` {
  return ("0x" +
    Array.from(u)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("")) as `0x${string}`
}

/** Decompress a 33-byte secp256k1 public key to the 65-byte uncompressed form. */
function decompressPubkey(compressed: Uint8Array): `0x${string}` {
  if (compressed.length !== 33)
    throw new Error(`decompressPubkey: expected 33 bytes, got ${compressed.length}`)
  const prefix = compressed[0]
  const xBig = BigInt(u8ToHex(compressed.slice(1)))
  const ySq = (modPow(xBig, 3n, P_SECP256K1) + 7n) % P_SECP256K1
  let y = modPow(ySq, (P_SECP256K1 + 1n) / 4n, P_SECP256K1)
  const wantOdd = prefix === 0x03
  if ((y & 1n) !== (wantOdd ? 1n : 0n)) y = P_SECP256K1 - y
  const xHex = xBig.toString(16).padStart(64, "0")
  const yHex = y.toString(16).padStart(64, "0")
  return `0x04${xHex}${yHex}` as `0x${string}`
}

/** Convert a 33-byte compressed secp256k1 public key to an Ethereum checksum address. */
export function compressedPubkeyToAddress(compressed: Uint8Array): string {
  return publicKeyToAddress(decompressPubkey(compressed))
}

// ---------------------------------------------------------------------------
// MpcServerKeygen
//
// Round state machine (maps to spike runDkg):
//   round 0 → firstMessage() → round 1
//   round 1 → handle(filter(r1))          → r2 P2P outbound         → round 2
//   round 2 → handle(select(r2))          → r3 P2P outbound         → round 3
//             getCommitment() is available from round 2 onward
//   round 3 → handle(select(r3) + commitments) → r4 broadcast       → round 4
//   round 4 → handle(filter(r4))          → [], done=true            → round 5
//             finish() extracts the keyshare
// ---------------------------------------------------------------------------

export class MpcServerKeygen {
  private session: KeygenSession
  private readonly partyId: number
  private round: number = 0
  /** Cached commitment (available from round 2 onward). */
  private _commitment: Uint8Array | null = null

  constructor(participants: number, threshold: number, serverPartyId: number) {
    this.partyId = serverPartyId
    this.session = new KeygenSession(participants, threshold, serverPartyId)
  }

  /**
   * Round 1: generate the server's first broadcast message.
   * Must be called exactly once before handle().
   */
  firstMessage(): Uint8Array[] {
    if (this.round !== 0) throw new Error("MpcServerKeygen: firstMessage already called")
    const msg = this.session.createFirstMessage()
    this.round = 1
    return [serializeMessage(msg)]
  }

  /**
   * Returns the server's chain-code commitment as a wire-format commitment message.
   * Only available after handle() has been called for round 1 (i.e., round >= 2).
   * The transport layer must broadcast this to all peer parties before they
   * transition to round 4a.
   */
  getCommitmentWire(): Uint8Array {
    if (this.round < 2 || !this._commitment) {
      throw new Error(
        "MpcServerKeygen: commitment not yet available — call handle() for round 1 first",
      )
    }
    return encodeCommitment(this.partyId, this._commitment)
  }

  /**
   * Feed peer inbound messages for the current round.
   *
   * Rounds 1–2: inbound is Uint8Array[] of serialised wire messages.
   * Round 3: inbound is Uint8Array[] of serialised wire messages PLUS
   *          commitment messages (byte 1 === 0xfe) from all peer parties.
   *          The server's OWN commitment is added internally.
   * Round 4: inbound is Uint8Array[] of broadcast messages for round 4b.
   */
  handle(inbound: Uint8Array[]): RoundStep {
    if (this.round === 1) {
      const { messages } = splitInbound(inbound)
      try {
        const filtered = filterMessages(messages, this.partyId)
        const r2 = this.session.handleMessages(filtered)
        // Compute commitment immediately after round 2 so getCommitmentWire() works
        this._commitment = this.session.calculateChainCodeCommitment()
        this.round = 2
        return { outbound: r2.map(serializeMessage), done: false }
      } finally {
        messages.forEach((m) => { try { m.free() } catch { /* already freed */ } })
      }
    }

    if (this.round === 2) {
      const { messages } = splitInbound(inbound)
      try {
        const selected = selectMessages(messages, this.partyId)
        const r3 = this.session.handleMessages(selected)
        this.round = 3
        return { outbound: r3.map(serializeMessage), done: false }
      } finally {
        messages.forEach((m) => { try { m.free() } catch { /* already freed */ } })
      }
    }

    if (this.round === 3) {
      const { messages, commitments: peerCommitments } = splitInbound(inbound)
      try {
        const selected = selectMessages(messages, this.partyId)

        // Build the full commitments array indexed by partyId
        // Server's own commitment + peer commitments passed in via sentinel format
        const commitMap = new Map<number, Uint8Array>(peerCommitments)
        if (!this._commitment)
          throw new Error("MpcServerKeygen: internal error — commitment missing in round 3")
        commitMap.set(this.partyId, this._commitment)

        const maxPartyId = Math.max(...commitMap.keys())
        const allCommitments: Uint8Array[] = []
        for (let i = 0; i <= maxPartyId; i++) {
          const c = commitMap.get(i)
          if (!c)
            throw new Error(
              `MpcServerKeygen: missing chain code commitment for party ${i}`,
            )
          allCommitments.push(c)
        }

        const r4 = this.session.handleMessages(selected, allCommitments)
        this.round = 4
        return { outbound: r4.map(serializeMessage), done: false }
      } finally {
        messages.forEach((m) => { try { m.free() } catch { /* already freed */ } })
      }
    }

    if (this.round === 4) {
      const { messages } = splitInbound(inbound)
      try {
        const filtered = filterMessages(messages, this.partyId)
        this.session.handleMessages(filtered)
        this.round = 5
        return { outbound: [], done: true }
      } finally {
        messages.forEach((m) => { try { m.free() } catch { /* already freed */ } })
      }
    }

    throw new Error(`MpcServerKeygen: unexpected call to handle() in round ${this.round}`)
  }

  /**
   * Extract the completed keyshare after handle() returns done=true.
   * Consumes the underlying KeygenSession; do not call methods afterward.
   */
  finish(): { keyshareBytes: Buffer; pubkey: string; address: string } {
    if (this.round !== 5)
      throw new Error("MpcServerKeygen: not done yet — call handle() until done=true")
    const keyshare = this.session.keyshare()
    const pubkeyBytes = keyshare.publicKey
    const pubkey = u8ToHex(pubkeyBytes)
    const address = compressedPubkeyToAddress(pubkeyBytes)
    const keyshareBytes = Buffer.from(keyshare.toBytes())
    keyshare.free()
    return { keyshareBytes, pubkey, address }
  }

  /** Release underlying WASM resources. */
  free(): void {
    try { this.session.free() } catch { /* already freed */ }
  }
}

// ---------------------------------------------------------------------------
// persistServerKey
// ---------------------------------------------------------------------------

/**
 * Persist the server's DKG result to the database:
 *   1. Insert an mpc_keys row (status "active", version 1).
 *   2. Encrypt the keyshare via serverShareStore.encryptShare().
 *   3. Insert an mpc_server_shares row.
 *
 * @returns The newly created keyId (UUID).
 */
export async function persistServerKey(
  userId: number,
  dkg: { keyshareBytes: Buffer; pubkey: string; address: string },
): Promise<{ keyId: string }> {
  const [keyRow] = await db
    .insert(mpcKeys)
    .values({
      userId,
      pubkey: dkg.pubkey,
      address: dkg.address,
      status: "active",
      version: 1,
    })
    .returning()

  const keyId = keyRow.id
  const ctx: ShareContext = { userId, keyId, pubkey: dkg.pubkey, version: 1 }
  const enc = await encryptShare(ctx, dkg.keyshareBytes)

  await db.insert(mpcServerShares).values({
    keyId,
    ciphertext: enc.ciphertext,
    nonce: enc.nonce,
    wrappedDek: enc.wrappedDek,
    version: enc.version,
  })

  return { keyId }
}

// ---------------------------------------------------------------------------
// loadServerKeyshare
// ---------------------------------------------------------------------------

/**
 * Load and decrypt the server's key share for a given keyId.
 *
 * @returns The raw keyshare bytes and the ShareContext used for encryption.
 */
export async function loadServerKeyshare(
  keyId: string,
): Promise<{ keyshareBytes: Buffer; ctx: ShareContext }> {
  const keyRow = await db.query.mpcKeys.findFirst({
    where: eq(mpcKeys.id, keyId),
  })
  if (!keyRow) throw new Error(`loadServerKeyshare: key not found: ${keyId}`)

  const shareRow = await db.query.mpcServerShares.findFirst({
    where: eq(mpcServerShares.keyId, keyId),
  })
  if (!shareRow)
    throw new Error(`loadServerKeyshare: server share not found for keyId: ${keyId}`)

  const ctx: ShareContext = {
    userId: keyRow.userId,
    keyId: keyRow.id,
    pubkey: keyRow.pubkey,
    version: keyRow.version,
  }

  const keyshareBytes = await decryptShare(ctx, {
    ciphertext: shareRow.ciphertext,
    nonce: shareRow.nonce,
    wrappedDek: shareRow.wrappedDek,
    version: shareRow.version,
  })

  return { keyshareBytes, ctx }
}

// ---------------------------------------------------------------------------
// MpcServerSign
//
// Round state machine (maps to spike runSign):
//   round 0 → firstMessage() → round 1
//   round 1 → handle(filter(r1))   → r2 P2P outbound   → round 2
//   round 2 → handle(select(r2))   → r3 P2P outbound   → round 3
//   round 3 → handle(select(r3))   → [], done=false     → round 4
//   round 4 → lastMessage(hash)    → last broadcast     → round 5
//   round 5 → combine(filter(last))→ {r, s}             → round 6
//
// NOTE: SignSession CONSUMES the keyshare passed to its constructor.
//   The constructor clones keyshareBytes via Keyshare.fromBytes() so the
//   caller's buffer is not affected.
// ---------------------------------------------------------------------------

const SECP256K1_N = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n
const HALF_N = SECP256K1_N / 2n

export class MpcServerSign {
  private session: SignSession
  private readonly partyId: number
  private round: number = 0

  constructor(keyshareBytes: Buffer) {
    // Clone via fromBytes so the caller's buffer is not affected by the consume
    const keyshare = Keyshare.fromBytes(keyshareBytes)
    this.partyId = keyshare.partyId
    // SignSession consumes the keyshare — the clone is intentionally consumed here
    this.session = new SignSession(keyshare, "m")
  }

  /** Round 1: generate the server's first broadcast message. */
  firstMessage(): Uint8Array[] {
    if (this.round !== 0) throw new Error("MpcServerSign: firstMessage already called")
    const msg = this.session.createFirstMessage()
    this.round = 1
    return [serializeMessage(msg)]
  }

  /**
   * Feed peer messages for rounds 1–3.
   *   round 1: handle(filter(r1)) → r2 P2P outbound
   *   round 2: handle(select(r2)) → r3 P2P outbound
   *   round 3: handle(select(r3)) → [], done=false
   */
  handle(inbound: Uint8Array[]): RoundStep {
    const { messages } = splitInbound(inbound)
    try {
      if (this.round === 1) {
        const filtered = filterMessages(messages, this.partyId)
        const r2 = this.session.handleMessages(filtered)
        this.round = 2
        return { outbound: r2.map(serializeMessage), done: false }
      }
      if (this.round === 2) {
        const selected = selectMessages(messages, this.partyId)
        const r3 = this.session.handleMessages(selected)
        this.round = 3
        return { outbound: r3.map(serializeMessage), done: false }
      }
      if (this.round === 3) {
        const selected = selectMessages(messages, this.partyId)
        this.session.handleMessages(selected)
        this.round = 4
        return { outbound: [], done: false }
      }
      throw new Error(`MpcServerSign: unexpected call to handle() in round ${this.round}`)
    } finally {
      messages.forEach((m) => { try { m.free() } catch { /* already freed */ } })
    }
  }

  /**
   * Round 4: bind the 32-byte message hash to the pre-signature.
   * Returns the final broadcast message for combine().
   */
  lastMessage(hash: Uint8Array): Uint8Array[] {
    if (this.round !== 4)
      throw new Error("MpcServerSign: call handle() for rounds 1–3 first")
    const msg = this.session.lastMessage(hash)
    this.round = 5
    return [serializeMessage(msg)]
  }

  /**
   * Combine peer last-messages to produce the [R, S] signature.
   * S is normalized to low-s (canonical EIP-2 form).
   */
  combine(peerLastMessages: Uint8Array[]): { r: Uint8Array; s: Uint8Array } {
    if (this.round !== 5)
      throw new Error("MpcServerSign: call lastMessage() before combine()")
    const { messages } = splitInbound(peerLastMessages)
    try {
      const filtered = filterMessages(messages, this.partyId)
      const result = this.session.combine(filtered) as [Uint8Array, Uint8Array]
      const [R, S] = result

      // Normalize to low-s (EIP-2)
      let sBig = BigInt(u8ToHex(S))
      if (sBig > HALF_N) sBig = SECP256K1_N - sBig
      const sNorm = new Uint8Array(32)
      const sHex = sBig.toString(16).padStart(64, "0")
      for (let i = 0; i < 32; i++) {
        sNorm[i] = parseInt(sHex.slice(i * 2, i * 2 + 2), 16)
      }

      this.round = 6
      return { r: R, s: sNorm }
    } finally {
      messages.forEach((m) => { try { m.free() } catch { /* already freed */ } })
    }
  }

  /** Release underlying WASM resources. */
  free(): void {
    try { this.session.free() } catch { /* already freed */ }
  }
}

// ---------------------------------------------------------------------------
// MpcServerRefresh
//
// Uses KeygenSession.initKeyRotation(oldShare), then the identical round flow
// as MpcServerKeygen. The resulting share has the SAME combined public key
// but different internal bytes (re-randomized shares).
// ---------------------------------------------------------------------------

export class MpcServerRefresh {
  private session: KeygenSession
  private readonly partyId: number
  private round: number = 0
  private _commitment: Uint8Array | null = null

  constructor(oldKeyshareBytes: Buffer) {
    const oldShare = Keyshare.fromBytes(oldKeyshareBytes)
    this.partyId = oldShare.partyId
    // initKeyRotation consumes (and internally frees) the old share
    this.session = KeygenSession.initKeyRotation(oldShare)
  }

  /** Round 1: generate the server's first broadcast message. */
  firstMessage(): Uint8Array[] {
    if (this.round !== 0) throw new Error("MpcServerRefresh: firstMessage already called")
    const msg = this.session.createFirstMessage()
    this.round = 1
    return [serializeMessage(msg)]
  }

  /**
   * Returns the server's chain-code commitment as a wire-format commitment message.
   * Available from round 2 onward.
   */
  getCommitmentWire(): Uint8Array {
    if (this.round < 2 || !this._commitment) {
      throw new Error(
        "MpcServerRefresh: commitment not available — call handle() for round 1 first",
      )
    }
    return encodeCommitment(this.partyId, this._commitment)
  }

  /**
   * Feed peer messages. Identical contract to MpcServerKeygen.handle().
   * Round 3 requires commitment messages (0xfe sentinel) from peer parties.
   * Returns done=true on round 4 — call finish() next.
   */
  handle(inbound: Uint8Array[]): RoundStep {
    if (this.round === 1) {
      const { messages } = splitInbound(inbound)
      try {
        const filtered = filterMessages(messages, this.partyId)
        const r2 = this.session.handleMessages(filtered)
        this._commitment = this.session.calculateChainCodeCommitment()
        this.round = 2
        return { outbound: r2.map(serializeMessage), done: false }
      } finally {
        messages.forEach((m) => { try { m.free() } catch { /* already freed */ } })
      }
    }

    if (this.round === 2) {
      const { messages } = splitInbound(inbound)
      try {
        const selected = selectMessages(messages, this.partyId)
        const r3 = this.session.handleMessages(selected)
        this.round = 3
        return { outbound: r3.map(serializeMessage), done: false }
      } finally {
        messages.forEach((m) => { try { m.free() } catch { /* already freed */ } })
      }
    }

    if (this.round === 3) {
      const { messages, commitments: peerCommitments } = splitInbound(inbound)
      try {
        const selected = selectMessages(messages, this.partyId)
        const commitMap = new Map<number, Uint8Array>(peerCommitments)
        if (!this._commitment)
          throw new Error("MpcServerRefresh: internal error — commitment missing in round 3")
        commitMap.set(this.partyId, this._commitment)

        const maxPartyId = Math.max(...commitMap.keys())
        const allCommitments: Uint8Array[] = []
        for (let i = 0; i <= maxPartyId; i++) {
          const c = commitMap.get(i)
          if (!c)
            throw new Error(`MpcServerRefresh: missing commitment for party ${i}`)
          allCommitments.push(c)
        }

        const r4 = this.session.handleMessages(selected, allCommitments)
        this.round = 4
        return { outbound: r4.map(serializeMessage), done: false }
      } finally {
        messages.forEach((m) => { try { m.free() } catch { /* already freed */ } })
      }
    }

    if (this.round === 4) {
      const { messages } = splitInbound(inbound)
      try {
        const filtered = filterMessages(messages, this.partyId)
        this.session.handleMessages(filtered)
        this.round = 5
        return { outbound: [], done: true }
      } finally {
        messages.forEach((m) => { try { m.free() } catch { /* already freed */ } })
      }
    }

    throw new Error(`MpcServerRefresh: unexpected call to handle() in round ${this.round}`)
  }

  /**
   * Extract the refreshed keyshare after handle() returns done=true.
   * The public key and address are UNCHANGED from the original share.
   */
  finish(): { keyshareBytes: Buffer; pubkey: string; address: string } {
    if (this.round !== 5)
      throw new Error("MpcServerRefresh: not done yet — call handle() until done=true")
    const keyshare = this.session.keyshare()
    const pubkeyBytes = keyshare.publicKey
    const pubkey = u8ToHex(pubkeyBytes)
    const address = compressedPubkeyToAddress(pubkeyBytes)
    const keyshareBytes = Buffer.from(keyshare.toBytes())
    keyshare.free()
    return { keyshareBytes, pubkey, address }
  }

  /** Release underlying WASM resources. */
  free(): void {
    try { this.session.free() } catch { /* already freed */ }
  }
}
