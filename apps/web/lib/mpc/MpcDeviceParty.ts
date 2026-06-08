// Browser DEVICE-side DKLS23 ceremony wrapper, mirror of the server wrapper
// (apps/api/src/services/mpc/MpcServerParty.ts) but against the wasm-bindgen
// *web* artifact `@silencelaboratories/dkls-wasm-ll-web`. Runs in a Web Worker
// (./mpcWorker.ts).
//
// Topology (2-of-3): 0 = device (browser), 1 = server (api), 2 = backup (browser).
// DKG/refresh run device(0)+backup(2) locally and route only server-bound frames
// outside; a normal sign quorum is device(0)+server(1) so only device runs locally.
//
// Wire frame: byte 0 = from_id, byte 1 = to_id (0xff broadcast, 0xfe commitment),
// byte 2+ = payload. Bundle = base64(JSON(string[])) of base64'd frames, identical
// to apps/api/.../ceremony.ts.
//
// Driven by the server orchestrator: start*() returns the client's first outbound
// bundle, each handleServerBundle() consumes a server bundle and returns the next.

import init, {
  KeygenSession,
  Keyshare,
  Message,
  SignSession,
} from "@silencelaboratories/dkls-wasm-ll-web"
import { publicKeyToAddress } from "viem/utils"

export const DEVICE_PARTY_ID = 0
export const SERVER_PARTY_ID = 1
export const BACKUP_PARTY_ID = 2

const PARTICIPANTS = 3
const THRESHOLD = 2

const COMMITMENT_SENTINEL = 0xfe
const BROADCAST_SENTINEL = 0xff

// Must be awaited before constructing any session.
let wasmReady: Promise<void> | null = null

/**
 * Init the DKLS23 WASM module once; safe to call repeatedly. `wasmUrl` is the
 * same-origin `_bg.wasm` URL to fetch — the caller supplies it (Turbopack and
 * esbuild resolve `.wasm` differently, so this module stays bundler-agnostic and
 * never statically imports the asset).
 */
export async function initMpcWasm(wasmUrl: string): Promise<void> {
  if (!wasmReady) {
    wasmReady = init(wasmUrl).then(() => undefined)
  }
  return wasmReady
}

function serializeMessage(msg: Message): Uint8Array {
  const payload = msg.payload
  const result = new Uint8Array(2 + payload.length)
  result[0] = msg.from_id
  result[1] = msg.to_id === undefined ? BROADCAST_SENTINEL : msg.to_id
  result.set(payload, 2)
  msg.free()
  return result
}

/** Valid real party ids in the 2-of-3 topology: device(0), server(1), backup(2). */
const VALID_PARTY_IDS = new Set([0, 1, 2])

/**
 * Reject garbage party ids before building a Message. from_id must be 0/1/2;
 * to_id may also be the broadcast (0xff) or commitment (0xfe) sentinel.
 */
function assertValidFrame(from: number, to: number): void {
  if (!VALID_PARTY_IDS.has(from)) {
    throw new Error(`MpcDeviceParty: invalid from_id ${from} in wire frame`)
  }
  if (
    to !== BROADCAST_SENTINEL &&
    to !== COMMITMENT_SENTINEL &&
    !VALID_PARTY_IDS.has(to)
  ) {
    throw new Error(`MpcDeviceParty: invalid to_id ${to} in wire frame`)
  }
}

function deserializeMessage(raw: Uint8Array): Message {
  if (raw.length < 2) throw new Error("invalid mpc frame: too short")
  const from = raw[0]
  const toRaw = raw[1]
  assertValidFrame(from, toRaw)
  const payload = raw.slice(2)
  const to = toRaw === BROADCAST_SENTINEL ? undefined : toRaw
  return new Message(payload, from, to)
}

function encodeCommitment(fromPartyId: number, commitmentBytes: Uint8Array): Uint8Array {
  const result = new Uint8Array(2 + commitmentBytes.length)
  result[0] = fromPartyId
  result[1] = COMMITMENT_SENTINEL
  result.set(commitmentBytes, 2)
  return result
}

/** Broadcast filter: all messages NOT from `partyId`, cloned. */
function filterMessages(msgs: Message[], partyId: number): Message[] {
  return msgs.filter((m) => m.from_id !== partyId).map((m) => m.clone())
}

/** P2P select: messages addressed to `partyId`, cloned. */
function selectMessages(msgs: Message[], partyId: number): Message[] {
  return msgs.filter((m) => m.to_id === partyId).map((m) => m.clone())
}

interface SplitInbound {
  messages: Message[]
  commitments: Map<number, Uint8Array>
}

/** Split inbound wire frames into WASM Messages + commitment payloads. */
function splitInbound(inbound: Uint8Array[]): SplitInbound {
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

function freeMessages(msgs: Message[]): void {
  for (const m of msgs) {
    try {
      m.free()
    } catch {
      /* already freed */
    }
  }
}

// Bundle codec — must stay identical to apps/api/src/services/mpc/ceremony.ts.
function b64encode(bytes: Uint8Array): string {
  let s = ""
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i])
  return btoa(s)
}

function b64decode(s: string): Uint8Array {
  const bin = atob(s)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

export function encodeBundle(frames: Uint8Array[]): string {
  const arr = frames.map((f) => b64encode(f))
  return btoa(unescape(encodeURIComponent(JSON.stringify(arr))))
}

export function decodeBundle(payloadB64: string): Uint8Array[] {
  let parsed: unknown
  try {
    parsed = JSON.parse(decodeURIComponent(escape(atob(payloadB64))))
  } catch {
    throw new Error("MpcDeviceParty: invalid bundle payload")
  }
  if (!Array.isArray(parsed) || !parsed.every((x) => typeof x === "string")) {
    throw new Error("MpcDeviceParty: bundle must be an array of strings")
  }
  return (parsed as string[]).map((s) => b64decode(s))
}

const P_SECP256K1 = 0xfffffffffffffffffffffffffffffffffffffffffffffffffffffffefffffc2fn
const SECP256K1_N =
  0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n
const HALF_N = SECP256K1_N / 2n

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

export function compressedPubkeyToAddress(compressed: Uint8Array): string {
  return publicKeyToAddress(decompressPubkey(compressed))
}

/** Normalise an S value to canonical low-s (EIP-2). */
function lowS(s: Uint8Array): Uint8Array {
  let sBig = BigInt(u8ToHex(s))
  if (sBig > HALF_N) sBig = SECP256K1_N - sBig
  const out = new Uint8Array(32)
  const hex = sBig.toString(16).padStart(64, "0")
  for (let i = 0; i < 32; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  return out
}

export interface DkgResult {
  /** Serialised device(0) keyshare — persisted at rest (PIN-protected). */
  deviceShareBytes: Uint8Array
  /** Serialised backup(2) keyshare — exported then zeroized, never persisted. */
  backupShareBytes: Uint8Array
  /** Compressed (33-byte) combined public key, 0x-hex. */
  pubkey: `0x${string}`
  /** Ethereum address derived from the combined public key. */
  address: string
}

export interface SignResult {
  /** Signature r component (32 bytes). */
  r: Uint8Array
  /** Signature s component (32 bytes), canonical low-s. */
  s: Uint8Array
}

export interface RefreshResult {
  deviceShareBytes: Uint8Array
  backupShareBytes: Uint8Array
  /** UNCHANGED from the original key. */
  pubkey: `0x${string}`
  address: string
}

export interface RecoverResult {
  /** New device(0) keyshare bytes. Backup share is unchanged — old kit file still valid. */
  deviceShareBytes: Uint8Array
  /** UNCHANGED from the original key. */
  pubkey: `0x${string}`
  address: string
}

export interface DeviceStep<R> {
  /** Bundle of client wire frames bound for the server (relay verbatim). */
  outboundBundle: string
  /** True when the ceremony is complete. */
  done: boolean
  /** Present on the terminal step. */
  result?: R
}

// Drives device(0) + backup(2) through the keygen state machine (shared by DKG
// and refresh), exchanging only server-bound frames with the outside. Round
// mapping mirrors the server (MpcServerKeygen.handle + ceremony stepDkg):
//   1: r1 broadcasts → r2 P2P, compute local chain-code commitments
//   2: r2 → r3 P2P, commitments ride along here (see round 1→2 boundary note)
//   3: r3 + all commitments → r4 broadcast
//   4: r4 → done, extract both shares
type KeygenFactory = () => { device: KeygenSession; backup: KeygenSession }

class LocalKeygenDriver {
  private device: KeygenSession
  private backup: KeygenSession
  private round = 0
  /** Frames addressed to the other local party (or broadcast), replayed next round. */
  private localPending: Uint8Array[] = []
  private deviceCommitment: Uint8Array | null = null
  private backupCommitment: Uint8Array | null = null
  /** Non-local (server) commitments by partyId; the server emits its commitment
   *  a round before the local parties consume it, so accumulate across rounds. */
  private peerCommitments = new Map<number, Uint8Array>()
  /** keyshare() consumed both sessions — free() must be a no-op. */
  private consumed = false

  constructor(factory: KeygenFactory) {
    const { device, backup } = factory()
    this.device = device
    this.backup = backup
  }

  /** Produce both local parties' first (r1 broadcast) messages. */
  start(): string {
    if (this.round !== 0) throw new Error("LocalKeygenDriver: start already called")
    const devMsgs = [this.device.createFirstMessage()]
    const bakMsgs = [this.backup.createFirstMessage()]
    const allFrames = [...devMsgs, ...bakMsgs].map(serializeMessage)
    // Broadcasts go to all parties: buffer locally and also send to the server.
    this.localPending = allFrames
    this.round = 1
    return encodeBundle(allFrames)
  }

  /**
   * Advance one keygen round given the server's outbound bundle.
   * Returns the next server-bound bundle and, when done, both shares.
   */
  step(serverBundle: string): {
    outboundBundle: string
    done: boolean
    shares?: { deviceShareBytes: Uint8Array; backupShareBytes: Uint8Array }
  } {
    const serverFrames = decodeBundle(serverBundle)
    const buffered = this.localPending
    this.localPending = []
    const inbound = [...serverFrames, ...buffered]

    // Server broadcasts its chain-code commitment a round before we consume it.
    for (const raw of serverFrames) {
      if (raw[1] === COMMITMENT_SENTINEL) this.peerCommitments.set(raw[0], raw.slice(2))
    }

    if (this.round === 1) {
      const { messages } = splitInbound(inbound)
      try {
        const devR2 = this.device.handleMessages(
          filterMessages(messages, DEVICE_PARTY_ID),
        )
        const bakR2 = this.backup.handleMessages(
          filterMessages(messages, BACKUP_PARTY_ID),
        )
        this.deviceCommitment = this.device.calculateChainCodeCommitment()
        this.backupCommitment = this.backup.calculateChainCodeCommitment()
        this.round = 2
        // Don't append commitments yet: the server consumes device/backup
        // chain-code commitments in the same round as their r3 P2P messages, so
        // they're appended in the round===2 branch below (see ceremony.ts stepDkg).
        return this.routeOutbound([...devR2, ...bakR2], /*withCommitments*/ false)
      } finally {
        freeMessages(messages)
      }
    }

    if (this.round === 2) {
      // r2 → r3 P2P. Local chain-code commitments ride along so they reach the
      // server in the round it consumes r3.
      const { messages } = splitInbound(inbound)
      try {
        const devR3 = this.device.handleMessages(
          selectMessages(messages, DEVICE_PARTY_ID),
        )
        const bakR3 = this.backup.handleMessages(
          selectMessages(messages, BACKUP_PARTY_ID),
        )
        this.round = 3
        return this.routeOutbound([...devR3, ...bakR3], /*withCommitments*/ true)
      } finally {
        freeMessages(messages)
      }
    }

    if (this.round === 3) {
      // r3 → r4: P2P + the full commitments array (all 3 parties).
      const { messages } = splitInbound(inbound)
      try {
        if (!this.deviceCommitment || !this.backupCommitment)
          throw new Error("LocalKeygenDriver: local commitments missing in round 3")
        // Accumulated peer commitments (server's arrived earlier) + the two local ones.
        const commitMap = new Map<number, Uint8Array>(this.peerCommitments)
        commitMap.set(DEVICE_PARTY_ID, this.deviceCommitment)
        commitMap.set(BACKUP_PARTY_ID, this.backupCommitment)

        const maxPartyId = Math.max(...commitMap.keys())
        const allCommitments: Uint8Array[] = []
        for (let i = 0; i <= maxPartyId; i++) {
          const c = commitMap.get(i)
          if (!c) throw new Error(`LocalKeygenDriver: missing commitment for party ${i}`)
          allCommitments.push(c)
        }

        const devR4 = this.device.handleMessages(
          selectMessages(messages, DEVICE_PARTY_ID),
          allCommitments,
        )
        const bakR4 = this.backup.handleMessages(
          selectMessages(messages, BACKUP_PARTY_ID),
          allCommitments,
        )
        this.round = 4
        return this.routeOutbound([...devR4, ...bakR4], false)
      } finally {
        freeMessages(messages)
      }
    }

    if (this.round === 4) {
      const { messages } = splitInbound(inbound)
      try {
        this.device.handleMessages(filterMessages(messages, DEVICE_PARTY_ID))
        this.backup.handleMessages(filterMessages(messages, BACKUP_PARTY_ID))
        this.round = 5
        const deviceKs = this.device.keyshare()
        const backupKs = this.backup.keyshare()
        this.consumed = true
        const deviceShareBytes = deviceKs.toBytes()
        const backupShareBytes = backupKs.toBytes()
        deviceKs.free()
        backupKs.free()
        return {
          outboundBundle: encodeBundle([]),
          done: true,
          shares: { deviceShareBytes, backupShareBytes },
        }
      } finally {
        freeMessages(messages)
      }
    }

    throw new Error(`LocalKeygenDriver: unexpected step in round ${this.round}`)
  }

  /**
   * Partition produced frames: local-addressed (or broadcast) get buffered for
   * next round, server-addressed (or broadcast) go out. Round-2 commitments are
   * appended to the server-bound bundle.
   */
  private routeOutbound(
    produced: Message[],
    withCommitments: boolean,
  ): { outboundBundle: string; done: false } {
    const frames = produced.map(serializeMessage)
    const serverBound: Uint8Array[] = []
    const localBuffer: Uint8Array[] = []
    for (const f of frames) {
      const to = f[1]
      if (to === BROADCAST_SENTINEL) {
        serverBound.push(f)
        localBuffer.push(f)
      } else if (to === SERVER_PARTY_ID) {
        serverBound.push(f)
      } else {
        localBuffer.push(f) // device(0)/backup(2) stays intra-browser
      }
    }
    if (withCommitments) {
      if (this.deviceCommitment)
        serverBound.push(encodeCommitment(DEVICE_PARTY_ID, this.deviceCommitment))
      if (this.backupCommitment)
        serverBound.push(encodeCommitment(BACKUP_PARTY_ID, this.backupCommitment))
    }
    this.localPending = localBuffer
    return { outboundBundle: encodeBundle(serverBound), done: false }
  }

  free(): void {
    // keyshare() already deallocated both sessions in the -web build; a second
    // free() would dereference a null pointer.
    if (this.consumed) return
    try {
      this.device.free()
    } catch {
      /* already freed */
    }
    try {
      this.backup.free()
    } catch {
      /* already freed */
    }
  }
}

// One MpcDeviceParty instance drives one ceremony.
type DeviceEngine =
  | { kind: "dkg"; driver: LocalKeygenDriver }
  | { kind: "refresh"; driver: LocalKeygenDriver }
  | { kind: "recover"; driver: LocalKeygenDriver }
  | {
      kind: "sign"
      session: SignSession
      hash: Uint8Array
      round: number
      localPending: Uint8Array[]
      lastSent: boolean
    }

export class MpcDeviceParty {
  private engine: DeviceEngine | null = null

  /** Returns the client's first outbound bundle (device+backup r1 broadcasts). */
  startDkg(): string {
    if (this.engine) throw new Error("MpcDeviceParty: ceremony already started")
    const driver = new LocalKeygenDriver(() => ({
      device: new KeygenSession(PARTICIPANTS, THRESHOLD, DEVICE_PARTY_ID),
      backup: new KeygenSession(PARTICIPANTS, THRESHOLD, BACKUP_PARTY_ID),
    }))
    this.engine = { kind: "dkg", driver }
    return driver.start()
  }

  /**
   * Recover the lost device share (party 0) using the backup share (party 2).
   * The server contributes its share (party 1) over the WebSocket.
   * Result: a new device share with the SAME public key; backup kit file remains valid.
   */
  startRecover(backupShareBytes: Uint8Array): string {
    if (this.engine) throw new Error("MpcDeviceParty: ceremony already started")
    const lostShares = new Uint8Array([DEVICE_PARTY_ID])
    const driver = new LocalKeygenDriver(() => {
      const backupOld = Keyshare.fromBytes(backupShareBytes)
      // Copy pk before initKeyRecovery consumes (frees) backupOld.
      const pkCopy = new Uint8Array(backupOld.publicKey)
      const backup = KeygenSession.initKeyRecovery(backupOld, lostShares)
      const device = KeygenSession.initLostShareRecovery(
        PARTICIPANTS, THRESHOLD, DEVICE_PARTY_ID, pkCopy, lostShares,
      )
      return { device, backup }
    })
    this.engine = { kind: "recover", driver }
    return driver.start()
  }

  /** Key rotation from existing device+backup shares. Returns first outbound bundle. */
  startRefresh(deviceShareBytes: Uint8Array, backupShareBytes: Uint8Array): string {
    if (this.engine) throw new Error("MpcDeviceParty: ceremony already started")
    const driver = new LocalKeygenDriver(() => {
      const deviceOld = Keyshare.fromBytes(deviceShareBytes)
      const backupOld = Keyshare.fromBytes(backupShareBytes)
      // initKeyRotation consumes (frees) the old share.
      const device = KeygenSession.initKeyRotation(deviceOld)
      const backup = KeygenSession.initKeyRotation(backupOld)
      return { device, backup }
    })
    this.engine = { kind: "refresh", driver }
    return driver.start()
  }

  /**
   * Normal sign (device(0)+server(1)). hash must be 32 bytes. Returns the
   * client's first outbound bundle (device r1 broadcast).
   */
  // `path` is the BIP32 chain path: "m" = owner master, "m/i" = cashier i's child
  // key (non-hardened only). Device and server must use the SAME path to co-sign.
  startSign(deviceShareBytes: Uint8Array, hash: Uint8Array, path: string = "m"): string {
    if (this.engine) throw new Error("MpcDeviceParty: ceremony already started")
    if (hash.length !== 32) throw new Error("MpcDeviceParty: sign hash must be 32 bytes")
    // SignSession consumes its keyshare — clone via fromBytes.
    const keyshare = Keyshare.fromBytes(deviceShareBytes)
    if (keyshare.partyId !== DEVICE_PARTY_ID) {
      const id = keyshare.partyId
      keyshare.free()
      throw new Error(`MpcDeviceParty: expected device share (party 0), got party ${id}`)
    }
    const session = new SignSession(keyshare, path)
    const first = serializeMessage(session.createFirstMessage())
    this.engine = {
      kind: "sign",
      session,
      hash,
      round: 1,
      localPending: [first],
      lastSent: false,
    }
    return encodeBundle([first])
  }

  /**
   * Consume the server's outbound bundle and advance the ceremony one round.
   * Returns the next client outbound bundle and, on completion, the result.
   *
   * DKG    result = { deviceShareBytes, backupShareBytes, pubkey, address }
   * Refresh result = { deviceShareBytes, backupShareBytes, pubkey, address }
   * Sign   result = { r, s }
   */
  handleServerBundle(
    serverBundle: string,
  ): DeviceStep<DkgResult | RecoverResult | RefreshResult | SignResult> {
    if (!this.engine) throw new Error("MpcDeviceParty: no ceremony in progress")

    if (this.engine.kind === "dkg" || this.engine.kind === "refresh" || this.engine.kind === "recover") {
      const stepKind = this.engine.kind
      const driver = this.engine.driver
      const out = driver.step(serverBundle)
      if (!out.done) {
        return { outboundBundle: out.outboundBundle, done: false }
      }
      const { deviceShareBytes, backupShareBytes } = out.shares!
      const ks = Keyshare.fromBytes(deviceShareBytes)
      const pubkeyBytes = ks.publicKey
      const pubkey = u8ToHex(pubkeyBytes)
      const address = compressedPubkeyToAddress(pubkeyBytes)
      ks.free()
      driver.free()
      this.engine = null
      const result =
        stepKind === "dkg"
          ? ({ deviceShareBytes, backupShareBytes, pubkey, address } as DkgResult)
          : stepKind === "recover"
            ? ({ deviceShareBytes, pubkey, address } as RecoverResult)
            : ({ deviceShareBytes, backupShareBytes, pubkey, address } as RefreshResult)
      return { outboundBundle: out.outboundBundle, done: true, result }
    }

    // sign
    return this.stepSign(serverBundle)
  }

  // Sign round machine for the local device party (server is the only peer):
  //   1: handle(r1) → r2 P2P
  //   2: handle(r2) → r3 P2P
  //   3: handle(r3) then lastMessage(hash) → last broadcast
  //   4: combine(server last) → {r, s}
  private stepSign(serverBundle: string): DeviceStep<SignResult> {
    if (this.engine?.kind !== "sign") throw new Error("MpcDeviceParty: not a sign ceremony")
    const eng = this.engine
    const serverFrames = decodeBundle(serverBundle)
    const buffered = eng.localPending
    eng.localPending = []
    const inbound = [...serverFrames, ...buffered]

    if (eng.lastSent) {
      // round 4: combine the server's last message.
      const { messages } = splitInbound(inbound)
      try {
        const filtered = filterMessages(messages, DEVICE_PARTY_ID)
        const [R, S] = eng.session.combine(filtered) as [Uint8Array, Uint8Array]
        const result: SignResult = { r: R, s: lowS(S) }
        // combine() already deallocated the session in the -web build; a second
        // free() would dereference a null pointer.
        try {
          eng.session.free()
        } catch {
          /* already consumed by combine() */
        }
        this.engine = null
        return { outboundBundle: encodeBundle([]), done: true, result }
      } finally {
        freeMessages(messages)
      }
    }

    const { messages } = splitInbound(inbound)
    try {
      if (eng.round === 1) {
        const r2 = eng.session.handleMessages(filterMessages(messages, DEVICE_PARTY_ID))
        eng.round = 2
        return this.routeSignOutbound(r2)
      }
      if (eng.round === 2) {
        const r3 = eng.session.handleMessages(selectMessages(messages, DEVICE_PARTY_ID))
        eng.round = 3
        return this.routeSignOutbound(r3)
      }
      if (eng.round === 3) {
        eng.session.handleMessages(selectMessages(messages, DEVICE_PARTY_ID))
        // 2-party quorum: no peer-bound P2P, emit the last message directly.
        const last = serializeMessage(eng.session.lastMessage(eng.hash))
        eng.round = 4
        eng.lastSent = true
        return { outboundBundle: encodeBundle([last]), done: false }
      }
      throw new Error(`MpcDeviceParty: unexpected sign round ${eng.round}`)
    } finally {
      freeMessages(messages)
    }
  }

  private routeSignOutbound(produced: Message[]): DeviceStep<SignResult> {
    if (this.engine?.kind !== "sign") throw new Error("MpcDeviceParty: not a sign ceremony")
    const frames = produced.map(serializeMessage)
    // 2-party quorum: everything is server-bound. Same partition as keygen for symmetry.
    const serverBound: Uint8Array[] = []
    const localBuffer: Uint8Array[] = []
    for (const f of frames) {
      const to = f[1]
      if (to === BROADCAST_SENTINEL) {
        serverBound.push(f)
        localBuffer.push(f)
      } else if (to === SERVER_PARTY_ID) {
        serverBound.push(f)
      } else {
        localBuffer.push(f)
      }
    }
    this.engine.localPending = localBuffer
    return { outboundBundle: encodeBundle(serverBound), done: false }
  }

  /** Free any in-flight WASM resources. Idempotent. */
  free(): void {
    if (!this.engine) return
    if (this.engine.kind === "sign") {
      try {
        this.engine.session.free()
      } catch {
        /* already freed */
      }
    } else {
      this.engine.driver.free()
    }
    this.engine = null
  }
}
