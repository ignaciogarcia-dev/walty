/**
 * ============================================================================
 * HD-under-MPC de-risking spike (Fase 3 d-multi gate)
 * ============================================================================
 *
 * Question: can the owner's SINGLE DKLS23 MPC key produce per-cashier CHILD
 * addresses via the SignSession `chain_path` (m/0, m/1, ...), so each cashier
 * gets a distinct receiving address while staying keyless and the owner signs
 * refunds from any child via the MPC quorum?
 *
 * We don't know a child address a priori (Keyshare exposes no chain code), so we
 * RECOVER it from signatures: sign two different hashes at path m/i, take the
 * candidate pubkeys (both yParities) of each, and intersect — the child pubkey is
 * the one consistent across both signatures.
 *
 * Node-only, all 3 parties in one process. Mirrors mpc-dkls-spike.ts.
 * ============================================================================
 */

import {
  KeygenSession,
  Keyshare,
  Message,
  SignSession,
} from "@silencelaboratories/dkls-wasm-ll-node"
import { recoverPublicKey, keccak256, toHex, type Hex } from "viem"
import { publicKeyToAddress } from "viem/utils"

const SECP256K1_N =
  0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n
const HALF_N = SECP256K1_N / 2n

let failures = 0
function assert(cond: boolean, label: string, extra?: string) {
  console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${extra ? "  — " + extra : ""}`)
  if (!cond) failures++
}
function section(n: number, title: string) {
  console.log(`\n=== Assertion ${n}: ${title} ===`)
}

function filterMessages(msgs: Message[], party: number): Message[] {
  return msgs.filter((m) => m.from_id !== party).map((m) => m.clone())
}
function selectMessages(msgs: Message[], party: number): Message[] {
  return msgs.filter((m) => m.to_id === party).map((m) => m.clone())
}

function runDkg(n: number, t: number): Keyshare[] {
  const parties: KeygenSession[] = []
  for (let i = 0; i < n; i++) parties.push(new KeygenSession(n, t, i))
  const msg1 = parties.map((p) => p.createFirstMessage())
  const msg2 = parties.flatMap((p, pid) => p.handleMessages(filterMessages(msg1, pid)))
  const commitments = parties.map((p) => p.calculateChainCodeCommitment())
  const msg3 = parties.flatMap((p, pid) => p.handleMessages(selectMessages(msg2, pid)))
  const msg4 = parties.flatMap((p, pid) =>
    p.handleMessages(selectMessages(msg3, pid), commitments),
  )
  parties.forEach((p, pid) => p.handleMessages(filterMessages(msg4, pid)))
  return parties.map((p) => p.keyshare())
}

/** Distributed sign over a quorum at a BIP32-ish chain path. Returns [R,S]. */
function runSign(
  quorum: Keyshare[],
  hash: Uint8Array,
  path: string,
): { r: Uint8Array; s: Uint8Array } {
  const ids = quorum.map((ks) => ks.partyId)
  const parties = quorum.map((ks) => new SignSession(ks, path))
  const msg1 = parties.map((p) => p.createFirstMessage())
  const msg2 = parties.flatMap((p, i) => p.handleMessages(filterMessages(msg1, ids[i])))
  const msg3 = parties.flatMap((p, i) => p.handleMessages(selectMessages(msg2, ids[i])))
  parties.forEach((p, i) => p.handleMessages(selectMessages(msg3, ids[i])))
  const msg4 = parties.map((p) => p.lastMessage(hash))
  const sigs = parties.map((p, i) => p.combine(filterMessages(msg4, ids[i])))
  const [R, S] = sigs[0] as [Uint8Array, Uint8Array]
  return { r: R, s: S }
}

function cloneShare(ks: Keyshare): Keyshare {
  return Keyshare.fromBytes(ks.toBytes())
}
function u8ToHex(u: Uint8Array): Hex {
  return ("0x" + Array.from(u).map((b) => b.toString(16).padStart(2, "0")).join("")) as Hex
}
function bytesToBig(u: Uint8Array): bigint {
  return BigInt(u8ToHex(u))
}

const P = 0xfffffffffffffffffffffffffffffffffffffffffffffffffffffffefffffc2fn
function modPow(base: bigint, exp: bigint, mod: bigint): bigint {
  let r = 1n
  base %= mod
  while (exp > 0n) {
    if (exp & 1n) r = (r * base) % mod
    exp >>= 1n
    base = (base * base) % mod
  }
  return r
}
function decompressPubkey(compressed: Uint8Array): Hex {
  const x = bytesToBig(compressed.slice(1))
  const ySq = (modPow(x, 3n, P) + 7n) % P
  let y = modPow(ySq, (P + 1n) / 4n, P)
  if ((y & 1n) !== (compressed[0] === 0x03 ? 1n : 0n)) y = P - y
  return ("0x04" + x.toString(16).padStart(64, "0") + y.toString(16).padStart(64, "0")) as Hex
}

function hashOf(msg: string): { hex: Hex; bytes: Uint8Array } {
  const hex = keccak256(toHex(msg))
  const bytes = Uint8Array.from((hex.slice(2).match(/.{2}/g) as string[]).map((h) => parseInt(h, 16)))
  return { hex, bytes }
}

/** Candidate signer pubkeys (both yParities) for a low-s-normalized sig. */
async function candidatePubkeys(r: Uint8Array, s: Uint8Array, hash: Hex): Promise<Set<string>> {
  let sBig = bytesToBig(s)
  if (sBig > HALF_N) sBig = SECP256K1_N - sBig
  const rHex = u8ToHex(r)
  const sHex = ("0x" + sBig.toString(16).padStart(64, "0")) as Hex
  const out = new Set<string>()
  for (const yParity of [0, 1] as const) {
    try {
      out.add(await recoverPublicKey({ hash, signature: { r: rHex, s: sHex, yParity } }))
    } catch {
      /* skip */
    }
  }
  return out
}

/**
 * Recover the address a quorum signs under at `path`, with no prior knowledge of
 * it: sign two hashes, intersect the candidate pubkeys. The consistent one is the
 * child pubkey.
 */
async function deriveAddressViaSign(shares: Keyshare[], path: string): Promise<string> {
  const h1 = hashOf("hd-spike-msg-1")
  const h2 = hashOf("hd-spike-msg-2")
  const sig1 = runSign(shares.map(cloneShare), h1.bytes, path)
  const sig2 = runSign(shares.map(cloneShare), h2.bytes, path)
  const set1 = await candidatePubkeys(sig1.r, sig1.s, h1.hex)
  const set2 = await candidatePubkeys(sig2.r, sig2.s, h2.hex)
  const common = [...set1].filter((p) => set2.has(p))
  if (common.length !== 1) {
    throw new Error(`ambiguous child pubkey (${common.length} candidates) for path ${path}`)
  }
  return publicKeyToAddress(common[0] as Hex)
}

async function main() {
  console.log("HD-under-MPC spike — @silencelaboratories/dkls-wasm-ll-node@1.2.0\n")

  const shares = runDkg(3, 2)
  const masterAddr = publicKeyToAddress(decompressPubkey(shares[0].publicKey))
  const deviceServer = () => [cloneShare(shares[0]), cloneShare(shares[1])]
  const serverBackup = () => [cloneShare(shares[1]), cloneShare(shares[2])]
  console.log(`  DKG master address: ${masterAddr}`)

  // Sanity: our sign-and-recover method reproduces the master address at "m".
  section(0, 'sign-and-recover at "m" reproduces the DKG master address')
  let masterViaSign = ""
  try {
    masterViaSign = await deriveAddressViaSign(deviceServer(), "m")
    assert(masterViaSign.toLowerCase() === masterAddr.toLowerCase(),
      "recover method is sound at master path", masterViaSign)
  } catch (e) {
    assert(false, "sign at master path", (e as Error).message)
  }

  // 1 + 2: child-path sign completes and recovers a CHILD address != master.
  section(1, 'sign at "m/0" completes and recovers a child address != master')
  let child0 = ""
  try {
    child0 = await deriveAddressViaSign(deviceServer(), "m/0")
    assert(!!child0 && child0 !== masterAddr, "m/0 -> distinct child address", child0)
  } catch (e) {
    assert(false, 'sign at "m/0" completed', (e as Error).message)
  }

  // 3: deterministic across quorums (device+server vs server+backup).
  section(3, '"m/0" recovers the SAME child address for device+server and server+backup')
  if (child0) {
    try {
      const child0sb = await deriveAddressViaSign(serverBackup(), "m/0")
      assert(child0sb.toLowerCase() === child0.toLowerCase(),
        "m/0 child address is quorum-independent (recovery works)", child0sb)
    } catch (e) {
      assert(false, "m/0 via server+backup", (e as Error).message)
    }
  } else {
    assert(false, "skipped — m/0 did not derive")
  }

  // 4: distinct + stable children.
  section(4, "m/0, m/1, m/2 are distinct, and re-deriving m/1 is stable")
  try {
    const c1a = await deriveAddressViaSign(deviceServer(), "m/1")
    const c2 = await deriveAddressViaSign(deviceServer(), "m/2")
    const c1b = await deriveAddressViaSign(deviceServer(), "m/1")
    const distinct = new Set([child0, c1a, c2, masterAddr].map((a) => a.toLowerCase())).size === 4
    assert(distinct, "master, m/0, m/1, m/2 are 4 distinct addresses", `${c1a}, ${c2}`)
    assert(c1a.toLowerCase() === c1b.toLowerCase(), "m/1 is stable across re-derivation", c1b)
  } catch (e) {
    assert(false, "distinct/stable children", (e as Error).message)
  }

  // 5: offline-derivability probe — does the lib expose a chain code / child pubkey?
  section(5, "offline-derivability probe (chain code exposure)")
  const ksProps = new Set<string>()
  for (const k of Object.getOwnPropertyNames(Object.getPrototypeOf(shares[0]))) ksProps.add(k)
  for (const k of Object.keys(shares[0] as object)) ksProps.add(k)
  const chainCodeKey = [...ksProps].find((k) => /chain.?code|chaincode|cc\b/i.test(k))
  console.log(`  Keyshare members: ${[...ksProps].join(", ")}`)
  if (chainCodeKey) {
    assert(true, `Keyshare exposes a chain code ('${chainCodeKey}') → offline derivation possible`)
  } else {
    // Not a failure — just records the architecture verdict.
    console.log("  VERDICT: no chain code exposed → child addresses are CEREMONY-DERIVED")
    console.log("  (learn each cashier's address by signing once at m/i, then store it).")
    assert(true, "probe recorded (ceremony-derived model)")
  }

  // 6: path-format probe (nested + hardened). Non-fatal — informational.
  section(6, "path-format probe (informational)")
  for (const p of ["m/0/1", "m/0'", "m/2147483647"]) {
    try {
      await deriveAddressViaSign(deviceServer(), p)
      console.log(`  accepted: "${p}"`)
    } catch (e) {
      console.log(`  rejected: "${p}"  — ${(e as Error).message?.slice(0, 60)}`)
    }
  }

  shares.forEach((s) => s.free())

  console.log("\n========================================")
  console.log(failures === 0 ? "RESULT: ALL ASSERTIONS PASS" : `RESULT: ${failures} ASSERTION(S) FAILED`)
  console.log("========================================")
  process.exit(failures === 0 ? 0 : 1)
}

main().catch((e) => {
  console.error("\nSPIKE CRASHED:", e)
  process.exit(1)
})
