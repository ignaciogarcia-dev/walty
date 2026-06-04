// apps/web/lib/mpc/mpcClient.ts
//
// Browser CLIENT driver for the /mpc socket.io namespace. It glues together:
//   - the device-side engine (MpcDeviceParty) running inside a Web Worker
//     (lib/mpc/mpcWorker.ts) — this is where the device(0)+backup(2) parties
//     and all WASM live; and
//   - the server ceremony orchestrator reachable over socket.io at /mpc
//     (apps/api/src/ws/mpc.ts + services/mpc/ceremony.ts) — the server(1) party.
//
// Protocol recap (the only events this driver speaks):
//   client → "ceremony:start"  { ceremonyType, keyId?, signHash? }
//   server → "ceremony:started" { ceremonyId, keyId, outbound, expiresAt }
//   client → "ceremony:round"  MpcRoundMessage (ceremonyId/keyId/round/sequence/…)
//   server → "ceremony:message" { ceremonyId, outbound, done, keyId?, signature?, expiresAt }
//   client → "ceremony:abort"  { ceremonyId, keyId, reason }
//   server → "ceremony:error"  { ceremonyId?, reason, message }
//   server → "ceremony:aborted" { ceremonyId }
//
// Round/sequence model. The server kicks off by emitting its FIRST outbound
// bundle (server round-1 broadcast) in "ceremony:started". The device's
// start*() likewise produces the device+backup round-1 broadcasts. The two
// sides then advance in lock-step, each consuming the counterpart's bundle from
// the SAME round:
//
//   • the device consumes the server's *previous* outbound bundle and emits its
//     *next* outbound bundle;
//   • the client posts that device bundle to the server as the next
//     "ceremony:round" and receives the server's *next* outbound bundle.
//
// Concretely, with `serverOut` seeded from "ceremony:started".outbound and
// `deviceOut` seeded from the worker's start bundle:
//
//   round r (r = 1..N):
//     1. send ceremony:round{ round: r, sequence: r, payload: deviceOut }
//        → receive ceremony:message{ outbound: nextServerOut, done, … }
//     2. feed the device the PRIOR serverOut → deviceOut' / device result
//     3. serverOut := nextServerOut
//
// We feed the device the server bundle from the round it has not yet seen. The
// very first device round consumes "ceremony:started".outbound (server r1); the
// last consumes the terminal server bundle. The loop ends when the device
// signals `done` (it produces the DKG/refresh result or the signature locally).
//
// This module imports the production worker via `new Worker(new URL(...))` so a
// bundler (Next/Turbopack OR the esbuild e2e harness) emits the worker chunk +
// its wasm asset. The worker never logs payloads/shares; neither does this.

import { io, type Socket } from "socket.io-client"
import type {
  DkgResult,
  RefreshResult,
  SignResult,
} from "./MpcDeviceParty"

// ---------------------------------------------------------------------------
// Public options / results
// ---------------------------------------------------------------------------

export interface MpcClientOptions {
  /** Base URL of the API server (e.g. "http://127.0.0.1:4000"). */
  apiUrl: string
  /**
   * Session token for the /mpc handshake. Sent as a Bearer token in the
   * socket.io `auth` + an Authorization header (the namespace accepts either a
   * `token` cookie or a `Bearer` Authorization header — see ws/io.ts). When the
   * browser already holds an httpOnly `token` cookie for the API origin you may
   * omit this and rely on `withCredentials`.
   */
  token?: string
  /**
   * Factory that creates the device Web Worker. Defaults to instantiating
   * lib/mpc/mpcWorker.ts via `new Worker(new URL(...))`. The e2e harness
   * overrides this to point at its esbuild-bundled worker on a plain origin.
   */
  createWorker?: () => Worker
  /** Optional explicit wasm asset URL forwarded to the worker `init`. */
  wasmUrl?: string
  /** Per-step timeout (ms) waiting for a server "ceremony:message". */
  stepTimeoutMs?: number
  /** Connection timeout (ms). */
  connectTimeoutMs?: number
}

export interface DkgCeremonyResult {
  keyId: string
  result: DkgResult
}

export interface RefreshCeremonyResult {
  keyId: string
  result: RefreshResult
}

export interface SignCeremonyResult {
  keyId: string
  result: SignResult
  /** The assembled signature the SERVER returned, if any (sign only). */
  serverSignature?: { r: `0x${string}`; s: `0x${string}`; yParity: 0 | 1 }
}

// ---------------------------------------------------------------------------
// Worker RPC plumbing
// ---------------------------------------------------------------------------

interface WorkerReply {
  id: number
  type: "ready" | "outbound" | "result" | "error"
  outboundBundle?: string
  result?: DkgResult | RefreshResult | SignResult
  error?: string
}

class WorkerChannel {
  private worker: Worker
  private nextId = 1
  private pending = new Map<
    number,
    { resolve: (v: WorkerReply) => void; reject: (e: Error) => void }
  >()

  constructor(worker: Worker) {
    this.worker = worker
    this.worker.onmessage = (e: MessageEvent<WorkerReply>) => {
      const reply = e.data
      const p = this.pending.get(reply.id)
      if (!p) return
      this.pending.delete(reply.id)
      if (reply.type === "error") p.reject(new Error(reply.error ?? "worker error"))
      else p.resolve(reply)
    }
    this.worker.onerror = (e: ErrorEvent) => {
      const err = new Error("worker crashed: " + e.message)
      for (const [, p] of this.pending) p.reject(err)
      this.pending.clear()
    }
  }

  call(msg: Record<string, unknown>): Promise<WorkerReply> {
    const id = this.nextId++
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
      this.worker.postMessage({ ...msg, id })
    })
  }

  terminate(): void {
    try {
      this.worker.terminate()
    } catch {
      /* best effort */
    }
  }
}

// ---------------------------------------------------------------------------
// Default worker factory — bundler-resolved worker URL.
// ---------------------------------------------------------------------------

function defaultCreateWorker(): Worker {
  // Under Next/Turbopack this form makes the bundler emit the worker chunk and
  // its wasm asset. The esbuild e2e harness overrides createWorker instead.
  return new Worker(new URL("./mpcWorker.ts", import.meta.url), {
    type: "module",
  })
}

// ---------------------------------------------------------------------------
// Server message shapes (subset we consume)
// ---------------------------------------------------------------------------

interface CeremonyStarted {
  ceremonyId: string
  keyId: string
  outbound: string
  expiresAt: number
}

interface CeremonyMessage {
  ceremonyId: string
  outbound: string
  done: boolean
  keyId?: string
  signature?: { r: `0x${string}`; s: `0x${string}`; yParity: 0 | 1 }
  expiresAt: number
}

interface CeremonyError {
  ceremonyId?: string
  reason: string
  message: string
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function isUuid(s: string): boolean {
  return UUID_RE.test(s)
}

function randomUuid(): string {
  // Available in browsers (secure context) and Node 19+.
  return crypto.randomUUID()
}

const SIGN_HASH_RE = /^0x[0-9a-fA-F]{64}$/

/**
 * Decode a 0x-prefixed 32-byte sign hash into its raw bytes. This is the ONLY
 * place the device-party hash is derived, so the device and the server (which
 * signs the bytes of the same `signHash`) provably sign identical 32 bytes.
 */
function hashBytesFromSignHash(signHash: `0x${string}`): Uint8Array {
  if (!SIGN_HASH_RE.test(signHash)) {
    throw new MpcClientError(
      "invalid_sign_hash",
      "signHash must be 0x-prefixed 32-byte (64 hex) hash",
    )
  }
  const hex = signHash.slice(2)
  const out = new Uint8Array(32)
  for (let i = 0; i < 32; i++) {
    out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  }
  return out
}

export class MpcClientError extends Error {
  reason: string
  constructor(reason: string, message: string) {
    super(message)
    this.name = "MpcClientError"
    this.reason = reason
  }
}

// ---------------------------------------------------------------------------
// MpcClient — one instance manages one socket; runs ceremonies sequentially.
// ---------------------------------------------------------------------------

const DEFAULT_STEP_TIMEOUT_MS = 30_000
const DEFAULT_CONNECT_TIMEOUT_MS = 15_000

export class MpcClient {
  private readonly opts: Required<
    Pick<MpcClientOptions, "apiUrl" | "stepTimeoutMs" | "connectTimeoutMs">
  > &
    MpcClientOptions
  private socket: Socket | null = null
  private channel: WorkerChannel | null = null
  private workerReady = false

  constructor(options: MpcClientOptions) {
    this.opts = {
      stepTimeoutMs: DEFAULT_STEP_TIMEOUT_MS,
      connectTimeoutMs: DEFAULT_CONNECT_TIMEOUT_MS,
      ...options,
    }
  }

  // ---- lifecycle ---------------------------------------------------------

  /** Open the socket.io /mpc connection and init the device worker. */
  async connect(): Promise<void> {
    if (this.socket && this.socket.connected) return
    await Promise.all([this.connectSocket(), this.startWorker()])
  }

  private connectSocket(): Promise<void> {
    const url = this.opts.apiUrl.replace(/\/$/, "") + "/mpc"
    const token = this.opts.token
    const socket = io(url, {
      transports: ["websocket"],
      forceNew: true,
      withCredentials: true,
      // The namespace reads a `token` cookie or a `Bearer` Authorization
      // header. socket.io-client's `auth` is delivered in the handshake but the
      // server middleware inspects headers, so we also pass extraHeaders when a
      // token is supplied (works in node; browsers ignore extraHeaders on WS
      // and fall back to the cookie via withCredentials).
      auth: token ? { token } : undefined,
      extraHeaders: token ? { Authorization: `Bearer ${token}` } : undefined,
    })
    this.socket = socket

    return new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        cleanup()
        reject(new MpcClientError("connect_timeout", "socket connect timed out"))
      }, this.opts.connectTimeoutMs)
      const onConnect = () => {
        cleanup()
        resolve()
      }
      const onError = (err: Error) => {
        cleanup()
        reject(new MpcClientError("connect_error", err.message))
      }
      const cleanup = () => {
        clearTimeout(timer)
        socket.off("connect", onConnect)
        socket.off("connect_error", onError)
      }
      socket.on("connect", onConnect)
      socket.on("connect_error", onError)
    })
  }

  private async startWorker(): Promise<void> {
    if (this.workerReady) return
    const worker = (this.opts.createWorker ?? defaultCreateWorker)()
    this.channel = new WorkerChannel(worker)
    await this.channel.call({ type: "init", wasmUrl: this.opts.wasmUrl })
    this.workerReady = true
  }

  /** Close the socket and terminate the worker. Idempotent. */
  async close(): Promise<void> {
    if (this.socket) {
      this.socket.removeAllListeners()
      this.socket.disconnect()
      this.socket = null
    }
    if (this.channel) {
      this.channel.terminate()
      this.channel = null
    }
    this.workerReady = false
  }

  // ---- ceremonies --------------------------------------------------------

  /** Run a full DKG. Resolves with the new keyId + the device-side result. */
  async runDkg(): Promise<DkgCeremonyResult> {
    const deviceStart = await this.startDevice({ type: "start", ceremony: "dkg" })
    const out = await this.runCeremony("dkg", undefined, undefined, deviceStart)
    return { keyId: out.keyId, result: out.result as DkgResult }
  }

  /**
   * Run a key refresh against an existing keyId, supplying the current device
   * and backup share bytes (the WASM lives in the worker).
   */
  async runRefresh(
    keyId: string,
    deviceShareBytes: Uint8Array,
    backupShareBytes: Uint8Array,
  ): Promise<RefreshCeremonyResult> {
    const deviceStart = await this.startDevice({
      type: "start",
      ceremony: "refresh",
      deviceShareBytes,
      backupShareBytes,
    })
    const out = await this.runCeremony("refresh", keyId, undefined, deviceStart)
    return { keyId: out.keyId, result: out.result as RefreshResult }
  }

  /**
   * Run a device(0)+server(1) sign under `keyId`.
   *
   * `signHash` (0x-prefixed, exactly 32 bytes / 64 hex chars) is the SINGLE
   * source of truth for what gets signed. The server signs the bytes of this
   * value (the ceremony is bound to it via `ceremony:start.signHash`), and the
   * device party here signs the SAME 32 bytes — derived from `signHash` by
   * construction, never passed independently. The server's
   * recoverAddress == address check remains the backstop, but device and server
   * now provably sign the identical hash.
   */
  async runSign(
    keyId: string,
    deviceShareBytes: Uint8Array,
    signHash: `0x${string}`,
  ): Promise<SignCeremonyResult> {
    const hash = hashBytesFromSignHash(signHash)
    const deviceStart = await this.startDevice({
      type: "start",
      ceremony: "sign",
      deviceShareBytes,
      hash,
    })
    const out = await this.runCeremony("sign", keyId, signHash, deviceStart)
    return {
      keyId: out.keyId,
      result: out.result as SignResult,
      serverSignature: out.serverSignature,
    }
  }

  // ---- internals ---------------------------------------------------------

  private async startDevice(msg: Record<string, unknown>): Promise<string> {
    if (!this.channel) throw new MpcClientError("not_connected", "worker not started")
    const reply = await this.channel.call(msg)
    if (reply.type !== "outbound" || reply.outboundBundle === undefined) {
      throw new MpcClientError("worker_error", "device start did not return a bundle")
    }
    return reply.outboundBundle
  }

  private deviceRound(
    serverBundle: string,
  ): Promise<{ outboundBundle: string; done: boolean; result?: DkgResult | RefreshResult | SignResult }> {
    if (!this.channel) throw new MpcClientError("not_connected", "worker not started")
    return this.channel
      .call({ type: "round", serverBundle })
      .then((reply) => ({
        outboundBundle: reply.outboundBundle ?? "",
        done: reply.type === "result",
        result: reply.result,
      }))
  }

  /**
   * Core lock-step driver shared by DKG / refresh / sign. `deviceStart` is the
   * worker's first outbound bundle. Returns the device-side result plus the
   * server-assigned keyId (and server signature for sign).
   */
  private async runCeremony(
    ceremonyType: "dkg" | "sign" | "refresh",
    keyId: string | undefined,
    signHash: `0x${string}` | undefined,
    deviceStart: string,
  ): Promise<{
    keyId: string
    result: DkgResult | RefreshResult | SignResult
    serverSignature?: { r: `0x${string}`; s: `0x${string}`; yParity: 0 | 1 }
  }> {
    const socket = this.socket
    if (!socket || !socket.connected) {
      throw new MpcClientError("not_connected", "socket not connected")
    }

    // 1) start the server ceremony and capture its first outbound bundle.
    const started = await this.startServerCeremony(ceremonyType, keyId, signHash)
    const ceremonyId = started.ceremonyId
    // Round messages must carry a STABLE keyId (uuid). For sign/refresh this is
    // the bound keyId. For DKG the real keyId is only assigned at completion, so
    // the client picks a placeholder uuid that the server pins from round 1
    // (Ceremony.guard) and requires to stay constant for the ceremony.
    const wireKeyId =
      keyId ??
      (started.keyId && isUuid(started.keyId) ? started.keyId : randomUuid())

    let serverOut = started.outbound // server's prior-round outbound (feeds device)
    let deviceOut = deviceStart // device's current outbound (sent to server)
    let serverSignature:
      | { r: `0x${string}`; s: `0x${string}`; yParity: 0 | 1 }
      | undefined
    let resolvedKeyId = keyId ?? wireKeyId
    let deviceResult: DkgResult | RefreshResult | SignResult | undefined

    // Safety bound: DKG/refresh take 4 server rounds, sign takes 4. Allow a
    // generous ceiling to surface protocol stalls rather than hang.
    const MAX_ROUNDS = 8
    let round = 1
    let serverDone = false

    while (!deviceResult) {
      if (round > MAX_ROUNDS) {
        throw new MpcClientError("stalled", `ceremony exceeded ${MAX_ROUNDS} rounds`)
      }

      // (a) advance the SERVER one round with the device's current bundle,
      //     unless the server already finalised (device may need one more
      //     local round to combine its own signature/share).
      let nextServerOut = serverOut
      if (!serverDone) {
        const msg = await this.sendRound(socket, {
          ceremonyId,
          keyId: wireKeyId,
          ceremonyType,
          round,
          sequence: round,
          payload: deviceOut,
        })
        nextServerOut = msg.outbound
        if (msg.keyId) resolvedKeyId = msg.keyId
        if (msg.signature) serverSignature = msg.signature
        serverDone = msg.done
      }

      // (b) feed the device the server's PRIOR outbound bundle; it emits its
      //     next bundle (to relay next round) or the terminal result.
      const dev = await this.deviceRound(serverOut)
      deviceOut = dev.outboundBundle
      if (dev.done) {
        deviceResult = dev.result
        break
      }

      // (c) shift: next round the device consumes the bundle we just received.
      serverOut = nextServerOut
      round += 1
    }

    if (!deviceResult) {
      throw new MpcClientError("internal", "ceremony ended without a device result")
    }

    return { keyId: resolvedKeyId, result: deviceResult, serverSignature }
  }

  private startServerCeremony(
    ceremonyType: "dkg" | "sign" | "refresh",
    keyId: string | undefined,
    signHash: `0x${string}` | undefined,
  ): Promise<CeremonyStarted> {
    const socket = this.socket!
    return new Promise<CeremonyStarted>((resolve, reject) => {
      const timer = setTimeout(() => {
        cleanup()
        reject(new MpcClientError("timeout", "ceremony:start timed out"))
      }, this.opts.stepTimeoutMs)
      const onStarted = (payload: CeremonyStarted) => {
        cleanup()
        resolve(payload)
      }
      const onError = (err: CeremonyError) => {
        cleanup()
        reject(new MpcClientError(err.reason, err.message))
      }
      const cleanup = () => {
        clearTimeout(timer)
        socket.off("ceremony:started", onStarted)
        socket.off("ceremony:error", onError)
      }
      socket.once("ceremony:started", onStarted)
      socket.once("ceremony:error", onError)
      socket.emit("ceremony:start", {
        ceremonyType,
        ...(keyId ? { keyId } : {}),
        ...(signHash ? { signHash } : {}),
      })
    })
  }

  private sendRound(
    socket: Socket,
    msg: {
      ceremonyId: string
      keyId: string
      ceremonyType: "dkg" | "sign" | "refresh"
      round: number
      sequence: number
      payload: string
    },
  ): Promise<CeremonyMessage> {
    return new Promise<CeremonyMessage>((resolve, reject) => {
      const timer = setTimeout(() => {
        cleanup()
        reject(new MpcClientError("timeout", `round ${msg.round} timed out`))
      }, this.opts.stepTimeoutMs)
      const onMessage = (payload: CeremonyMessage) => {
        if (payload.ceremonyId !== msg.ceremonyId) return
        cleanup()
        resolve(payload)
      }
      const onError = (err: CeremonyError) => {
        if (err.ceremonyId && err.ceremonyId !== msg.ceremonyId) return
        cleanup()
        reject(new MpcClientError(err.reason, err.message))
      }
      const onAborted = (payload: { ceremonyId: string }) => {
        if (payload.ceremonyId !== msg.ceremonyId) return
        cleanup()
        reject(new MpcClientError("aborted", "ceremony aborted"))
      }
      const cleanup = () => {
        clearTimeout(timer)
        socket.off("ceremony:message", onMessage)
        socket.off("ceremony:error", onError)
        socket.off("ceremony:aborted", onAborted)
      }
      socket.on("ceremony:message", onMessage)
      socket.on("ceremony:error", onError)
      socket.on("ceremony:aborted", onAborted)
      socket.emit("ceremony:round", {
        ceremonyId: msg.ceremonyId,
        keyId: msg.keyId,
        ceremonyType: msg.ceremonyType,
        // partyId is required by the schema; the device is party 0.
        partyId: 0,
        round: msg.round,
        sequence: msg.sequence,
        expiresAt: Date.now() + this.opts.stepTimeoutMs,
        payload: msg.payload,
      })
    })
  }
}
