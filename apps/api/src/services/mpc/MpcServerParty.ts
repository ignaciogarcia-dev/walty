// Drives the SERVER party through the DKLS23 keygen / sign / refresh rounds.
// Takes and returns raw protocol bytes; routes by REAL DKG partyId (not array
// index), else the {server,backup} quorum breaks. WASM objects must be .free()d.
//
// Wire frame: [from_id][to_id | 0xff broadcast | 0xfe commitment][payload].
// Commitment payload is calculateChainCodeCommitment() bytes.

import {
  KeygenSession,
  Keyshare,
  Message,
  SignSession,
} from "@silencelaboratories/dkls-wasm-ll-node"
import { publicKeyToAddress } from "viem/utils"
import { encryptShare, decryptShare, type ShareContext } from "./serverShareStore.js"
import { assembleEthSignature, SECP256K1_N, type EthSignature } from "./signature.js"
import { db, mpcKeys, mpcServerShares, addresses } from "@walty/db"
import { eq } from "drizzle-orm"

export interface RoundStep {
  /** Outbound messages to be forwarded to peer parties. */
  outbound: Uint8Array[]
  /** True when this round produces a terminal result (call finish() next). */
  done: boolean
}

const COMMITMENT_SENTINEL = 0xfe
const BROADCAST_SENTINEL = 0xff

/** 2-of-3 topology: device(0), server(1), backup(2). */
const VALID_PARTY_IDS = new Set([0, 1, 2])

// Reject malformed/hostile frames at deserialisation so they fail clean rather
// than surfacing later as an opaque "missing commitment" or WASM error.
// from_id ∈ {0,1,2}; to_id ∈ {0,1,2, 0xff broadcast, 0xfe commitment}.
function assertValidFrame(from: number, to: number): void {
  if (!VALID_PARTY_IDS.has(from)) {
    throw new Error(`MpcServerParty: invalid from_id ${from} in wire frame`)
  }
  if (
    to !== BROADCAST_SENTINEL &&
    to !== COMMITMENT_SENTINEL &&
    !VALID_PARTY_IDS.has(to)
  ) {
    throw new Error(`MpcServerParty: invalid to_id ${to} in wire frame`)
  }
}

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
  if (raw.length < 2) throw new Error("invalid mpc frame: too short")
  const from = raw[0]
  const toRaw = raw[1]
  assertValidFrame(from, toRaw)
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

/** Split inbound frames into WASM messages and commitment payloads (keyed by from_id). */
function splitInbound(
  inbound: Uint8Array[],
): { messages: Message[]; commitments: Map<number, Uint8Array> } {
  const messages: Message[] = []
  const commitments = new Map<number, Uint8Array>()
  for (const raw of inbound) {
    if (raw.length < 2) throw new Error("invalid mpc frame: too short")
    if (raw[1] === COMMITMENT_SENTINEL) {
      assertValidFrame(raw[0], raw[1])
      commitments.set(raw[0], raw.slice(2))
    } else {
      messages.push(deserializeMessage(raw))
    }
  }
  return { messages, commitments }
}

/** Encode a chain-code commitment frame: [from_id][0xfe][commitment bytes]. */
export function encodeCommitment(fromPartyId: number, commitmentBytes: Uint8Array): Uint8Array {
  const result = new Uint8Array(2 + commitmentBytes.length)
  result[0] = fromPartyId
  result[1] = COMMITMENT_SENTINEL
  result.set(commitmentBytes, 2)
  return result
}

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

// Round state machine:
//   0 → firstMessage()                     → 1
//   1 → handle(filter(r1))                  → r2 P2P    → 2
//   2 → handle(select(r2))                  → r3 P2P    → 3   (commitment ready from 2)
//   3 → handle(select(r3) + commitments)    → r4 cast   → 4
//   4 → handle(filter(r4))                  → done      → 5   (finish() extracts keyshare)
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

  /** Round 1 first broadcast. Call exactly once before handle(). */
  firstMessage(): Uint8Array[] {
    if (this.round !== 0) throw new Error("MpcServerKeygen: firstMessage already called")
    const msg = this.session.createFirstMessage()
    this.round = 1
    return [serializeMessage(msg)]
  }

  /**
   * Chain-code commitment as a wire frame, available from round 2.
   * Transport must broadcast it to peers before they transition to round 4a.
   */
  getCommitmentWire(): Uint8Array {
    if (this.round < 2 || !this._commitment) {
      throw new Error(
        "MpcServerKeygen: commitment not yet available — call handle() for round 1 first",
      )
    }
    return encodeCommitment(this.partyId, this._commitment)
  }

  // Round 3 inbound must include peer commitment frames (0xfe); the server's
  // own commitment is added internally.
  handle(inbound: Uint8Array[]): RoundStep {
    if (this.round === 1) {
      const { messages } = splitInbound(inbound)
      try {
        const filtered = filterMessages(messages, this.partyId)
        const r2 = this.session.handleMessages(filtered)
        // compute now so getCommitmentWire() works from round 2
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

        // commitments array indexed by partyId: server's own + peers
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

  /** Extract the keyshare once handle() returns done=true. Consumes the session. */
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

/**
 * Persist the DKG result atomically: the mpc_keys row, the KMS-encrypted share
 * in mpc_server_shares, and — since the server co-generated the key and knows
 * its address — the owner's receiving address in `addresses` (replacing the
 * nonce+signMessage /wallet/link proof the mnemonic flow used). The address is
 * only registered if the user has none yet, so re-running DKG for a legacy
 * mnemonic owner never adds a second receiving address. Returns the keyId.
 */
export async function persistServerKey(
  userId: number,
  dkg: { keyshareBytes: Buffer; pubkey: string; address: string },
): Promise<{ keyId: string }> {
  const ctx: ShareContext = { userId, keyId: "", pubkey: dkg.pubkey, version: 1 }
  // Encrypt outside the transaction (KMS round-trip, no DB) — keyId is patched in.

  return db.transaction(async (tx) => {
    const [keyRow] = await tx
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
    const enc = await encryptShare({ ...ctx, keyId }, dkg.keyshareBytes)

    await tx.insert(mpcServerShares).values({
      keyId,
      ciphertext: enc.ciphertext,
      nonce: enc.nonce,
      wrappedDek: enc.wrappedDek,
      version: enc.version,
    })

    const existing = await tx.query.addresses.findFirst({
      where: eq(addresses.userId, userId),
    })
    if (!existing) {
      await tx.insert(addresses).values({ userId, address: dkg.address }).onConflictDoNothing()
    }

    return { keyId }
  })
}

/** Load and decrypt the server share for a keyId, with the ShareContext used to encrypt it. */
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

// Round state machine:
//   0 → firstMessage()        → 1
//   1 → handle(filter(r1))     → r2 P2P  → 2
//   2 → handle(select(r2))     → r3 P2P  → 3
//   3 → handle(select(r3))     → []      → 4
//   4 → lastMessage(hash)      → last    → 5
//   5 → combine(filter(last))  → {r,s}   → 6
//
// SignSession consumes the keyshare; the ctor clones via fromBytes so the
// caller's buffer survives.
export class MpcServerSign {
  private session: SignSession
  private readonly partyId: number
  private round: number = 0

  // `path` is the BIP32 chain path for HD-under-MPC: "m" is the owner master key,
  // "m/i" is cashier i's derived child key (non-hardened only — DKLS rejects "m/i'").
  constructor(keyshareBytes: Buffer, path: string = "m") {
    const keyshare = Keyshare.fromBytes(keyshareBytes)
    this.partyId = keyshare.partyId
    // SignSession consumes this clone, not the caller's buffer
    this.session = new SignSession(keyshare, path)
  }

  /** Round 1: generate the server's first broadcast message. */
  firstMessage(): Uint8Array[] {
    if (this.round !== 0) throw new Error("MpcServerSign: firstMessage already called")
    const msg = this.session.createFirstMessage()
    this.round = 1
    return [serializeMessage(msg)]
  }

  /** Feed peer messages for rounds 1–3. */
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

  /** Round 4: bind the 32-byte hash to the pre-signature; returns the last broadcast for combine(). */
  lastMessage(hash: Uint8Array): Uint8Array[] {
    if (this.round !== 4)
      throw new Error("MpcServerSign: call handle() for rounds 1–3 first")
    const msg = this.session.lastMessage(hash)
    this.round = 5
    return [serializeMessage(msg)]
  }

  /**
   * Combine peer last-messages. WASM combine() returns [R,S] with NO recovery-id
   * and NO low-s, so we enforce EIP-2 (low-s) here. For a full EVM sig with v,
   * use combineAndAssemble().
   */
  combine(peerLastMessages: Uint8Array[]): { r: Uint8Array; s: Uint8Array } {
    if (this.round !== 5)
      throw new Error("MpcServerSign: call lastMessage() before combine()")
    const { messages } = splitInbound(peerLastMessages)
    try {
      const filtered = filterMessages(messages, this.partyId)
      const result = this.session.combine(filtered) as [Uint8Array, Uint8Array]
      const [R, S] = result

      // low-s normalization (EIP-2)
      const HALF_N = SECP256K1_N / 2n
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

  /**
   * Combine and assemble a full EVM signature. Delegates low-s + recovery-id
   * brute-force to assembleEthSignature(). hash must match lastMessage();
   * expectedAddress is the address that must recover.
   */
  async combineAndAssemble(
    peerLastMessages: Uint8Array[],
    hash: `0x${string}`,
    expectedAddress: `0x${string}` | string,
  ): Promise<EthSignature> {
    const { r, s } = this.combine(peerLastMessages)
    return assembleEthSignature({ r, s, hash, expectedAddress })
  }

  /** Release underlying WASM resources. */
  free(): void {
    try { this.session.free() } catch { /* already freed */ }
  }
}

// initKeyRotation(oldShare) then the same round flow as MpcServerKeygen.
// Resulting share has the SAME public key but re-randomized internal bytes.
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

  /** Chain-code commitment wire frame, available from round 2. */
  getCommitmentWire(): Uint8Array {
    if (this.round < 2 || !this._commitment) {
      throw new Error(
        "MpcServerRefresh: commitment not available — call handle() for round 1 first",
      )
    }
    return encodeCommitment(this.partyId, this._commitment)
  }

  /** Same contract as MpcServerKeygen.handle(): round 3 needs peer commitment frames. */
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

  /** Extract the refreshed keyshare once done=true. pubkey/address are unchanged. */
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
