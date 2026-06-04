// apps/web/scripts/mpc-device-spike/page.ts
//
// Page-side spike orchestrator. Runs on the main thread:
//   - spawns the device worker (production MpcDeviceParty)
//   - inits the server-sim WASM in the page (ServerKeygen / ServerSign)
//   - drives a FULL local DKG (device+backup+server) → sign(device+server) →
//     refresh entirely in-browser, through the real bundle codec
//   - verifies every signature recoverAddress's to the DKG address (viem) and
//     that refresh keeps the same pubkey/address.
//
// Posts the structured result to window.__DEVICE_SPIKE_RESULT__.

import init from "@silencelaboratories/dkls-wasm-ll-web"
import wasmUrl from "@silencelaboratories/dkls-wasm-ll-web/dkls-wasm-ll-web_bg.wasm"
import { recoverAddress, type Hex } from "viem"
import { ServerKeygen, ServerSign } from "./serverSim.js"

const SECP256K1_N =
  0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n
const HALF_N = SECP256K1_N / 2n

type Check = { label: string; ok: boolean; detail?: string }
const checks: Check[] = []
function assert(ok: boolean, label: string, detail?: string) {
  checks.push({ ok, label, detail })
}

function u8ToHex(u: Uint8Array): Hex {
  return ("0x" +
    Array.from(u)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("")) as Hex
}

async function recover(
  r: Uint8Array,
  s: Uint8Array,
  hash: Hex,
  expected: string,
): Promise<{ ok: boolean; lowS: boolean }> {
  let sBig = BigInt(u8ToHex(s))
  const lowS = sBig <= HALF_N
  if (sBig > HALF_N) sBig = SECP256K1_N - sBig
  const rHex = u8ToHex(r)
  const sHex = ("0x" + sBig.toString(16).padStart(64, "0")) as Hex
  for (const yParity of [0, 1] as const) {
    try {
      const rec = await recoverAddress({ hash, signature: { r: rHex, s: sHex, yParity } })
      if (rec.toLowerCase() === expected.toLowerCase()) return { ok: true, lowS }
    } catch {
      /* try next */
    }
  }
  return { ok: false, lowS }
}

// ---- device worker RPC ----
let worker: Worker
let nextId = 1
const pending = new Map<number, { resolve: (v: any) => void; reject: (e: any) => void }>()

function workerCall(msg: Record<string, unknown>): Promise<any> {
  const id = nextId++
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject })
    worker.postMessage({ ...msg, id })
  })
}

function setupWorker(wasmUrlStr: string): Promise<void> {
  worker = new Worker("./deviceWorker.bundle.js", { type: "module" })
  worker.onmessage = (e: MessageEvent) => {
    const { id, type } = e.data
    const p = pending.get(id)
    if (!p) return
    pending.delete(id)
    if (type === "error") p.reject(new Error(e.data.error))
    else p.resolve(e.data)
  }
  worker.onerror = (e) => {
    for (const [, p] of pending) p.reject(new Error("worker.onerror: " + e.message))
  }
  return workerCall({ type: "init", wasmUrl: wasmUrlStr }).then(() => undefined)
}

// device worker helpers
async function deviceStart(payload: Record<string, unknown>): Promise<string> {
  const out = await workerCall({ type: "start", ...payload })
  return out.outboundBundle as string
}
async function deviceRound(
  serverBundle: string,
): Promise<{ outboundBundle: string; done: boolean; result?: any }> {
  const out = await workerCall({ type: "round", serverBundle })
  return {
    outboundBundle: out.outboundBundle,
    done: out.type === "result",
    result: out.result,
  }
}

// ---------------------------------------------------------------------------
// Keygen-style ping-pong (DKG + refresh share the same flow).
//
// device D0 = startBundle (device+backup r1)
// server S0 = server.firstBundle() (server r1)
// then 4 paired rounds: device consumes server's prior bundle, server consumes
// device's prior bundle, until both signal done.
// ---------------------------------------------------------------------------

async function runKeygenLike(
  server: ServerKeygen,
  deviceStartBundle: string,
): Promise<{ deviceResult: any; serverShareBytes: Uint8Array }> {
  let deviceOut = deviceStartBundle
  let serverOut = server.firstBundle()
  let deviceResult: any = null
  let serverShareBytes: Uint8Array | null = null
  let deviceDone = false
  let serverDone = false

  // Snapshot bundles BEFORE advancing either side so each consumes the
  // counterpart's matching-round output.
  for (let i = 0; i < 6 && !(deviceDone && serverDone); i++) {
    const dIn = serverOut
    const sIn = deviceOut

    if (!deviceDone) {
      const d = await deviceRound(dIn)
      deviceOut = d.outboundBundle
      if (d.done) {
        deviceResult = d.result
        deviceDone = true
      }
    }
    if (!serverDone) {
      const s = server.step(sIn)
      serverOut = s.outboundBundle
      if (s.done) {
        serverShareBytes = s.shareBytes!
        serverDone = true
      }
    }
  }

  if (!deviceDone || !serverDone) throw new Error("keygen did not converge")
  return { deviceResult, serverShareBytes: serverShareBytes! }
}

async function runSignLike(
  server: ServerSign,
  deviceStartBundle: string,
): Promise<{ r: Uint8Array; s: Uint8Array }> {
  let deviceOut = deviceStartBundle
  let serverOut = server.firstBundle()
  let sig: { r: Uint8Array; s: Uint8Array } | null = null
  let deviceDone = false
  let serverDone = false

  for (let i = 0; i < 8 && !(deviceDone && serverDone); i++) {
    const dIn = serverOut
    const sIn = deviceOut

    if (!deviceDone) {
      const d = await deviceRound(dIn)
      deviceOut = d.outboundBundle
      if (d.done) {
        sig = { r: d.result.r, s: d.result.s }
        deviceDone = true
      }
    }
    if (!serverDone) {
      const s = server.step(sIn)
      serverOut = s.outboundBundle
      if (s.done) serverDone = true
    }
  }

  if (!sig) throw new Error("sign did not produce a signature")
  return sig
}

// 32-byte test hash.
function testHash(label: string): { hash: Hex; bytes: Uint8Array } {
  // keccak-free deterministic 32-byte value for the spike.
  const enc = new TextEncoder().encode(label)
  const bytes = new Uint8Array(32)
  for (let i = 0; i < 32; i++) bytes[i] = enc[i % enc.length] ^ (i * 31)
  return { hash: u8ToHex(bytes), bytes }
}

async function run() {
  const env = {
    crossOriginIsolated:
      typeof (self as any).crossOriginIsolated === "boolean"
        ? (self as any).crossOriginIsolated
        : null,
    hasSharedArrayBuffer: typeof SharedArrayBuffer !== "undefined",
  }

  // server-sim WASM lives in the page.
  await init(wasmUrl as unknown as string)
  await setupWorker(String(wasmUrl))

  // ---- DKG ----
  const dkgServer = ServerKeygen.dkg()
  const dkgDeviceStart = await deviceStart({ ceremony: "dkg" })
  const { deviceResult: dkg, serverShareBytes } = await runKeygenLike(
    dkgServer,
    dkgDeviceStart,
  )
  dkgServer.free()

  assert(!!dkg && !!dkg.address, "DKG produced device result with address", dkg?.address)
  assert(
    !!dkg.deviceShareBytes && !!dkg.backupShareBytes,
    "DKG produced device + backup share bytes",
    `device=${dkg.deviceShareBytes?.length}B backup=${dkg.backupShareBytes?.length}B`,
  )
  const dkgAddress: string = dkg.address
  const dkgPubkey: string = dkg.pubkey

  // ---- Sign (device + server) ----
  const { hash: h1, bytes: hb1 } = testHash("walty-device-spike-sign-1")
  const signServer = new ServerSign(serverShareBytes, hb1)
  const signDeviceStart = await deviceStart({
    ceremony: "sign",
    deviceShareBytes: dkg.deviceShareBytes,
    hash: hb1,
  })
  const sig1 = await runSignLike(signServer, signDeviceStart)
  signServer.free()
  const rec1 = await recover(sig1.r, sig1.s, h1, dkgAddress)
  assert(rec1.ok, "sign(device+server) recovers DKG address", dkgAddress)
  assert(rec1.lowS, "signature is canonical low-s")

  // ---- Refresh ----
  const refreshServer = ServerKeygen.refresh(serverShareBytes)
  const refreshDeviceStart = await deviceStart({
    ceremony: "refresh",
    deviceShareBytes: dkg.deviceShareBytes,
    backupShareBytes: dkg.backupShareBytes,
  })
  const { deviceResult: refreshed, serverShareBytes: newServerShare } =
    await runKeygenLike(refreshServer, refreshDeviceStart)
  refreshServer.free()

  assert(refreshed.pubkey === dkgPubkey, "refresh keeps the same pubkey", refreshed.pubkey)
  assert(refreshed.address === dkgAddress, "refresh keeps the same address")
  assert(
    u8ToHex(refreshed.deviceShareBytes) !== u8ToHex(dkg.deviceShareBytes),
    "refreshed device share has different bytes",
  )

  // ---- Sign after refresh (refreshed device + refreshed server) ----
  const { hash: h2, bytes: hb2 } = testHash("walty-device-spike-sign-2-post-refresh")
  const signServer2 = new ServerSign(newServerShare, hb2)
  const signDeviceStart2 = await deviceStart({
    ceremony: "sign",
    deviceShareBytes: refreshed.deviceShareBytes,
    hash: hb2,
  })
  const sig2 = await runSignLike(signServer2, signDeviceStart2)
  signServer2.free()
  const rec2 = await recover(sig2.r, sig2.s, h2, dkgAddress)
  assert(rec2.ok, "post-refresh sign(device+server) recovers DKG address", dkgAddress)

  const failures = checks.filter((c) => !c.ok)
  return { pass: failures.length === 0, env, dkgAddress, dkgPubkey, checks, failures }
}

run()
  .then((result) => {
    ;(window as any).__DEVICE_SPIKE_RESULT__ = result
  })
  .catch((err: unknown) => {
    ;(window as any).__DEVICE_SPIKE_RESULT__ = {
      pass: false,
      error: err instanceof Error ? err.message + "\n" + err.stack : String(err),
    }
  })
