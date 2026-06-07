/**
 * ============================================================================
 * DKLS23 (-web build) browser Web Worker spike — runtime de-risk
 * ============================================================================
 *
 * Runs INSIDE a Web Worker. Mirrors the validated Node spike
 * (apps/api/scripts/mpc-dkls-spike.ts) but against the BROWSER artifact
 * `@silencelaboratories/dkls-wasm-ll-web@1.2.0`, which is a wasm-bindgen
 * *web* build and therefore requires an async `init()` that fetches the
 * `_bg.wasm` over HTTP before any class is usable.
 *
 * It answers the 6 spike objectives with real runtime evidence and posts a
 * structured result back to the page (which exposes it on
 * window.__SPIKE_RESULT__):
 *   1. WASM inits in a Worker.
 *   2. Whether SharedArrayBuffer / threading is required.
 *   3. crossOriginIsolated value (=> COOP/COEP need).
 *   4. DKG / sign / refresh timings (ms).
 *   5. toBytes/fromBytes round-trip, .free(), memory across N signs.
 *   6. Feeds the verdict (current-app vs isolated origin).
 *
 * Walty 2-of-3 share model: 0=device, 1=server, 2=backup.
 * Normal sign = device+server (0,1); recovery = server+backup (1,2).
 * ============================================================================
 */

import init, {
  KeygenSession,
  Keyshare,
  Message,
  SignSession,
} from "@silencelaboratories/dkls-wasm-ll-web";
// The wasm asset is emitted next to the bundled worker by esbuild's file loader;
// importing it yields the same-origin URL we hand to init().
import wasmUrl from "@silencelaboratories/dkls-wasm-ll-web/dkls-wasm-ll-web_bg.wasm";
import { recoverAddress, keccak256, toHex, type Hex } from "viem";
import { publicKeyToAddress } from "viem/utils";

const SECP256K1_N =
  0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;
const HALF_N = SECP256K1_N / 2n;
const P =
  0xfffffffffffffffffffffffffffffffffffffffffffffffffffffffefffffc2fn;

type Check = { label: string; ok: boolean; detail?: string };
const checks: Check[] = [];
function assert(ok: boolean, label: string, detail?: string) {
  checks.push({ ok, label, detail });
}

// ---- message routing (verbatim semantics from the package README) ----
function filterMessages(msgs: Message[], party: number): Message[] {
  return msgs.filter((m) => m.from_id !== party).map((m) => m.clone());
}
function selectMessages(msgs: Message[], party: number): Message[] {
  return msgs.filter((m) => m.to_id === party).map((m) => m.clone());
}

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
  const shares = parties.map((p) => p.keyshare());
  // free intermediate broadcast/p2p messages
  [msg1, msg2, msg3, msg4].forEach((arr) => arr.forEach((m) => m.free()));
  return shares;
}

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
  newShares.forEach((ns, i) => ns.finishKeyRotation(oldShares[i]));
  [msg1, msg2, msg3, msg4].forEach((arr) => arr.forEach((m) => m.free()));
  return newShares;
}

// quorum = clones (SignSession consumes its keyshare). Route by REAL partyId.
function runSign(
  quorum: Keyshare[],
  hash: Uint8Array,
): { r: Uint8Array; s: Uint8Array } {
  const ids = quorum.map((ks) => ks.partyId);
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
  const sigs = parties.map((p, i) => p.combine(filterMessages(msg4, ids[i])));
  const [R, S] = sigs[0] as [Uint8Array, Uint8Array];
  [msg1, msg2, msg3, msg4].forEach((arr) => arr.forEach((m) => m.free()));
  return { r: R, s: S };
}

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
  const prefix = compressed[0];
  const x = bytesToBig(compressed.slice(1));
  const ySq = (modPow(x, 3n, P) + 7n) % P;
  let y = modPow(ySq, (P + 1n) / 4n, P);
  const wantOdd = prefix === 0x03;
  if ((y & 1n) !== (wantOdd ? 1n : 0n)) y = P - y;
  const xHex = x.toString(16).padStart(64, "0");
  const yHex = y.toString(16).padStart(64, "0");
  return ("0x04" + xHex + yHex) as Hex;
}

async function assembleAndRecover(
  r: Uint8Array,
  s: Uint8Array,
  hash: Hex,
  expectedAddr: string,
): Promise<{ ok: boolean; lowS: boolean; yParity: number; recovered: string }> {
  let sBig = bytesToBig(s);
  if (sBig > HALF_N) sBig = SECP256K1_N - sBig; // EIP-2 low-s
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

function mem(): number | null {
  // performance.memory is a non-standard chromium-only API.
  const pm = (performance as unknown as { memory?: { usedJSHeapSize: number } })
    .memory;
  return pm ? pm.usedJSHeapSize : null;
}

async function run() {
  const timings: Record<string, number | number[]> = {};
  const env = {
    hasSharedArrayBuffer: typeof SharedArrayBuffer !== "undefined",
    crossOriginIsolated:
      typeof (self as unknown as { crossOriginIsolated?: boolean })
        .crossOriginIsolated === "boolean"
        ? (self as unknown as { crossOriginIsolated: boolean })
            .crossOriginIsolated
        : null,
    isWorker:
      typeof WorkerGlobalScope !== "undefined" &&
      self instanceof WorkerGlobalScope,
    wasmUrl: String(wasmUrl),
  };

  // ---- Objective 1: init WASM in the worker (async, fetch _bg.wasm) ----
  const tInit0 = performance.now();
  const initOut = (await init(wasmUrl)) as unknown as {
    memory?: WebAssembly.Memory;
  };
  timings.initMs = performance.now() - tInit0;
  assert(true, "WASM init() succeeded inside Web Worker", `${timings.initMs.toFixed(1)}ms`);
  // WASM linear memory is the meaningful "blowup" signal in a worker
  // (performance.memory / JS heap is not exposed off the main thread).
  const wasmMem = initOut.memory ?? null;
  const wasmBytes = () => (wasmMem ? wasmMem.buffer.byteLength : null);

  // ---- DKG ----
  const tDkg0 = performance.now();
  const shares = runDkg(3, 2);
  timings.dkgMs = performance.now() - tDkg0;
  assert(shares.length === 3, "DKG produced 3 keyshares");
  const pubkeys = shares.map((s) => u8ToHex(s.publicKey));
  assert(
    pubkeys.every((p) => p === pubkeys[0]),
    "all 3 shares carry the SAME combined public key",
    pubkeys[0],
  );
  assert(
    shares[0].publicKey.length === 33,
    "public key is 33-byte compressed secp256k1",
  );
  const uncompressed = decompressPubkey(shares[0].publicKey);
  const dkgAddress = publicKeyToAddress(uncompressed);

  // ---- Objective 5a: toBytes/fromBytes round-trip ----
  const blob = shares[1].toBytes();
  const rt = Keyshare.fromBytes(blob);
  assert(
    u8ToHex(rt.publicKey) === pubkeys[0],
    "keyshare toBytes()/fromBytes() round-trips (pubkey preserved)",
    `serialized ${blob.length} bytes`,
  );
  rt.free();

  const hash = keccak256(toHex("walty-mpc-web-spike"));
  const hashBytes = Uint8Array.from(
    (hash.slice(2).match(/.{2}/g) as string[]).map((h) => parseInt(h, 16)),
  );

  // ---- Sign device+server (normal path) ----
  const tSign0 = performance.now();
  const sigDS = runSign(
    [cloneShare(shares[0]), cloneShare(shares[1])],
    hashBytes,
  );
  timings.signMs = performance.now() - tSign0;
  const recDS = await assembleAndRecover(sigDS.r, sigDS.s, hash, dkgAddress);
  assert(
    recDS.ok,
    "sign device+server (0,1) recovers DKG address",
    recDS.recovered,
  );
  assert(recDS.lowS, "device+server signature is canonical low-s");
  assert(
    recDS.yParity === 0 || recDS.yParity === 1,
    `valid recovery id v=${recDS.yParity + 27}`,
  );

  // ---- Sign server+backup (recovery path) ----
  const sigSB = runSign(
    [cloneShare(shares[1]), cloneShare(shares[2])],
    hashBytes,
  );
  const recSB = await assembleAndRecover(sigSB.r, sigSB.s, hash, dkgAddress);
  assert(
    recSB.ok,
    "sign server+backup (1,2) recovers DKG address (recovery path)",
    recSB.recovered,
  );
  assert(recSB.lowS, "server+backup signature is canonical low-s");

  // ---- Refresh / key rotation ----
  const oldBytes = shares.map((s) => s.toBytes());
  const tRef0 = performance.now();
  const refreshed = runRefresh(shares.map((s) => cloneShare(s)));
  timings.refreshMs = performance.now() - tRef0;
  const newPubs = refreshed.map((s) => u8ToHex(s.publicKey));
  assert(
    newPubs.every((p) => p === pubkeys[0]),
    "combined public key UNCHANGED after refresh",
  );
  const refreshedAddr = publicKeyToAddress(
    decompressPubkey(refreshed[0].publicKey),
  );
  assert(
    refreshedAddr === dkgAddress,
    "Ethereum address UNCHANGED after refresh",
  );
  const newBytes = refreshed.map((s) => s.toBytes());
  assert(
    newBytes.every((nb, i) => u8ToHex(nb) !== u8ToHex(oldBytes[i])),
    "every refreshed share has DIFFERENT bytes from the old share",
  );

  // ---- Sign post-refresh ----
  const sigPost = runSign(
    [cloneShare(refreshed[0]), cloneShare(refreshed[1])],
    hashBytes,
  );
  const recPost = await assembleAndRecover(
    sigPost.r,
    sigPost.s,
    hash,
    dkgAddress,
  );
  assert(
    recPost.ok,
    "post-refresh device+server sign still recovers DKG address",
    recPost.recovered,
  );

  // ---- Objective 4 + 5b: N-iteration timings + memory across repeated signs ----
  const N = 10;
  const signLoopMs: number[] = [];
  const memBefore = mem();
  const wasmBytesBefore = wasmBytes();
  for (let i = 0; i < N; i++) {
    const t0 = performance.now();
    const sg = runSign(
      [cloneShare(refreshed[0]), cloneShare(refreshed[1])],
      hashBytes,
    );
    const rec = await assembleAndRecover(sg.r, sg.s, hash, dkgAddress);
    signLoopMs.push(performance.now() - t0);
    if (!rec.ok) assert(false, `loop sign #${i} failed to recover`);
  }
  const memAfter = mem();
  const wasmBytesAfter = wasmBytes();
  timings.signLoopMs = signLoopMs;
  timings.signLoopAvgMs =
    signLoopMs.reduce((a, b) => a + b, 0) / signLoopMs.length;
  assert(true, `ran ${N} signs in a loop, all recovered`);

  // extra DKG/sign/refresh iterations for stable timing samples
  const dkgSamples: number[] = [];
  const refreshSamples: number[] = [];
  for (let i = 0; i < 3; i++) {
    const a = performance.now();
    const s2 = runDkg(3, 2);
    dkgSamples.push(performance.now() - a);
    const b = performance.now();
    const r2 = runRefresh(s2.map((s) => cloneShare(s)));
    refreshSamples.push(performance.now() - b);
    s2.forEach((s) => s.free());
    r2.forEach((s) => s.free());
  }
  timings.dkgSamplesMs = dkgSamples;
  timings.refreshSamplesMs = refreshSamples;

  // ---- cleanup ----
  shares.forEach((s) => s.free());
  refreshed.forEach((s) => s.free());

  const failures = checks.filter((c) => !c.ok);
  return {
    pass: failures.length === 0,
    env,
    timings,
    dkgAddress,
    pubkey: pubkeys[0],
    memUsedJSHeapBefore: memBefore,
    memUsedJSHeapAfter: memAfter,
    memDeltaBytes:
      memBefore != null && memAfter != null ? memAfter - memBefore : null,
    wasmBytesBefore,
    wasmBytesAfter,
    wasmGrowthBytes:
      wasmBytesBefore != null && wasmBytesAfter != null
        ? wasmBytesAfter - wasmBytesBefore
        : null,
    checks,
    failures,
  };
}

run()
  .then((result) => {
    (self as unknown as Worker).postMessage({ type: "done", result });
  })
  .catch((err: unknown) => {
    (self as unknown as Worker).postMessage({
      type: "error",
      error: err instanceof Error ? err.message + "\n" + err.stack : String(err),
    });
  });
