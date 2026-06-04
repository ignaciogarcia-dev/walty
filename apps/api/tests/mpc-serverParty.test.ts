// apps/api/tests/mpc-serverParty.test.ts
//
// Real-WASM, in-process tests for MpcServerParty.
//
// Scenario: 3-party DKLS23 (participants=3, threshold=2)
//   party 0 = device  (raw KeygenSession / SignSession — simulated peer)
//   party 1 = server  (MpcServerKeygen / MpcServerSign / MpcServerRefresh wrapper)
//   party 2 = backup  (raw KeygenSession — simulated peer)
//
// All routing is keyed on real partyId (from_id / to_id in Message objects),
// matching the invariant from scripts/mpc-dkls-spike.ts.
//
// DB-dependent tests (persistServerKey / loadServerKeyshare) live in
// tests/integration/ against the local walty_test DB.

import { describe, it, expect, beforeAll } from "vitest"
import {
  KeygenSession,
  Keyshare,
  Message,
  SignSession,
} from "@silencelaboratories/dkls-wasm-ll-node"
import { randomBytes } from "crypto"
import { keccak256, toHex, type Hex, recoverAddress } from "viem"

// Set env before any module that reads process.env
process.env.MPC_KMS_DEV_KEK = randomBytes(32).toString("base64")
process.env.NODE_ENV = "test"

import {
  MpcServerKeygen,
  MpcServerSign,
  MpcServerRefresh,
  encodeCommitment,
  compressedPubkeyToAddress,
} from "../src/services/mpc/MpcServerParty.js"

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PARTICIPANTS = 3
const THRESHOLD = 2
const SERVER_ID = 1   // party 1 = server

// secp256k1 constants for low-s normalization
const SECP256K1_N = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n
const HALF_N = SECP256K1_N / 2n
const P_SECP256K1 = 0xfffffffffffffffffffffffffffffffffffffffffffffffffffffffefffffc2fn

// ---------------------------------------------------------------------------
// Shared utilities (mirrors spike helpers)
// ---------------------------------------------------------------------------

function u8ToHex(u: Uint8Array): Hex {
  return ("0x" +
    Array.from(u)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("")) as Hex
}

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

/** Decompress 33-byte compressed secp256k1 key → 65-byte uncompressed (for viem). */
function decompressPubkey(compressed: Uint8Array): Hex {
  const prefix = compressed[0]
  const x = BigInt(u8ToHex(compressed.slice(1)))
  const ySq = (modPow(x, 3n, P_SECP256K1) + 7n) % P_SECP256K1
  let y = modPow(ySq, (P_SECP256K1 + 1n) / 4n, P_SECP256K1)
  const wantOdd = prefix === 0x03
  if ((y & 1n) !== (wantOdd ? 1n : 0n)) y = P_SECP256K1 - y
  return `0x04${x.toString(16).padStart(64, "0")}${y.toString(16).padStart(64, "0")}` as Hex
}

/** Safely free a WASM object (ignore double-free). */
function safeFree(obj: { free(): void } | null | undefined): void {
  if (!obj) return
  try { obj.free() } catch { /* already freed */ }
}

/** Safely free an array of WASM objects. */
function freeAll(objs: Array<{ free(): void } | null | undefined>): void {
  objs.forEach(safeFree)
}

/** Clone a Keyshare via serialize/deserialize (SignSession consumes its input). */
function cloneShare(ks: Keyshare): Keyshare {
  return Keyshare.fromBytes(ks.toBytes())
}

// ---------------------------------------------------------------------------
// Wire-format helpers (must match MpcServerParty internals)
// ---------------------------------------------------------------------------

const BROADCAST = 0xff
const COMMITMENT_SENTINEL = 0xfe

/** Serialize a WASM Message to [from][to|0xff][payload], freeing the message. */
function wireMsg(msg: Message): Uint8Array {
  const payload = msg.payload
  const out = new Uint8Array(2 + payload.length)
  out[0] = msg.from_id
  out[1] = msg.to_id === undefined ? BROADCAST : msg.to_id
  out.set(payload, 2)
  msg.free()
  return out
}

/** Deserialize a wire envelope to a WASM Message. */
function unwireMsg(raw: Uint8Array): Message {
  const from = raw[0]
  const to = raw[1] === BROADCAST ? undefined : raw[1]
  return new Message(raw.slice(2), from, to)
}

/** Broadcast filter: msgs NOT from partyId, cloned. */
function filter(msgs: Message[], partyId: number): Message[] {
  return msgs.filter((m) => m.from_id !== partyId).map((m) => m.clone())
}

/** P2P select: msgs addressed to partyId, cloned. */
function select(msgs: Message[], partyId: number): Message[] {
  return msgs.filter((m) => m.to_id === partyId).map((m) => m.clone())
}

/** Convert wrapper's Uint8Array[] outbound to WASM Messages. */
function unwireAll(raws: Uint8Array[]): Message[] {
  return raws
    .filter((r) => r[1] !== COMMITMENT_SENTINEL)   // skip commitment sentinel wires
    .map(unwireMsg)
}

// ---------------------------------------------------------------------------
// Recover DKG address from an MPC [R, S] pair (brute-force yParity)
// ---------------------------------------------------------------------------

async function recoverFromRS(
  r: Uint8Array,
  s: Uint8Array,
  hashHex: Hex,
  expectedAddr: string,
): Promise<{ ok: boolean; recovered: string }> {
  const rHex = u8ToHex(r)
  // s is already low-s (MpcServerSign normalizes it)
  const sHex = u8ToHex(s) as Hex

  for (const yParity of [0, 1] as const) {
    try {
      const recovered = await recoverAddress({
        hash: hashHex,
        signature: { r: rHex, s: sHex, yParity },
      })
      if (recovered.toLowerCase() === expectedAddr.toLowerCase()) {
        return { ok: true, recovered }
      }
    } catch { /* try next parity */ }
  }
  return { ok: false, recovered: "" }
}

// ---------------------------------------------------------------------------
// Full 3-party DKG where server party uses the MpcServerKeygen wrapper.
//
// Protocol:
//   R1   : each party emits first broadcast
//   R2   : each party handles filter(r1, me)  → P2P
//          server calls getCommitmentWire() after R1-handle returns
//   R3   : each party handles select(r2, me)  → P2P
//   R4a  : each party handles select(r3, me) + all commitments → broadcast
//   R4b  : each party handles filter(r4, me)  → done
// ---------------------------------------------------------------------------

interface DkgResult {
  deviceShare: Keyshare
  serverKeyshareBytes: Buffer
  serverPubkey: string
  serverAddress: string
  backupShare: Keyshare
}

function runWrappedDkg(): DkgResult {
  const device = new KeygenSession(PARTICIPANTS, THRESHOLD, 0)
  const server = new MpcServerKeygen(PARTICIPANTS, THRESHOLD, SERVER_ID)
  const backup = new KeygenSession(PARTICIPANTS, THRESHOLD, 2)

  // ---- Round 1 ----
  const devMsg1 = device.createFirstMessage()
  const srvWire1 = server.firstMessage()   // Uint8Array[]
  const bakMsg1 = backup.createFirstMessage()

  // Peer messages as WASM objects for raw sessions' filter/select
  const srvMsgs1 = unwireAll(srvWire1)
  const allMsgs1: Message[] = [devMsg1, ...srvMsgs1, bakMsg1]

  // ---- Round 2 ----
  // Raw peers: filter(r1, me)
  const devMsgs2 = device.handleMessages(filter(allMsgs1, 0))
  const bakMsgs2 = backup.handleMessages(filter(allMsgs1, 2))
  // Server wrapper: all r1 messages not from server, serialised
  const r1ForServer = allMsgs1.filter((m) => m.from_id !== SERVER_ID).map((m) => wireMsg(m.clone()))
  const srvStep2 = server.handle(r1ForServer)
  const srvMsgs2 = unwireAll(srvStep2.outbound)

  // Server commitment is now available
  const srvCommitmentWire = server.getCommitmentWire()   // [SERVER_ID][0xfe][commitment]

  // Peer commitments
  const devCommitment = device.calculateChainCodeCommitment()
  const bakCommitment = backup.calculateChainCodeCommitment()

  const allMsgs2: Message[] = [...devMsgs2, ...srvMsgs2, ...bakMsgs2]

  // ---- Round 3 ----
  const devMsgs3 = device.handleMessages(select(allMsgs2, 0))
  const bakMsgs3 = backup.handleMessages(select(allMsgs2, 2))
  const r2ForServer = allMsgs2.filter((m) => m.to_id === SERVER_ID).map((m) => wireMsg(m.clone()))
  const srvStep3 = server.handle(r2ForServer)
  const srvMsgs3 = unwireAll(srvStep3.outbound)

  const allMsgs3: Message[] = [...devMsgs3, ...srvMsgs3, ...bakMsgs3]

  // ---- Round 4a ----
  // All parties need ALL commitments. Indexed by partyId: [dev=0, srv=1, bak=2].
  // Extract server commitment bytes from wire format
  const srvCommitmentBytes = srvCommitmentWire.slice(2)   // strip [from_id][sentinel]
  const allCommitments: Uint8Array[] = [devCommitment, srvCommitmentBytes, bakCommitment]

  const devMsgs4 = device.handleMessages(select(allMsgs3, 0), allCommitments)
  const bakMsgs4 = backup.handleMessages(select(allMsgs3, 2), allCommitments)
  // Server: P2P messages from r3 + commitment wires from device and backup
  const r3ForServer = allMsgs3.filter((m) => m.to_id === SERVER_ID).map((m) => wireMsg(m.clone()))
  const srvR4aInput = [
    ...r3ForServer,
    encodeCommitment(0, devCommitment),
    encodeCommitment(2, bakCommitment),
  ]
  const srvStep4a = server.handle(srvR4aInput)
  const srvMsgs4a = unwireAll(srvStep4a.outbound)

  const allMsgs4: Message[] = [...devMsgs4, ...srvMsgs4a, ...bakMsgs4]

  // ---- Round 4b ----
  device.handleMessages(filter(allMsgs4, 0))
  backup.handleMessages(filter(allMsgs4, 2))
  const r4ForServer = allMsgs4.filter((m) => m.from_id !== SERVER_ID).map((m) => wireMsg(m.clone()))
  const srvStep4b = server.handle(r4ForServer)
  expect(srvStep4b.done).toBe(true)

  // Extract keyshares
  const srvResult = server.finish()
  const deviceShare = device.keyshare()
  const backupShare = backup.keyshare()

  // Cleanup: messages (keyshares still live — caller must free)
  freeAll(allMsgs1)
  freeAll(allMsgs2)
  freeAll(allMsgs3)
  freeAll(allMsgs4)

  return {
    deviceShare,
    serverKeyshareBytes: srvResult.keyshareBytes,
    serverPubkey: srvResult.pubkey,
    serverAddress: srvResult.address,
    backupShare,
  }
}

// ---------------------------------------------------------------------------
// DKG tests
// ---------------------------------------------------------------------------

describe("DKG — 3-party wrapped keygen", () => {
  let dkg: DkgResult

  beforeAll(() => {
    dkg = runWrappedDkg()
  })

  it("all 3 parties share the same combined public key", () => {
    const devPubkey = u8ToHex(dkg.deviceShare.publicKey)
    const bakPubkey = u8ToHex(dkg.backupShare.publicKey)

    expect(devPubkey).toBe(dkg.serverPubkey)
    expect(bakPubkey).toBe(dkg.serverPubkey)
    // Compressed secp256k1 pubkey: 0x02 or 0x03 prefix + 32-byte x
    expect(dkg.serverPubkey).toMatch(/^0x0[23][0-9a-f]{64}$/i)
  })

  it("server share has partyId = 1", () => {
    const ks = Keyshare.fromBytes(dkg.serverKeyshareBytes)
    expect(ks.partyId).toBe(SERVER_ID)
    expect(ks.threshold).toBe(THRESHOLD)
    expect(ks.participants).toBe(PARTICIPANTS)
    ks.free()
  })

  it("address derived from DKG pubkey is a valid Ethereum address", () => {
    expect(dkg.serverAddress).toMatch(/^0x[0-9a-fA-F]{40}$/)
    // viem always returns checksum addresses
    const fromPubkey = compressedPubkeyToAddress(dkg.deviceShare.publicKey)
    expect(fromPubkey.toLowerCase()).toBe(dkg.serverAddress.toLowerCase())
  })

  it("server keyshare round-trips via toBytes/fromBytes", () => {
    const ks = Keyshare.fromBytes(dkg.serverKeyshareBytes)
    expect(u8ToHex(ks.publicKey)).toBe(dkg.serverPubkey)
    ks.free()
  })
})

// ---------------------------------------------------------------------------
// Sign tests
// ---------------------------------------------------------------------------

describe("Sign — 2-party device+server", () => {
  let dkg: DkgResult
  let hashHex: Hex
  let hashBytes: Uint8Array

  beforeAll(() => {
    dkg = runWrappedDkg()
    hashHex = keccak256(toHex("walty-server-party-test"))
    hashBytes = Uint8Array.from(
      (hashHex.slice(2).match(/.{2}/g) as string[]).map((h) => parseInt(h, 16)),
    )
  })

  it("device+server signature recovers DKG address", async () => {
    const deviceId = dkg.deviceShare.partyId   // 0
    const srvId = SERVER_ID                     // 1

    // Clone device share (SignSession consumes it)
    const deviceSign = new SignSession(cloneShare(dkg.deviceShare), "m")
    const srvSign = new MpcServerSign(dkg.serverKeyshareBytes)

    // R1
    const devMsg1 = deviceSign.createFirstMessage()
    const srvWire1 = srvSign.firstMessage()
    const srvMsgs1 = unwireAll(srvWire1)
    const allMsgs1: Message[] = [devMsg1, ...srvMsgs1]

    // R2
    const devMsgs2 = deviceSign.handleMessages(filter(allMsgs1, deviceId))
    const r1ForSrv = allMsgs1.filter((m) => m.from_id !== srvId).map((m) => wireMsg(m.clone()))
    const srvStep2 = srvSign.handle(r1ForSrv)
    const srvMsgs2 = unwireAll(srvStep2.outbound)
    const allMsgs2: Message[] = [...devMsgs2, ...srvMsgs2]

    // R3
    const devMsgs3 = deviceSign.handleMessages(select(allMsgs2, deviceId))
    const r2ForSrv = allMsgs2.filter((m) => m.to_id === srvId).map((m) => wireMsg(m.clone()))
    const srvStep3 = srvSign.handle(r2ForSrv)
    const srvMsgs3 = unwireAll(srvStep3.outbound)
    const allMsgs3: Message[] = [...devMsgs3, ...srvMsgs3]

    // R3b (internal select(r3))
    deviceSign.handleMessages(select(allMsgs3, deviceId))
    const r3ForSrv = allMsgs3.filter((m) => m.to_id === srvId).map((m) => wireMsg(m.clone()))
    const srvStep3b = srvSign.handle(r3ForSrv)
    expect(srvStep3b.outbound).toHaveLength(0)

    // lastMessage
    const devLast = deviceSign.lastMessage(hashBytes)
    const srvLastWire = srvSign.lastMessage(hashBytes)
    const srvLastMsgs = unwireAll(srvLastWire)
    const allLast: Message[] = [devLast, ...srvLastMsgs]

    // combine
    const devSig = deviceSign.combine(filter(allLast, deviceId)) as [Uint8Array, Uint8Array]
    const [devR, devS] = devSig

    const lastForSrv = allLast.filter((m) => m.from_id !== srvId).map((m) => wireMsg(m.clone()))
    const { r: srvR, s: srvS } = srvSign.combine(lastForSrv)

    // R values must match
    expect(u8ToHex(srvR)).toBe(u8ToHex(devR))

    // Server s must be low-s normalized version of device s
    let devSBig = BigInt(u8ToHex(devS))
    if (devSBig > HALF_N) devSBig = SECP256K1_N - devSBig
    expect(BigInt(u8ToHex(srvS))).toBe(devSBig)
    expect(BigInt(u8ToHex(srvS))).toBeLessThanOrEqual(HALF_N)

    // Recover address from server's [R, S]
    const rec = await recoverFromRS(srvR, srvS, hashHex, dkg.serverAddress)
    expect(rec.ok).toBe(true)
    expect(rec.recovered.toLowerCase()).toBe(dkg.serverAddress.toLowerCase())

    // Cleanup
    safeFree(srvSign)
    freeAll([...allMsgs1, ...allMsgs2, ...allMsgs3, ...allLast])
  })

  it("server+backup signature recovers DKG address", async () => {
    const dkg2 = runWrappedDkg()
    const backupId = dkg2.backupShare.partyId   // 2
    const hashHex2 = keccak256(toHex("walty-server-backup-sign"))
    const hashBytes2 = Uint8Array.from(
      (hashHex2.slice(2).match(/.{2}/g) as string[]).map((h) => parseInt(h, 16)),
    )

    const backupSign = new SignSession(cloneShare(dkg2.backupShare), "m")
    const srvSign2 = new MpcServerSign(dkg2.serverKeyshareBytes)

    // R1
    const bakMsg1 = backupSign.createFirstMessage()
    const srvW1 = srvSign2.firstMessage()
    const srvM1 = unwireAll(srvW1)
    const aR1: Message[] = [bakMsg1, ...srvM1]

    // R2
    const bakR2 = backupSign.handleMessages(filter(aR1, backupId))
    const r1FS = aR1.filter((m) => m.from_id !== SERVER_ID).map((m) => wireMsg(m.clone()))
    const srvS2 = srvSign2.handle(r1FS)
    const srvM2 = unwireAll(srvS2.outbound)
    const aR2: Message[] = [...bakR2, ...srvM2]

    // R3
    const bakR3 = backupSign.handleMessages(select(aR2, backupId))
    const r2FS = aR2.filter((m) => m.to_id === SERVER_ID).map((m) => wireMsg(m.clone()))
    const srvS3 = srvSign2.handle(r2FS)
    const srvM3 = unwireAll(srvS3.outbound)
    const aR3: Message[] = [...bakR3, ...srvM3]

    // R3b
    backupSign.handleMessages(select(aR3, backupId))
    const r3FS = aR3.filter((m) => m.to_id === SERVER_ID).map((m) => wireMsg(m.clone()))
    srvSign2.handle(r3FS)

    // lastMessage
    const bakLast = backupSign.lastMessage(hashBytes2)
    const srvLW = srvSign2.lastMessage(hashBytes2)
    const srvLM = unwireAll(srvLW)
    const aLast: Message[] = [bakLast, ...srvLM]

    // combine (backup)
    const bakSig = backupSign.combine(filter(aLast, backupId)) as [Uint8Array, Uint8Array]
    const [bakR] = bakSig

    const lastFS = aLast.filter((m) => m.from_id !== SERVER_ID).map((m) => wireMsg(m.clone()))
    const { r: srvRB, s: srvSB } = srvSign2.combine(lastFS)

    expect(u8ToHex(srvRB)).toBe(u8ToHex(bakR))

    const rec2 = await recoverFromRS(srvRB, srvSB, hashHex2, dkg2.serverAddress)
    expect(rec2.ok).toBe(true)
    expect(rec2.recovered.toLowerCase()).toBe(dkg2.serverAddress.toLowerCase())

    // Cleanup
    safeFree(srvSign2)
    freeAll([dkg2.deviceShare, dkg2.backupShare])
    freeAll([...aR1, ...aR2, ...aR3, ...aLast])
  })
})

// ---------------------------------------------------------------------------
// Refresh tests
// ---------------------------------------------------------------------------

describe("Refresh — key rotation keeps pubkey", () => {
  let dkg: DkgResult

  beforeAll(() => {
    dkg = runWrappedDkg()
  })

  it("refresh produces same pubkey and address, different share bytes", () => {
    // Run all 3 parties through refresh: device+backup as raw initKeyRotation,
    // server as MpcServerRefresh wrapper.
    const devRefresh = KeygenSession.initKeyRotation(cloneShare(dkg.deviceShare))
    const srvRefresh = new MpcServerRefresh(dkg.serverKeyshareBytes)
    const bakRefresh = KeygenSession.initKeyRotation(cloneShare(dkg.backupShare))

    // R1
    const devR1 = devRefresh.createFirstMessage()
    const srvW1 = srvRefresh.firstMessage()
    const srvM1 = unwireAll(srvW1)
    const bakR1 = bakRefresh.createFirstMessage()
    const aR1: Message[] = [devR1, ...srvM1, bakR1]

    // R2
    const devR2 = devRefresh.handleMessages(filter(aR1, 0))
    const bakR2 = bakRefresh.handleMessages(filter(aR1, 2))
    const r1FS = aR1.filter((m) => m.from_id !== SERVER_ID).map((m) => wireMsg(m.clone()))
    const srvS2 = srvRefresh.handle(r1FS)
    const srvM2 = unwireAll(srvS2.outbound)

    // Server commitment now available
    const srvCommWire = srvRefresh.getCommitmentWire()
    const srvCommBytes = srvCommWire.slice(2)
    const devComm = devRefresh.calculateChainCodeCommitment()
    const bakComm = bakRefresh.calculateChainCodeCommitment()

    const aR2: Message[] = [...devR2, ...srvM2, ...bakR2]

    // R3
    const devR3 = devRefresh.handleMessages(select(aR2, 0))
    const bakR3 = bakRefresh.handleMessages(select(aR2, 2))
    const r2FS = aR2.filter((m) => m.to_id === SERVER_ID).map((m) => wireMsg(m.clone()))
    const srvS3 = srvRefresh.handle(r2FS)
    const srvM3 = unwireAll(srvS3.outbound)
    const aR3: Message[] = [...devR3, ...srvM3, ...bakR3]

    // R4a
    const allComm: Uint8Array[] = [devComm, srvCommBytes, bakComm]
    const devR4a = devRefresh.handleMessages(select(aR3, 0), allComm)
    const bakR4a = bakRefresh.handleMessages(select(aR3, 2), allComm)
    const r3FS = aR3.filter((m) => m.to_id === SERVER_ID).map((m) => wireMsg(m.clone()))
    const srvR4aInput = [
      ...r3FS,
      encodeCommitment(0, devComm),
      encodeCommitment(2, bakComm),
    ]
    const srvS4a = srvRefresh.handle(srvR4aInput)
    const srvM4a = unwireAll(srvS4a.outbound)
    const aR4: Message[] = [...devR4a, ...srvM4a, ...bakR4a]

    // R4b
    devRefresh.handleMessages(filter(aR4, 0))
    bakRefresh.handleMessages(filter(aR4, 2))
    const r4FS = aR4.filter((m) => m.from_id !== SERVER_ID).map((m) => wireMsg(m.clone()))
    const srvS4b = srvRefresh.handle(r4FS)
    expect(srvS4b.done).toBe(true)

    // Extract refreshed shares
    const srvNew = srvRefresh.finish()
    const devNewShare = devRefresh.keyshare()
    const bakNewShare = bakRefresh.keyshare()

    // Public key UNCHANGED
    expect(srvNew.pubkey).toBe(dkg.serverPubkey)
    expect(u8ToHex(devNewShare.publicKey)).toBe(dkg.serverPubkey)
    expect(u8ToHex(bakNewShare.publicKey)).toBe(dkg.serverPubkey)

    // Address UNCHANGED
    expect(srvNew.address.toLowerCase()).toBe(dkg.serverAddress.toLowerCase())

    // Share bytes have CHANGED (new randomness)
    expect(srvNew.keyshareBytes.toString("hex")).not.toBe(
      dkg.serverKeyshareBytes.toString("hex"),
    )

    // Cleanup
    freeAll([devNewShare, bakNewShare])
    safeFree(srvRefresh)
    freeAll([...aR1, ...aR2, ...aR3, ...aR4])
  })

  it("post-refresh device+server sign recovers same DKG address", async () => {
    // Run refresh again for a clean set of refreshed shares
    const dkg2 = runWrappedDkg()

    const devRf = KeygenSession.initKeyRotation(cloneShare(dkg2.deviceShare))
    const srvRf = new MpcServerRefresh(dkg2.serverKeyshareBytes)
    const bakRf = KeygenSession.initKeyRotation(cloneShare(dkg2.backupShare))

    // R1
    const dR1 = devRf.createFirstMessage()
    const sW1 = srvRf.firstMessage()
    const sM1 = unwireAll(sW1)
    const bR1 = bakRf.createFirstMessage()
    const pR1: Message[] = [dR1, ...sM1, bR1]

    // R2
    const dR2 = devRf.handleMessages(filter(pR1, 0))
    const bR2 = bakRf.handleMessages(filter(pR1, 2))
    const r1fs = pR1.filter((m) => m.from_id !== SERVER_ID).map((m) => wireMsg(m.clone()))
    const sS2 = srvRf.handle(r1fs)
    const sM2 = unwireAll(sS2.outbound)
    const sCommW = srvRf.getCommitmentWire()
    const sCommB = sCommW.slice(2)
    const dComm = devRf.calculateChainCodeCommitment()
    const bComm = bakRf.calculateChainCodeCommitment()
    const pR2: Message[] = [...dR2, ...sM2, ...bR2]

    // R3
    const dR3 = devRf.handleMessages(select(pR2, 0))
    const bR3 = bakRf.handleMessages(select(pR2, 2))
    const r2fs = pR2.filter((m) => m.to_id === SERVER_ID).map((m) => wireMsg(m.clone()))
    const sS3 = srvRf.handle(r2fs)
    const sM3 = unwireAll(sS3.outbound)
    const pR3: Message[] = [...dR3, ...sM3, ...bR3]

    // R4a
    const allC: Uint8Array[] = [dComm, sCommB, bComm]
    const dR4a = devRf.handleMessages(select(pR3, 0), allC)
    const bR4a = bakRf.handleMessages(select(pR3, 2), allC)
    const r3fs = pR3.filter((m) => m.to_id === SERVER_ID).map((m) => wireMsg(m.clone()))
    const sR4aIn = [...r3fs, encodeCommitment(0, dComm), encodeCommitment(2, bComm)]
    const sS4a = srvRf.handle(sR4aIn)
    const sM4a = unwireAll(sS4a.outbound)
    const pR4: Message[] = [...dR4a, ...sM4a, ...bR4a]

    // R4b
    devRf.handleMessages(filter(pR4, 0))
    bakRf.handleMessages(filter(pR4, 2))
    const r4fs = pR4.filter((m) => m.from_id !== SERVER_ID).map((m) => wireMsg(m.clone()))
    const sS4b = srvRf.handle(r4fs)
    expect(sS4b.done).toBe(true)

    const srvNewResult = srvRf.finish()
    const devNewShare = devRf.keyshare()

    // Sign with refreshed keys
    const hashHex3 = keccak256(toHex("post-refresh-sign"))
    const hashBytes3 = Uint8Array.from(
      (hashHex3.slice(2).match(/.{2}/g) as string[]).map((h) => parseInt(h, 16)),
    )

    const devSignId = devNewShare.partyId
    const devSignSess = new SignSession(cloneShare(devNewShare), "m")
    const srvSignSess = new MpcServerSign(srvNewResult.keyshareBytes)

    const sdR1 = devSignSess.createFirstMessage()
    const ssW1 = srvSignSess.firstMessage()
    const ssM1 = unwireAll(ssW1)
    const saR1: Message[] = [sdR1, ...ssM1]

    const sdR2 = devSignSess.handleMessages(filter(saR1, devSignId))
    const sr1fs = saR1.filter((m) => m.from_id !== SERVER_ID).map((m) => wireMsg(m.clone()))
    const ssS2 = srvSignSess.handle(sr1fs)
    const ssM2 = unwireAll(ssS2.outbound)
    const saR2: Message[] = [...sdR2, ...ssM2]

    const sdR3 = devSignSess.handleMessages(select(saR2, devSignId))
    const sr2fs = saR2.filter((m) => m.to_id === SERVER_ID).map((m) => wireMsg(m.clone()))
    const ssS3 = srvSignSess.handle(sr2fs)
    const ssM3 = unwireAll(ssS3.outbound)
    const saR3: Message[] = [...sdR3, ...ssM3]

    devSignSess.handleMessages(select(saR3, devSignId))
    const sr3fs = saR3.filter((m) => m.to_id === SERVER_ID).map((m) => wireMsg(m.clone()))
    srvSignSess.handle(sr3fs)

    const sdLast = devSignSess.lastMessage(hashBytes3)
    const ssLW = srvSignSess.lastMessage(hashBytes3)
    const ssLM = unwireAll(ssLW)
    const saLast: Message[] = [sdLast, ...ssLM]

    const devPostSig = devSignSess.combine(filter(saLast, devSignId)) as [Uint8Array, Uint8Array]
    const [devPostR] = devPostSig
    const lastFs = saLast.filter((m) => m.from_id !== SERVER_ID).map((m) => wireMsg(m.clone()))
    const { r: postR, s: postS } = srvSignSess.combine(lastFs)

    expect(u8ToHex(postR)).toBe(u8ToHex(devPostR))

    const rec = await recoverFromRS(postR, postS, hashHex3, dkg2.serverAddress)
    expect(rec.ok).toBe(true)
    expect(rec.recovered.toLowerCase()).toBe(dkg2.serverAddress.toLowerCase())

    // Cleanup
    safeFree(srvSignSess)
    safeFree(devNewShare)
    freeAll([dkg2.deviceShare, dkg2.backupShare])
    freeAll([...pR1, ...pR2, ...pR3, ...pR4, ...saR1, ...saR2, ...saR3, ...saLast])
  })
})
