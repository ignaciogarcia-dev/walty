// apps/api/tests/integration/mpc-ceremony.test.ts
//
// Real-WASM, real-DB integration tests for the transport-agnostic Ceremony
// orchestrator (services/mpc/ceremony.ts). No socket.io is involved — the
// namespace is a thin adapter; here we drive the orchestrator's API directly.
//
// A Node-simulated CLIENT drives BOTH browser parties locally:
//   party 0 = device  (raw KeygenSession / SignSession)
//   party 2 = backup  (raw KeygenSession)
// The SERVER party (party 1) lives inside the Ceremony. Only server-bound wire
// frames are relayed through the Ceremony API (submitRound); intra-client
// messages stay local — mirroring the real topology.
//
// DB is required for the DKG persist step, so this lives under tests/integration.

import { randomBytes } from "node:crypto"

// Set the dev KEK before any module that builds the KMS reads it.
process.env.MPC_KMS_DEV_KEK =
  process.env.MPC_KMS_DEV_KEK ?? randomBytes(32).toString("base64")

import { beforeAll, describe, expect, it } from "vitest"
import {
  KeygenSession,
  Keyshare,
  Message,
  SignSession,
} from "@silencelaboratories/dkls-wasm-ll-node"
import { keccak256, toHex, recoverAddress, recoverPublicKey, type Hex } from "viem"
import { publicKeyToAddress } from "viem/utils"
import { db, users, mpcKeys, mpcChildAddresses } from "@walty/db"
import { randomUUID } from "node:crypto"
import { Ceremony, CeremonyError } from "../../src/services/mpc/ceremony.js"

const PARTICIPANTS = 3
const THRESHOLD = 2
const SERVER_ID = 1
const DEVICE_ID = 0
const BACKUP_ID = 2

const BROADCAST = 0xff
const COMMITMENT_SENTINEL = 0xfe

// --- wire helpers (must match MpcServerParty internals) --------------------

function wireMsg(msg: Message): Uint8Array {
  const payload = msg.payload
  const out = new Uint8Array(2 + payload.length)
  out[0] = msg.from_id
  out[1] = msg.to_id === undefined ? BROADCAST : msg.to_id
  out.set(payload, 2)
  msg.free()
  return out
}

function unwireMsg(raw: Uint8Array): Message {
  const from = raw[0]
  const to = raw[1] === BROADCAST ? undefined : raw[1]
  return new Message(raw.slice(2), from, to)
}

function filter(msgs: Message[], partyId: number): Message[] {
  return msgs.filter((m) => m.from_id !== partyId).map((m) => m.clone())
}

function select(msgs: Message[], partyId: number): Message[] {
  return msgs.filter((m) => m.to_id === partyId).map((m) => m.clone())
}

function encodeCommitment(fromPartyId: number, bytes: Uint8Array): Uint8Array {
  const out = new Uint8Array(2 + bytes.length)
  out[0] = fromPartyId
  out[1] = COMMITMENT_SENTINEL
  out.set(bytes, 2)
  return out
}

// --- bundle codec (must match ceremony.ts encodeBundle/decodeBundle) -------

function encodeBundle(frames: Uint8Array[]): string {
  const arr = frames.map((f) => Buffer.from(f).toString("base64"))
  return Buffer.from(JSON.stringify(arr), "utf8").toString("base64")
}

function decodeBundle(b64: string): Uint8Array[] {
  const arr = JSON.parse(Buffer.from(b64, "base64").toString("utf8")) as string[]
  return arr.map((s) => new Uint8Array(Buffer.from(s, "base64")))
}

/** Split a server outbound bundle into WASM messages + commitment map. */
function splitServerOutbound(b64: string): {
  messages: Message[]
  commitments: Map<number, Uint8Array>
} {
  const frames = decodeBundle(b64)
  const messages: Message[] = []
  const commitments = new Map<number, Uint8Array>()
  for (const f of frames) {
    if (f[1] === COMMITMENT_SENTINEL) commitments.set(f[0], f.slice(2))
    else messages.push(unwireMsg(f))
  }
  return { messages, commitments }
}

function u8ToHex(u: Uint8Array): Hex {
  return ("0x" +
    Array.from(u)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("")) as Hex
}

function freeAll(objs: Array<{ free(): void } | null | undefined>): void {
  for (const o of objs) {
    if (o) try { o.free() } catch { /* already freed */ }
  }
}

const NOW_PLUS = () => Date.now() + 20_000

// --- HD child-address derivation (pure local, mirrors mpc-hd-spike.ts) --------

const SECP256K1_N = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n
const HALF_N = SECP256K1_N / 2n
function bytesToBig(u: Uint8Array): bigint {
  return BigInt(u8ToHex(u))
}
function hashOf(msg: string): { hex: Hex; bytes: Uint8Array } {
  const hex = keccak256(toHex(msg))
  const bytes = Uint8Array.from((hex.slice(2).match(/.{2}/g) as string[]).map((h) => parseInt(h, 16)))
  return { hex, bytes }
}
/** Raw 2-party sign over share buffers at `path`, routed by real partyId. */
function localSign(shareBuffers: Buffer[], hash: Uint8Array, path: string): { r: Uint8Array; s: Uint8Array } {
  const ks = shareBuffers.map((b) => Keyshare.fromBytes(b))
  const ids = ks.map((k) => k.partyId)
  const parties = ks.map((k) => new SignSession(k, path))
  const m1 = parties.map((p) => p.createFirstMessage())
  const m2 = parties.flatMap((p, i) => p.handleMessages(filter(m1, ids[i])))
  const m3 = parties.flatMap((p, i) => p.handleMessages(select(m2, ids[i])))
  parties.forEach((p, i) => p.handleMessages(select(m3, ids[i])))
  const m4 = parties.map((p) => p.lastMessage(hash))
  const sigs = parties.map((p, i) => p.combine(filter(m4, ids[i])))
  const [R, S] = sigs[0] as [Uint8Array, Uint8Array]
  return { r: R, s: S }
}
async function candidatePubkeys(r: Uint8Array, s: Uint8Array, hash: Hex): Promise<Set<string>> {
  let sBig = bytesToBig(s)
  if (sBig > HALF_N) sBig = SECP256K1_N - sBig
  const rHex = u8ToHex(r)
  const sHex = ("0x" + sBig.toString(16).padStart(64, "0")) as Hex
  const out = new Set<string>()
  for (const yParity of [0, 1] as const) {
    try { out.add(await recoverPublicKey({ hash, signature: { r: rHex, s: sHex, yParity } })) } catch { /* skip */ }
  }
  return out
}
/** Learn a child address from signatures alone (two hashes, intersect pubkeys). */
async function deriveChildLocal(shareBuffers: Buffer[], index: number): Promise<string> {
  const path = `m/${index}`
  const h1 = hashOf("hd-derive-1")
  const h2 = hashOf("hd-derive-2")
  const sig1 = localSign(shareBuffers, h1.bytes, path)
  const sig2 = localSign(shareBuffers, h2.bytes, path)
  const c1 = await candidatePubkeys(sig1.r, sig1.s, h1.hex)
  const c2 = await candidatePubkeys(sig2.r, sig2.s, h2.hex)
  const common = [...c1].filter((p) => c2.has(p))
  if (common.length !== 1) throw new Error(`ambiguous child pubkey (${common.length})`)
  return publicKeyToAddress(common[0] as Hex)
}

async function createTestUser(): Promise<number> {
  const [u] = await db
    .insert(users)
    .values({
      email: `mpc-${Date.now()}-${Math.random()}@example.com`,
      passwordHash: "x",
    })
    .returning()
  return u.id
}

// ===========================================================================
// Run a full DKG through the Ceremony orchestrator. Returns the keyId and the
// client-side device/backup shares (kept alive so a sign can follow).
// ===========================================================================

interface DkgOutcome {
  keyId: string
  pubkey: string
  address: string
  deviceShareBytes: Buffer
  backupShareBytes: Buffer
}

async function runDkgCeremony(userId: number): Promise<DkgOutcome> {
  const device = new KeygenSession(PARTICIPANTS, THRESHOLD, DEVICE_ID)
  const backup = new KeygenSession(PARTICIPANTS, THRESHOLD, BACKUP_ID)
  const ceremonyKeyId = randomUUID() // placeholder correlation id for DKG

  const { ceremony, firstOutbound } = await Ceremony.create({
    userId,
    ceremonyType: "dkg",
  })

  // --- Round 1: every party emits first broadcast ---
  const devMsg1 = device.createFirstMessage()
  const bakMsg1 = backup.createFirstMessage()
  const { messages: srvMsgs1 } = splitServerOutbound(firstOutbound)
  const all1: Message[] = [devMsg1, ...srvMsgs1, bakMsg1]

  // device + backup advance locally (filter their own out)
  const devMsgs2 = device.handleMessages(filter(all1, DEVICE_ID))
  const bakMsgs2 = backup.handleMessages(filter(all1, BACKUP_ID))
  const devComm = device.calculateChainCodeCommitment()
  const bakComm = backup.calculateChainCodeCommitment()

  // server gets all r1 not from server
  const r1ForSrv = all1
    .filter((m) => m.from_id !== SERVER_ID)
    .map((m) => wireMsg(m.clone()))
  const step1 = await ceremony.submitRound({
    ceremonyType: "dkg",
    partyId: 0,
    keyId: ceremonyKeyId,
    round: 1,
    sequence: 1,
    expiresAt: NOW_PLUS(),
    payload: encodeBundle(r1ForSrv),
  })
  const { messages: srvMsgs2, commitments: srvCommMap } = splitServerOutbound(
    step1.outbound,
  )
  const srvComm = srvCommMap.get(SERVER_ID)!
  const all2: Message[] = [...devMsgs2, ...srvMsgs2, ...bakMsgs2]

  // --- Round 3: P2P select ---
  const devMsgs3 = device.handleMessages(select(all2, DEVICE_ID))
  const bakMsgs3 = backup.handleMessages(select(all2, BACKUP_ID))
  const r2ForSrv = all2
    .filter((m) => m.to_id === SERVER_ID)
    .map((m) => wireMsg(m.clone()))
  const step2 = await ceremony.submitRound({
    ceremonyType: "dkg",
    partyId: 0,
    keyId: ceremonyKeyId,
    round: 2,
    sequence: 2,
    expiresAt: NOW_PLUS(),
    payload: encodeBundle(r2ForSrv),
  })
  const { messages: srvMsgs3 } = splitServerOutbound(step2.outbound)
  const all3: Message[] = [...devMsgs3, ...srvMsgs3, ...bakMsgs3]

  // --- Round 4a: select + all commitments ---
  const allComm: Uint8Array[] = [devComm, srvComm, bakComm]
  const devMsgs4 = device.handleMessages(select(all3, DEVICE_ID), allComm)
  const bakMsgs4 = backup.handleMessages(select(all3, BACKUP_ID), allComm)
  const r3ForSrv = [
    ...all3.filter((m) => m.to_id === SERVER_ID).map((m) => wireMsg(m.clone())),
    encodeCommitment(DEVICE_ID, devComm),
    encodeCommitment(BACKUP_ID, bakComm),
  ]
  const step3 = await ceremony.submitRound({
    ceremonyType: "dkg",
    partyId: 0,
    keyId: ceremonyKeyId,
    round: 3,
    sequence: 3,
    expiresAt: NOW_PLUS(),
    payload: encodeBundle(r3ForSrv),
  })
  const { messages: srvMsgs4 } = splitServerOutbound(step3.outbound)
  const all4: Message[] = [...devMsgs4, ...srvMsgs4, ...bakMsgs4]

  // --- Round 4b: filter ---
  device.handleMessages(filter(all4, DEVICE_ID))
  backup.handleMessages(filter(all4, BACKUP_ID))
  const r4ForSrv = all4
    .filter((m) => m.from_id !== SERVER_ID)
    .map((m) => wireMsg(m.clone()))
  const step4 = await ceremony.submitRound({
    ceremonyType: "dkg",
    partyId: 0,
    keyId: ceremonyKeyId,
    round: 4,
    sequence: 4,
    expiresAt: NOW_PLUS(),
    payload: encodeBundle(r4ForSrv),
  })
  expect(step4.done).toBe(true)
  expect(step4.keyId).toBeTruthy()

  const devShare = device.keyshare()
  const bakShare = backup.keyshare()
  const pubkey = u8ToHex(devShare.publicKey)
  const deviceShareBytes = Buffer.from(devShare.toBytes())
  const backupShareBytes = Buffer.from(bakShare.toBytes())

  freeAll([devShare, bakShare, device, backup])
  freeAll([...all1, ...all2, ...all3, ...all4])

  return {
    keyId: step4.keyId!,
    pubkey,
    address: "", // filled by caller from db
    deviceShareBytes,
    backupShareBytes,
  }
}

// ===========================================================================
// Run a device(0)+server(1) sign through the orchestrator.
// ===========================================================================

async function runSignCeremony(
  userId: number,
  keyId: string,
  deviceShareBytes: Buffer,
  hashHex: Hex,
  derivationIndex = 0,
): Promise<{ r: Hex; s: Hex; yParity: 0 | 1 }> {
  const hashBytes = Uint8Array.from(
    (hashHex.slice(2).match(/.{2}/g) as string[]).map((h) => parseInt(h, 16)),
  )
  const path = derivationIndex > 0 ? `m/${derivationIndex}` : "m"
  const deviceSign = new SignSession(
    (await import("@silencelaboratories/dkls-wasm-ll-node")).Keyshare.fromBytes(
      deviceShareBytes,
    ),
    path,
  )

  const { ceremony, firstOutbound } = await Ceremony.create({
    userId,
    ceremonyType: "sign",
    keyId,
    signHash: hashHex,
    derivationIndex,
  })

  // R1
  const devMsg1 = deviceSign.createFirstMessage()
  const { messages: srvMsgs1 } = splitServerOutbound(firstOutbound)
  const all1: Message[] = [devMsg1, ...srvMsgs1]

  // R2
  const devMsgs2 = deviceSign.handleMessages(filter(all1, DEVICE_ID))
  const r1ForSrv = all1
    .filter((m) => m.from_id !== SERVER_ID)
    .map((m) => wireMsg(m.clone()))
  const step1 = await ceremony.submitRound({
    ceremonyType: "sign",
    partyId: 0,
    keyId,
    round: 1,
    sequence: 1,
    expiresAt: NOW_PLUS(),
    payload: encodeBundle(r1ForSrv),
  })
  const { messages: srvMsgs2 } = splitServerOutbound(step1.outbound)
  const all2: Message[] = [...devMsgs2, ...srvMsgs2]

  // R3
  const devMsgs3 = deviceSign.handleMessages(select(all2, DEVICE_ID))
  const r2ForSrv = all2
    .filter((m) => m.to_id === SERVER_ID)
    .map((m) => wireMsg(m.clone()))
  const step2 = await ceremony.submitRound({
    ceremonyType: "sign",
    partyId: 0,
    keyId,
    round: 2,
    sequence: 2,
    expiresAt: NOW_PLUS(),
    payload: encodeBundle(r2ForSrv),
  })
  const { messages: srvMsgs3 } = splitServerOutbound(step2.outbound)
  const all3: Message[] = [...devMsgs3, ...srvMsgs3]

  // R3b internal + server last message (server returns its lastMessage here)
  deviceSign.handleMessages(select(all3, DEVICE_ID))
  const r3ForSrv = all3
    .filter((m) => m.to_id === SERVER_ID)
    .map((m) => wireMsg(m.clone()))
  const step3 = await ceremony.submitRound({
    ceremonyType: "sign",
    partyId: 0,
    keyId,
    round: 3,
    sequence: 3,
    expiresAt: NOW_PLUS(),
    payload: encodeBundle(r3ForSrv),
  })
  // step3 outbound is the SERVER's last message
  const { messages: srvLast } = splitServerOutbound(step3.outbound)

  // device produces its own last message
  const devLast = deviceSign.lastMessage(hashBytes)
  const allLast: Message[] = [devLast, ...srvLast]

  // device combines (locally) — not needed for assertion, but advances state
  deviceSign.combine(filter(allLast, DEVICE_ID))

  // server combines: client sends the device's last message to the server
  const lastForSrv = allLast
    .filter((m) => m.from_id !== SERVER_ID)
    .map((m) => wireMsg(m.clone()))
  const step4 = await ceremony.submitRound({
    ceremonyType: "sign",
    partyId: 0,
    keyId,
    round: 4,
    sequence: 4,
    expiresAt: NOW_PLUS(),
    payload: encodeBundle(lastForSrv),
  })
  expect(step4.done).toBe(true)
  expect(step4.signature).toBeTruthy()

  freeAll([deviceSign, ...all1, ...all2, ...all3, ...allLast])

  return {
    r: step4.signature!.r,
    s: step4.signature!.s,
    yParity: step4.signature!.yParity,
  }
}

// ===========================================================================
// Tests
// ===========================================================================

describe("MPC Ceremony orchestrator (real WASM + real DB)", () => {
  let userId: number

  beforeAll(async () => {
    // setup.ts truncates between tests; create the user in each test instead.
  })

  it("DKG completes and persists an owned key", async () => {
    userId = await createTestUser()
    const dkg = await runDkgCeremony(userId)

    const row = await db.query.mpcKeys.findFirst({
      where: (k, { eq }) => eq(k.id, dkg.keyId),
    })
    expect(row).toBeTruthy()
    expect(row!.userId).toBe(userId)
    expect(row!.pubkey).toBe(dkg.pubkey)
    expect(row!.status).toBe("active")
  })

  it("DKG registers the MPC address as the owner's linked address", async () => {
    userId = await createTestUser()
    const dkg = await runDkgCeremony(userId)

    const keyRow = await db.query.mpcKeys.findFirst({
      where: (k, { eq }) => eq(k.id, dkg.keyId),
    })
    const addrRow = await db.query.addresses.findFirst({
      where: (a, { eq }) => eq(a.userId, userId),
    })
    expect(addrRow).toBeTruthy()
    expect(addrRow!.address.toLowerCase()).toBe(keyRow!.address.toLowerCase())
  })

  it("sign (device+server) yields a signature recovering the DKG address", async () => {
    userId = await createTestUser()
    const dkg = await runDkgCeremony(userId)
    const row = await db.query.mpcKeys.findFirst({
      where: (k, { eq }) => eq(k.id, dkg.keyId),
    })
    const address = row!.address

    const hashHex = keccak256(toHex("walty-ceremony-sign"))
    const sig = await runSignCeremony(
      userId,
      dkg.keyId,
      dkg.deviceShareBytes,
      hashHex,
    )

    const recovered = await recoverAddress({
      hash: hashHex,
      signature: { r: sig.r, s: sig.s, yParity: sig.yParity },
    })
    expect(recovered.toLowerCase()).toBe(address.toLowerCase())
  })

  it("refresh keeps the same pubkey and a post-refresh sign still recovers", async () => {
    userId = await createTestUser()
    const dkg = await runDkgCeremony(userId)
    const before = await db.query.mpcKeys.findFirst({
      where: (k, { eq }) => eq(k.id, dkg.keyId),
    })

    // Run refresh: device(0)+backup(2) local, server(1) in the Ceremony.
    const device = KeygenSession.initKeyRotation(
      (await import("@silencelaboratories/dkls-wasm-ll-node")).Keyshare.fromBytes(
        dkg.deviceShareBytes,
      ),
    )
    const backup = KeygenSession.initKeyRotation(
      (await import("@silencelaboratories/dkls-wasm-ll-node")).Keyshare.fromBytes(
        dkg.backupShareBytes,
      ),
    )

    const { ceremony, firstOutbound } = await Ceremony.create({
      userId,
      ceremonyType: "refresh",
      keyId: dkg.keyId,
    })

    const devMsg1 = device.createFirstMessage()
    const bakMsg1 = backup.createFirstMessage()
    const { messages: srvMsgs1 } = splitServerOutbound(firstOutbound)
    const all1: Message[] = [devMsg1, ...srvMsgs1, bakMsg1]

    const devMsgs2 = device.handleMessages(filter(all1, DEVICE_ID))
    const bakMsgs2 = backup.handleMessages(filter(all1, BACKUP_ID))
    const devComm = device.calculateChainCodeCommitment()
    const bakComm = backup.calculateChainCodeCommitment()
    const r1ForSrv = all1
      .filter((m) => m.from_id !== SERVER_ID)
      .map((m) => wireMsg(m.clone()))
    const step1 = await ceremony.submitRound({
      ceremonyType: "refresh",
      partyId: 0,
      keyId: dkg.keyId,
      round: 1,
      sequence: 1,
      expiresAt: NOW_PLUS(),
      payload: encodeBundle(r1ForSrv),
    })
    const { messages: srvMsgs2, commitments } = splitServerOutbound(step1.outbound)
    const srvComm = commitments.get(SERVER_ID)!
    const all2: Message[] = [...devMsgs2, ...srvMsgs2, ...bakMsgs2]

    const devMsgs3 = device.handleMessages(select(all2, DEVICE_ID))
    const bakMsgs3 = backup.handleMessages(select(all2, BACKUP_ID))
    const r2ForSrv = all2
      .filter((m) => m.to_id === SERVER_ID)
      .map((m) => wireMsg(m.clone()))
    const step2 = await ceremony.submitRound({
      ceremonyType: "refresh",
      partyId: 0,
      keyId: dkg.keyId,
      round: 2,
      sequence: 2,
      expiresAt: NOW_PLUS(),
      payload: encodeBundle(r2ForSrv),
    })
    const { messages: srvMsgs3 } = splitServerOutbound(step2.outbound)
    const all3: Message[] = [...devMsgs3, ...srvMsgs3, ...bakMsgs3]

    const allComm: Uint8Array[] = [devComm, srvComm, bakComm]
    const devMsgs4 = device.handleMessages(select(all3, DEVICE_ID), allComm)
    const bakMsgs4 = backup.handleMessages(select(all3, BACKUP_ID), allComm)
    const r3ForSrv = [
      ...all3.filter((m) => m.to_id === SERVER_ID).map((m) => wireMsg(m.clone())),
      encodeCommitment(DEVICE_ID, devComm),
      encodeCommitment(BACKUP_ID, bakComm),
    ]
    const step3 = await ceremony.submitRound({
      ceremonyType: "refresh",
      partyId: 0,
      keyId: dkg.keyId,
      round: 3,
      sequence: 3,
      expiresAt: NOW_PLUS(),
      payload: encodeBundle(r3ForSrv),
    })
    const { messages: srvMsgs4 } = splitServerOutbound(step3.outbound)
    const all4: Message[] = [...devMsgs4, ...srvMsgs4, ...bakMsgs4]

    device.handleMessages(filter(all4, DEVICE_ID))
    backup.handleMessages(filter(all4, BACKUP_ID))
    const r4ForSrv = all4
      .filter((m) => m.from_id !== SERVER_ID)
      .map((m) => wireMsg(m.clone()))
    const step4 = await ceremony.submitRound({
      ceremonyType: "refresh",
      partyId: 0,
      keyId: dkg.keyId,
      round: 4,
      sequence: 4,
      expiresAt: NOW_PLUS(),
      payload: encodeBundle(r4ForSrv),
    })
    expect(step4.done).toBe(true)

    const devNew = device.keyshare()
    const newDeviceShareBytes = Buffer.from(devNew.toBytes())
    freeAll([devNew, device, backup, ...all1, ...all2, ...all3, ...all4])

    // pubkey unchanged
    const after = await db.query.mpcKeys.findFirst({
      where: (k, { eq }) => eq(k.id, dkg.keyId),
    })
    expect(after!.pubkey).toBe(before!.pubkey)
    expect(after!.version).toBe(before!.version + 1)

    // post-refresh sign with refreshed device share still recovers the address
    const hashHex = keccak256(toHex("post-refresh-ceremony-sign"))
    const sig = await runSignCeremony(
      userId,
      dkg.keyId,
      newDeviceShareBytes,
      hashHex,
    )
    const recovered = await recoverAddress({
      hash: hashHex,
      signature: { r: sig.r, s: sig.s, yParity: sig.yParity },
    })
    expect(recovered.toLowerCase()).toBe(after!.address.toLowerCase())
  })

  // --- HD-under-MPC child signing ------------------------------------------

  it("sign at m/1 recovers the registered child address (not the master)", async () => {
    userId = await createTestUser()
    const dkg = await runDkgCeremony(userId)
    const masterRow = await db.query.mpcKeys.findFirst({
      where: (k, { eq }) => eq(k.id, dkg.keyId),
    })
    const masterAddr = masterRow!.address

    // Derive cashier-1's child address (device+backup quorum, local) and register it.
    const childAddr = await deriveChildLocal(
      [dkg.deviceShareBytes, dkg.backupShareBytes],
      1,
    )
    expect(childAddr.toLowerCase()).not.toBe(masterAddr.toLowerCase())
    await db
      .insert(mpcChildAddresses)
      .values({ keyId: dkg.keyId, derivationIndex: 1, address: childAddr })

    // Sign at m/1 through the real ceremony — must recover the child address.
    const hashHex = keccak256(toHex("hd-child-sign"))
    const sig = await runSignCeremony(userId, dkg.keyId, dkg.deviceShareBytes, hashHex, 1)
    const recovered = await recoverAddress({
      hash: hashHex,
      signature: { r: sig.r, s: sig.s, yParity: sig.yParity },
    })
    expect(recovered.toLowerCase()).toBe(childAddr.toLowerCase())
  })

  it("rejects a child sign whose index is not registered", async () => {
    userId = await createTestUser()
    const dkg = await runDkgCeremony(userId)
    await expect(
      Ceremony.create({
        userId,
        ceremonyType: "sign",
        keyId: dkg.keyId,
        signHash: keccak256(toHex("unregistered")),
        derivationIndex: 7,
      }),
    ).rejects.toMatchObject({ reason: "invalid_payload" })
  })

  // --- Protocol guards -----------------------------------------------------

  it("rejects a replayed / old sequence", async () => {
    userId = await createTestUser()
    const { ceremony } = await Ceremony.create({ userId, ceremonyType: "dkg" })
    const keyId = randomUUID()

    // Drive only round 1 with a valid bundle so sequence=1 is accepted.
    const device = new KeygenSession(PARTICIPANTS, THRESHOLD, DEVICE_ID)
    const backup = new KeygenSession(PARTICIPANTS, THRESHOLD, BACKUP_ID)
    const devMsg1 = device.createFirstMessage()
    const bakMsg1 = backup.createFirstMessage()
    // server first message is already produced inside create(); we just need a
    // well-formed r1 bundle for the server (its own message excluded).
    const r1ForSrv = [devMsg1, bakMsg1].map((m) => wireMsg(m.clone()))

    await ceremony.submitRound({
      ceremonyType: "dkg",
      partyId: 0,
      keyId,
      round: 1,
      sequence: 5,
      expiresAt: NOW_PLUS(),
      payload: encodeBundle(r1ForSrv),
    })

    // Replay an OLD sequence (<= last accepted 5) for the next round.
    await expect(
      ceremony.submitRound({
        ceremonyType: "dkg",
        partyId: 0,
        keyId,
        round: 2,
        sequence: 5,
        expiresAt: NOW_PLUS(),
        payload: encodeBundle([]),
      }),
    ).rejects.toMatchObject({ reason: "replay" })

    freeAll([device, backup, devMsg1, bakMsg1])
  })

  it("rejects an expired message", async () => {
    userId = await createTestUser()
    const { ceremony } = await Ceremony.create({ userId, ceremonyType: "dkg" })
    await expect(
      ceremony.submitRound({
        ceremonyType: "dkg",
        partyId: 0,
        keyId: randomUUID(),
        round: 1,
        sequence: 1,
        expiresAt: Date.now() - 1, // already expired
        payload: encodeBundle([]),
      }),
    ).rejects.toMatchObject({ reason: "expired" })
  })

  it("abort clears state — subsequent messages for that ceremonyId are rejected", async () => {
    userId = await createTestUser()
    const { ceremony } = await Ceremony.create({ userId, ceremonyType: "dkg" })
    ceremony.abort("test")
    expect(ceremony.isAborted).toBe(true)
    await expect(
      ceremony.submitRound({
        ceremonyType: "dkg",
        partyId: 0,
        keyId: randomUUID(),
        round: 1,
        sequence: 1,
        expiresAt: NOW_PLUS(),
        payload: encodeBundle([]),
      }),
    ).rejects.toMatchObject({ reason: "aborted" })
  })

  it("server-alone cannot produce a signature (no client participation)", async () => {
    userId = await createTestUser()
    const dkg = await runDkgCeremony(userId)
    const { ceremony } = await Ceremony.create({
      userId,
      ceremonyType: "sign",
      keyId: dkg.keyId,
      signHash: keccak256(toHex("server-alone")),
    })
    // Feed the server an EMPTY round-1 bundle (no device first message). The
    // WASM sign state machine cannot advance without the peer's message, so
    // the step throws and the ceremony tears down — no signature is produced.
    await expect(
      ceremony.submitRound({
        ceremonyType: "sign",
        partyId: 0,
        keyId: dkg.keyId,
        round: 1,
        sequence: 1,
        expiresAt: NOW_PLUS(),
        payload: encodeBundle([]),
      }),
    ).rejects.toBeInstanceOf(CeremonyError)
    expect(ceremony.isCompleted).toBe(false)
    expect(ceremony.isAborted).toBe(true)
  })

  it("active reaper aborts an idle ceremony at its deadline and fires the teardown hook", async () => {
    userId = await createTestUser()
    const { ceremony } = await Ceremony.create({ userId, ceremonyType: "dkg" })

    let tornDown = false
    ceremony.onTeardownOnce(() => {
      tornDown = true
    })
    expect(ceremony.isTerminal).toBe(false)

    // The reaper is armed to MPC_ROUND_TIMEOUT_MS. Drive its deadline into the
    // past and re-arm so it fires promptly, then wait for the timer.
    ceremony.forceDeadlineForTest(Date.now() - 1)
    await new Promise((res) => setTimeout(res, 50))

    expect(ceremony.isAborted).toBe(true)
    expect(tornDown).toBe(true)
  })

  it("rejects a ceremony whose keyId is not owned by the user", async () => {
    const owner = await createTestUser()
    const attacker = await createTestUser()
    const dkg = await runDkgCeremony(owner)
    await expect(
      Ceremony.create({
        userId: attacker,
        ceremonyType: "sign",
        keyId: dkg.keyId,
        signHash: keccak256(toHex("not-yours")),
      }),
    ).rejects.toMatchObject({ reason: "ownership" })
    // silence unused import lint for mpcKeys/users not directly referenced here
    void mpcKeys
  })

  // --- IMPORTANT-2: partyId binding ----------------------------------------

  it("rejects a round message whose partyId changed from the bound value", async () => {
    userId = await createTestUser()
    const { ceremony } = await Ceremony.create({ userId, ceremonyType: "dkg" })
    const keyId = randomUUID()

    // Provide a valid-looking DKG r1 bundle (device+backup first messages).
    const device = new KeygenSession(PARTICIPANTS, THRESHOLD, DEVICE_ID)
    const backup = new KeygenSession(PARTICIPANTS, THRESHOLD, BACKUP_ID)
    const devMsg1 = device.createFirstMessage()
    const bakMsg1 = backup.createFirstMessage()
    const r1ForSrv = [devMsg1, bakMsg1].map((m) => wireMsg(m.clone()))

    // First round with partyId=0 — accepted, binds partyId to 0.
    await ceremony.submitRound({
      ceremonyType: "dkg",
      partyId: 0,
      keyId,
      round: 1,
      sequence: 1,
      expiresAt: NOW_PLUS(),
      payload: encodeBundle(r1ForSrv),
    })

    // Second round with a DIFFERENT partyId — must be rejected.
    await expect(
      ceremony.submitRound({
        ceremonyType: "dkg",
        partyId: 2, // changed from 0
        keyId,
        round: 2,
        sequence: 2,
        expiresAt: NOW_PLUS(),
        payload: encodeBundle([]),
      }),
    ).rejects.toMatchObject({ reason: "party_mismatch" })

    freeAll([device, backup, devMsg1, bakMsg1])
  })

  // --- MINOR-8: expiry_too_far ---------------------------------------------

  it("rejects a message whose expiresAt is unreasonably far in the future", async () => {
    userId = await createTestUser()
    const { ceremony } = await Ceremony.create({ userId, ceremonyType: "dkg" })
    await expect(
      ceremony.submitRound({
        ceremonyType: "dkg",
        partyId: 0,
        keyId: randomUUID(),
        round: 1,
        sequence: 1,
        expiresAt: Date.now() + 999_999_999, // far future
        payload: encodeBundle([]),
      }),
    ).rejects.toMatchObject({ reason: "expiry_too_far" })
  })

  // --- MINOR-9: forceDeadlineForTest production guard ----------------------

  it("forceDeadlineForTest throws in production env", async () => {
    userId = await createTestUser()
    const { ceremony } = await Ceremony.create({ userId, ceremonyType: "dkg" })
    const origEnv = process.env.NODE_ENV
    process.env.NODE_ENV = "production"
    try {
      expect(() => ceremony.forceDeadlineForTest(Date.now() - 1)).toThrow(
        /forceDeadlineForTest must not be called in production/,
      )
    } finally {
      process.env.NODE_ENV = origEnv
    }
  })
})
