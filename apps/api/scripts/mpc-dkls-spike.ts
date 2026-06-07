/**
 * ============================================================================
 * Silence Labs DKLS23 (threshold-ECDSA MPC) — exploratory de-risk spike
 * ============================================================================
 *
 * Goal: prove a real 2-of-3 keygen / sign / refresh lifecycle in Node, all 3
 * parties simulated in ONE process, and lock the exact low-level API before we
 * build the production engine.
 *
 * Walty share model (2-of-3):
 *   party 0 = device  (browser)
 *   party 1 = server  (our API)
 *   party 2 = backup  (offline)
 * Normal signing = device+server (0,1); recovery = server+backup (1,2).
 *
 * Package: @silencelaboratories/dkls-wasm-ll-node @ 1.2.0
 *   (low-level WASM, message-passing rounds — the approved "-ll" approach).
 *   NOTE: a higher-level "silent-shard" SDK exists in the SL ecosystem; we
 *   deliberately use the low-level -ll package here as instructed.
 *
 * ---------------------------------------------------------------------------
 * EXACT LOW-LEVEL API (captured from dkls-wasm-ll-node.d.ts @ 1.2.0)
 * ---------------------------------------------------------------------------
 * WASM init:
 *   - NODE build self-initializes SYNCHRONOUSLY at require/import time
 *     (`new WebAssembly.Module(readFileSync(...))` + `new WebAssembly.Instance`).
 *     No async init() call required. (The -web build differs — see threading note.)
 *
 * class Message {
 *   constructor(payload: Uint8Array, from: number, to?: number)
 *   from_id: number          // mutable source party id
 *   to_id?: number           // dest party id, or undefined => broadcast
 *   readonly payload: Uint8Array
 *   clone(): Message
 *   free(): void
 * }
 *
 * class KeygenSession {                         // Distributed Key Generation
 *   constructor(participants, threshold, party_id, seed?)
 *   createFirstMessage(): Message
 *   handleMessages(msgs: Message[], commitments?: any[], seed?): Message[]
 *   calculateChainCodeCommitment(): Uint8Array  // computed after round-1 handle
 *   keyshare(): Keyshare                         // consumes+frees the session
 *   error(): Error | undefined
 *   toBytes(): Uint8Array / static fromBytes(bytes): KeygenSession
 *   // refresh / recovery entry points:
 *   static initKeyRotation(oldshare: Keyshare, seed?): KeygenSession
 *   static initKeyRecovery(oldshare, lost_shares, seed?): KeygenSession
 *   static initLostShareRecovery(participants, threshold, party_id, pk, lost_shares, seed?)
 *   free(): void
 * }
 *
 * class Keyshare {
 *   readonly participants: number
 *   readonly threshold: number
 *   readonly partyId: number
 *   readonly publicKey: Uint8Array     // 33-byte compressed secp256k1 point
 *   toBytes(): Uint8Array / static fromBytes(bytes): Keyshare
 *   finishKeyRotation(_oldshare): void // deprecated no-op in 1.2.0
 *   free(): void
 * }
 *
 * class SignSession {                            // Distributed Signature Gen
 *   constructor(keyshare: Keyshare, chain_path: string, seed?)  // consumes keyshare? NO:
 *                                                 // README says "consumes passed keyshare"
 *   createFirstMessage(): Message
 *   handleMessages(msgs: Message[], seed?): Message[]
 *   lastMessage(message_hash: Uint8Array): Message   // binds the 32B hash to pre-sig
 *   combine(msgs: Message[]): Array<any>             // => [R: Uint8Array(32), S: Uint8Array(32)]
 *                                                    // consumes+frees the session
 *   error(): Error | undefined
 *   toBytes()/fromBytes()
 *   free(): void
 * }
 * (SignSessionOTVariant has an identical shape — OT-based variant, unused here.)
 *
 * ROUND SEQUENCING (from the package README, verbatim flow):
 *   DKG (N parties):
 *     r1 = each.createFirstMessage()                       (broadcast)
 *     r2 = each.handleMessages(filter(r1, me))             (P2P)
 *     commitments = each.calculateChainCodeCommitment()
 *     r3 = each.handleMessages(select(r2, me))             (P2P)
 *     r4 = each.handleMessages(select(r3, me), commitments)(broadcast)
 *          each.handleMessages(filter(r4, me))
 *     keyshare = each.keyshare()
 *   SIGN (T parties):
 *     r1 = each.createFirstMessage()                       (broadcast)
 *     r2 = each.handleMessages(filter(r1, me))             (P2P)
 *     r3 = each.handleMessages(select(r2, me))             (P2P)
 *          each.handleMessages(select(r3, me))
 *     r4 = each.lastMessage(hash)                          (broadcast)
 *     sig = each.combine(filter(r4, me))  => [R, S]
 *
 *   filter(msgs, me) = msgs from OTHER parties, cloned     (for broadcast input)
 *   select(msgs, me) = msgs addressed to me (to_id==me), cloned (for P2P input)
 *
 * PARTY INDEXING for 2-of-3:
 *   In SIGN, the SignSession party id is taken from the keyshare's own partyId,
 *   BUT the active signing quorum is re-mapped to a fresh contiguous [0..T-1]
 *   index space by the ORDER we place sessions in the array and route messages.
 *   i.e. for a device+server sign we build [SignSession(deviceShare), SignSession(serverShare)]
 *   and route by their array position (local index 0,1). This spike verifies
 *   empirically which indexing the runtime actually uses (see routing below).
 * ============================================================================
 */

import {
  KeygenSession,
  Keyshare,
  Message,
  SignSession,
} from "@silencelaboratories/dkls-wasm-ll-node";
import {
  recoverAddress,
  keccak256,
  toHex,
  type Hex,
} from "viem";
import { publicKeyToAddress } from "viem/utils";

// secp256k1 curve order
const SECP256K1_N =
  0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;
const HALF_N = SECP256K1_N / 2n;

let failures = 0;
function assert(cond: boolean, label: string, extra?: string) {
  if (cond) {
    console.log(`  PASS  ${label}${extra ? "  — " + extra : ""}`);
  } else {
    console.log(`  FAIL  ${label}${extra ? "  — " + extra : ""}`);
    failures++;
  }
}
function section(n: number, title: string) {
  console.log(`\n=== Assertion ${n}: ${title} ===`);
}

// ---- message routing helpers (verbatim semantics from package README) ----
function filterMessages(msgs: Message[], party: number): Message[] {
  // all messages NOT from me (broadcast inputs)
  return msgs.filter((m) => m.from_id !== party).map((m) => m.clone());
}
function selectMessages(msgs: Message[], party: number): Message[] {
  // only messages addressed to me (P2P inputs)
  return msgs.filter((m) => m.to_id === party).map((m) => m.clone());
}

// ---------------------------------------------------------------------------
// DKG over N parties / threshold T -> Keyshare[]
// ---------------------------------------------------------------------------
function runDkg(n: number, t: number): Keyshare[] {
  const parties: KeygenSession[] = [];
  for (let i = 0; i < n; i++) parties.push(new KeygenSession(n, t, i));

  const msg1 = parties.map((p) => p.createFirstMessage());
  const msg2 = parties.flatMap((p, pid) =>
    p.handleMessages(filterMessages(msg1, pid)),
  );
  const commitments = parties.map((p) => p.calculateChainCodeCommitment());
  const msg3 = parties.flatMap((p, pid) =>
    p.handleMessages(selectMessages(msg2, pid)),
  );
  const msg4 = parties.flatMap((p, pid) =>
    p.handleMessages(selectMessages(msg3, pid), commitments),
  );
  parties.forEach((p, pid) => p.handleMessages(filterMessages(msg4, pid)));

  return parties.map((p) => p.keyshare());
}

// ---------------------------------------------------------------------------
// Key refresh / rotation over an existing set of N shares -> new Keyshare[]
// Uses KeygenSession.initKeyRotation on each old share, same round flow as DKG.
// ---------------------------------------------------------------------------
function runRefresh(oldShares: Keyshare[]): Keyshare[] {
  const parties = oldShares.map((s) => KeygenSession.initKeyRotation(s));

  const msg1 = parties.map((p) => p.createFirstMessage());
  const msg2 = parties.flatMap((p, pid) =>
    p.handleMessages(filterMessages(msg1, pid)),
  );
  const commitments = parties.map((p) => p.calculateChainCodeCommitment());
  const msg3 = parties.flatMap((p, pid) =>
    p.handleMessages(selectMessages(msg2, pid)),
  );
  const msg4 = parties.flatMap((p, pid) =>
    p.handleMessages(selectMessages(msg3, pid), commitments),
  );
  parties.forEach((p, pid) => p.handleMessages(filterMessages(msg4, pid)));

  const newShares = parties.map((p) => p.keyshare());
  // finishKeyRotation is a deprecated no-op in 1.2.0 but call it for forward-compat.
  newShares.forEach((ns, i) => ns.finishKeyRotation(oldShares[i]));
  return newShares;
}

// ---------------------------------------------------------------------------
// DSG (distributed signature) over a chosen subset of shares, threshold T.
// `quorum` = array of Keyshare (length must == threshold).
//
// PARTY INDEXING (empirically verified, see report): SignSession messages carry
// `from_id` = the keyshare's REAL partyId from DKG (e.g. server=1, backup=2),
// NOT the local array position. So routing MUST use each session's real party
// id, captured from the keyshare BEFORE the SignSession consumes it. Driving by
// array index works only when the quorum happens to be ids {0,1}; for {1,2} it
// throws "Missing message". Hence we key all filter/select routing off realId.
// Returns { r, s } as 32-byte Uint8Arrays.
// NOTE: SignSession consumes the keyshare, so callers pass throwaway clones.
// ---------------------------------------------------------------------------
function runSign(
  quorum: Keyshare[],
  hash: Uint8Array,
): { r: Uint8Array; s: Uint8Array } {
  const ids = quorum.map((ks) => ks.partyId); // real party ids, before consume
  const parties = quorum.map((ks) => new SignSession(ks, "m"));

  const msg1 = parties.map((p) => p.createFirstMessage());
  const msg2 = parties.flatMap((p, i) =>
    p.handleMessages(filterMessages(msg1, ids[i])),
  );
  const msg3 = parties.flatMap((p, i) =>
    p.handleMessages(selectMessages(msg2, ids[i])),
  );
  parties.forEach((p, i) => p.handleMessages(selectMessages(msg3, ids[i])));

  const msg4 = parties.map((p) => p.lastMessage(hash));
  // every party combines; they must all yield the same signature.
  const sigs = parties.map((p, i) => p.combine(filterMessages(msg4, ids[i])));

  const [R, S] = sigs[0] as [Uint8Array, Uint8Array];
  return { r: R, s: S };
}

// clone a keyshare via serialize/deserialize so the original survives a sign
// (SignSession consumes its input keyshare).
function cloneShare(ks: Keyshare): Keyshare {
  return Keyshare.fromBytes(ks.toBytes());
}

function u8ToHex(u: Uint8Array): Hex {
  return ("0x" +
    Array.from(u)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("")) as Hex;
}
function bytesToBig(u: Uint8Array): bigint {
  return BigInt(u8ToHex(u));
}

// Compressed secp256k1 pubkey (33B) -> uncompressed (65B, 0x04||X||Y) for viem.
// We decompress by recovering Y from the curve equation y^2 = x^3 + 7 mod p.
const P =
  0xfffffffffffffffffffffffffffffffffffffffffffffffffffffffefffffc2fn;
function modPow(base: bigint, exp: bigint, mod: bigint): bigint {
  let result = 1n;
  base %= mod;
  while (exp > 0n) {
    if (exp & 1n) result = (result * base) % mod;
    exp >>= 1n;
    base = (base * base) % mod;
  }
  return result;
}
function decompressPubkey(compressed: Uint8Array): Hex {
  if (compressed.length !== 33)
    throw new Error(`expected 33-byte compressed pubkey, got ${compressed.length}`);
  const prefix = compressed[0];
  const x = bytesToBig(compressed.slice(1));
  const ySq = (modPow(x, 3n, P) + 7n) % P;
  // y = ySq^((p+1)/4) mod p   (p ≡ 3 mod 4)
  let y = modPow(ySq, (P + 1n) / 4n, P);
  const wantOdd = prefix === 0x03;
  if ((y & 1n) !== (wantOdd ? 1n : 0n)) y = P - y;
  const xHex = x.toString(16).padStart(64, "0");
  const yHex = y.toString(16).padStart(64, "0");
  return ("0x04" + xHex + yHex) as Hex;
}

// Assemble an Ethereum signature { r,s,yParity } from MPC [R,S], normalize low-s,
// and brute-force the recovery id by checking which yParity recovers `addr`.
async function assembleAndRecover(
  r: Uint8Array,
  s: Uint8Array,
  hash: Hex,
  expectedAddr: string,
): Promise<{ ok: boolean; lowS: boolean; yParity: number; recovered: string }> {
  let sBig = bytesToBig(s);
  let lowS = sBig <= HALF_N;
  // Enforce canonical low-s (EVM/EIP-2). If the MPC returned high-s, flip it.
  if (!lowS) {
    sBig = SECP256K1_N - sBig;
  }
  const finalLowS = sBig <= HALF_N;
  const rHex = u8ToHex(r);
  const sHex = ("0x" + sBig.toString(16).padStart(64, "0")) as Hex;

  for (const yParity of [0, 1] as const) {
    try {
      const recovered = await recoverAddress({
        hash,
        signature: { r: rHex, s: sHex, yParity },
      });
      if (recovered.toLowerCase() === expectedAddr.toLowerCase()) {
        return { ok: true, lowS: finalLowS, yParity, recovered };
      }
    } catch {
      /* try next parity */
    }
  }
  return { ok: false, lowS: finalLowS, yParity: -1, recovered: "" };
}

async function main() {
  console.log("DKLS23 2-of-3 MPC spike — package @silencelaboratories/dkls-wasm-ll-node@1.2.0");
  console.log("Parties: 0=device, 1=server, 2=backup. threshold=2, participants=3.\n");

  // -------------------------------------------------------------------------
  // Assertion 1 — DKG 3-party -> single combined secp256k1 pubkey + address
  // -------------------------------------------------------------------------
  section(1, "DKG 3-party completes -> single combined public key");
  const shares = runDkg(3, 2);
  assert(shares.length === 3, "DKG produced 3 keyshares");

  const pubkeys = shares.map((s) => u8ToHex(s.publicKey));
  const allSamePub = pubkeys.every((p) => p === pubkeys[0]);
  assert(allSamePub, "all 3 shares carry the SAME combined public key", pubkeys[0]);
  assert(shares[0].publicKey.length === 33, "public key is 33-byte compressed secp256k1");
  shares.forEach((s, i) =>
    assert(s.partyId === i, `share ${i} has partyId ${i} (participants=${s.participants}, threshold=${s.threshold})`),
  );

  const uncompressed = decompressPubkey(shares[0].publicKey);
  const dkgAddress = publicKeyToAddress(uncompressed);
  console.log(`  combined pubkey (compressed):   ${pubkeys[0]}`);
  console.log(`  combined pubkey (uncompressed): ${uncompressed}`);
  console.log(`  Ethereum address:               ${dkgAddress}`);

  // record share serialize/deserialize format & size
  const shareBlob = shares[1].toBytes(); // server share
  console.log(`  server keyshare serialized size: ${shareBlob.length} bytes`);
  const roundtrip = Keyshare.fromBytes(shareBlob);
  assert(
    u8ToHex(roundtrip.publicKey) === pubkeys[0],
    "keyshare toBytes()/fromBytes() round-trips (pubkey preserved)",
  );
  roundtrip.free();

  // The message to sign (32-byte keccak hash)
  const hash = keccak256(toHex("walty-mpc-spike"));
  const hashBytes = Uint8Array.from(
    (hash.slice(2).match(/.{2}/g) as string[]).map((h) => parseInt(h, 16)),
  );

  // -------------------------------------------------------------------------
  // Assertion 2 — Sign device+server (0,1) recovers to DKG address; low-s; v ok
  // -------------------------------------------------------------------------
  section(2, "Sign device+server (0,1) -> recovers DKG address, low-s, valid v");
  const sigDS = runSign([cloneShare(shares[0]), cloneShare(shares[1])], hashBytes);
  console.log(`  R: ${u8ToHex(sigDS.r)}`);
  console.log(`  S: ${u8ToHex(sigDS.s)}`);
  const recDS = await assembleAndRecover(sigDS.r, sigDS.s, hash, dkgAddress);
  assert(recDS.ok, "recoverAddress(device+server sig) === DKG address", recDS.recovered);
  assert(recDS.lowS, "signature is canonical low-s (s <= n/2)");
  assert(recDS.yParity === 0 || recDS.yParity === 1, `valid recovery id / yParity = ${recDS.yParity} (v=${recDS.yParity + 27})`);

  // -------------------------------------------------------------------------
  // Assertion 3 — Sign server+backup (1,2) recovers to DKG address (recovery path)
  // -------------------------------------------------------------------------
  section(3, "Sign server+backup (1,2) -> recovers DKG address (recovery path)");
  const sigSB = runSign([cloneShare(shares[1]), cloneShare(shares[2])], hashBytes);
  const recSB = await assembleAndRecover(sigSB.r, sigSB.s, hash, dkgAddress);
  assert(recSB.ok, "recoverAddress(server+backup sig) === DKG address", recSB.recovered);
  assert(recSB.lowS, "signature is canonical low-s");

  // -------------------------------------------------------------------------
  // Assertion 4 — single share alone cannot sign (must throw / not recover)
  // -------------------------------------------------------------------------
  section(4, "Single share cannot sign (threshold enforced)");
  let singleFailed = false;
  let singleDetail = "";
  try {
    // Drive a sign with ONLY the device share present in the quorum.
    const r = runSign([cloneShare(shares[0])], hashBytes);
    // If it somehow returns, check it does NOT recover the DKG address.
    const rec = await assembleAndRecover(r.r, r.s, hash, dkgAddress);
    singleFailed = !rec.ok;
    singleDetail = rec.ok
      ? "ERROR: single-party sign produced a recovering signature!"
      : "single-party sign produced a non-recovering signature";
  } catch (e) {
    singleFailed = true;
    singleDetail = `threw: ${(e as Error).message?.slice(0, 80)}`;
  }
  assert(singleFailed, "single share cannot produce a valid signature", singleDetail);

  // -------------------------------------------------------------------------
  // Assertion 5 — Refresh all 3 shares: pubkey/address unchanged, bytes differ
  // -------------------------------------------------------------------------
  section(5, "Refresh / re-share -> same pubkey & address, different share bytes");
  const oldBytes = shares.map((s) => s.toBytes());
  const refreshed = runRefresh(shares.map((s) => cloneShare(s)));
  const newPubs = refreshed.map((s) => u8ToHex(s.publicKey));
  assert(
    newPubs.every((p) => p === pubkeys[0]),
    "combined public key UNCHANGED after refresh",
    newPubs[0],
  );
  const refreshedUncompressed = decompressPubkey(refreshed[0].publicKey);
  const refreshedAddr = publicKeyToAddress(refreshedUncompressed);
  assert(refreshedAddr === dkgAddress, "Ethereum address UNCHANGED after refresh", refreshedAddr);

  const newBytes = refreshed.map((s) => s.toBytes());
  const allDifferent = newBytes.every((nb, i) => u8ToHex(nb) !== u8ToHex(oldBytes[i]));
  assert(allDifferent, "every refreshed share has DIFFERENT bytes from the old share");

  // -------------------------------------------------------------------------
  // Assertion 6 — Sign post-refresh device+server still recovers DKG address
  // -------------------------------------------------------------------------
  section(6, "Sign post-refresh device+server -> still recovers DKG address");
  const sigPost = runSign(
    [cloneShare(refreshed[0]), cloneShare(refreshed[1])],
    hashBytes,
  );
  const recPost = await assembleAndRecover(sigPost.r, sigPost.s, hash, dkgAddress);
  assert(recPost.ok, "post-refresh device+server sig recovers DKG address", recPost.recovered);
  assert(recPost.lowS, "post-refresh signature is canonical low-s");

  // ---- cleanup (explicit .free() per package memory rules) ----
  shares.forEach((s) => s.free());
  refreshed.forEach((s) => s.free());

  // -------------------------------------------------------------------------
  console.log("\n=== Threading / SharedArrayBuffer finding ===");
  console.log("  NODE build (-node): SINGLE-THREADED OK. The WASM self-inits");
  console.log("  synchronously at import (WebAssembly.Module/Instance over readFileSync),");
  console.log("  uses a plain non-shared linear memory (wasm.memory.buffer), and the JS");
  console.log("  glue contains NO SharedArrayBuffer / Atomics / Worker usage. No special");
  console.log("  flags needed in Node.");
  console.log("  FLAG: the browser build (@silencelaboratories/dkls-wasm-ll-web) is a");
  console.log("  SEPARATE artifact and MUST be re-verified — if it uses wasm threads it");
  console.log("  would require SharedArrayBuffer => COOP/COEP cross-origin isolation.");

  console.log("\n========================================");
  if (failures === 0) {
    console.log("RESULT: ALL ASSERTIONS PASS");
    console.log("========================================");
    process.exit(0);
  } else {
    console.log(`RESULT: ${failures} ASSERTION(S) FAILED`);
    console.log("========================================");
    process.exit(1);
  }
}

main().catch((e) => {
  console.error("\nSPIKE CRASHED:", e);
  process.exit(1);
});
