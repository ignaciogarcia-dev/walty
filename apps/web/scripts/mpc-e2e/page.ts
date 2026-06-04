// apps/web/scripts/mpc-e2e/page.ts
//
// Browser-side entry for the LIVE /mpc end-to-end proof. It drives the
// PRODUCTION client driver (lib/mpc/mpcClient.ts) against a REAL running API
// server over socket.io. Everything here runs inside a real headless chromium
// page served on a plain origin (no COOP/COEP); the worker + WASM are the
// production code paths.
//
// Flow: DKG → sign(device+server) → refresh → post-refresh sign. Each signature
// is recoverAddress'd (viem) against the DKG address. The structured result is
// posted to window.__MPC_E2E_RESULT__ for the Node driver to read.
//
// Config is injected by the driver on window.__MPC_E2E_CONFIG__:
//   { apiUrl, token, wasmUrl }

import { MpcClient } from "../../lib/mpc/mpcClient"
import { recoverAddress, type Hex } from "viem"

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
      /* try next parity */
    }
  }
  return { ok: false, lowS }
}

// keccak-free deterministic 32-byte test hash.
function testHash(label: string): { hash: Hex; bytes: Uint8Array } {
  const enc = new TextEncoder().encode(label)
  const bytes = new Uint8Array(32)
  for (let i = 0; i < 32; i++) bytes[i] = enc[i % enc.length] ^ (i * 31)
  return { hash: u8ToHex(bytes), bytes }
}

declare global {
  interface Window {
    __MPC_E2E_CONFIG__?: { apiUrl: string; token: string; wasmUrl: string }
    __MPC_E2E_RESULT__?: unknown
  }
}

// The driver bundles the worker separately; point the worker factory at it.
function createWorker(): Worker {
  return new Worker("./mpcWorker.bundle.js", { type: "module" })
}

async function run() {
  const cfg = window.__MPC_E2E_CONFIG__
  if (!cfg) throw new Error("missing __MPC_E2E_CONFIG__")

  const client = new MpcClient({
    apiUrl: cfg.apiUrl,
    token: cfg.token,
    wasmUrl: cfg.wasmUrl,
    createWorker,
  })
  await client.connect()

  try {
    // ---- DKG ----
    const dkg = await client.runDkg()
    assert(!!dkg.keyId, "DKG returned a server keyId", dkg.keyId)
    assert(!!dkg.result.address, "DKG produced an address", dkg.result.address)
    const dkgAddress = dkg.result.address
    const dkgPubkey = dkg.result.pubkey

    // ---- Sign (device + server) over the real /mpc ----
    const { hash: h1 } = testHash("walty-mpc-e2e-sign-1")
    const sign1 = await client.runSign(dkg.keyId, dkg.result.deviceShareBytes, h1)
    const rec1 = await recover(sign1.result.r, sign1.result.s, h1, dkgAddress)
    assert(rec1.ok, "sign(device+server) recovers DKG address over real /mpc", dkgAddress)
    assert(rec1.lowS, "signature is canonical low-s")
    if (sign1.serverSignature) {
      const recSrv = await recoverAddress({
        hash: h1,
        signature: sign1.serverSignature,
      })
      assert(
        recSrv.toLowerCase() === dkgAddress.toLowerCase(),
        "server-assembled signature also recovers DKG address",
      )
    }

    // ---- Refresh ----
    const refreshed = await client.runRefresh(
      dkg.keyId,
      dkg.result.deviceShareBytes,
      dkg.result.backupShareBytes,
    )
    assert(refreshed.result.pubkey === dkgPubkey, "refresh keeps same pubkey")
    assert(refreshed.result.address === dkgAddress, "refresh keeps same address")
    assert(
      u8ToHex(refreshed.result.deviceShareBytes) !== u8ToHex(dkg.result.deviceShareBytes),
      "refreshed device share bytes differ",
    )

    // ---- Post-refresh sign ----
    const { hash: h2 } = testHash("walty-mpc-e2e-sign-2-post-refresh")
    const sign2 = await client.runSign(
      dkg.keyId,
      refreshed.result.deviceShareBytes,
      h2,
    )
    const rec2 = await recover(sign2.result.r, sign2.result.s, h2, dkgAddress)
    assert(rec2.ok, "post-refresh sign recovers DKG address over real /mpc", dkgAddress)

    const failures = checks.filter((c) => !c.ok)
    return {
      pass: failures.length === 0,
      keyId: dkg.keyId,
      dkgAddress,
      dkgPubkey,
      checks,
      failures,
    }
  } finally {
    await client.close()
  }
}

run()
  .then((result) => {
    window.__MPC_E2E_RESULT__ = result
  })
  .catch((err: unknown) => {
    const reason =
      err && typeof err === "object" && "reason" in err
        ? ` [reason=${(err as { reason: string }).reason}]`
        : ""
    window.__MPC_E2E_RESULT__ = {
      pass: false,
      error:
        (err instanceof Error ? err.message + reason + "\n" + err.stack : String(err)),
    }
  })
