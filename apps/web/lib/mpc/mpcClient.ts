// Browser client driver for the /mpc namespace. Bridges the device-side engine
// (MpcDeviceParty in a Web Worker, lib/mpc/mpcWorker.ts — device(0)+backup(2)
// parties + WASM) and the server ceremony orchestrator over socket.io
// (services/mpc/ceremony.ts — server(1) party).
//
// Lock-step: server seeds its round-1 bundle in "ceremony:started", the worker
// seeds the device round-1 bundle. Each round the device consumes the server's
// prior bundle and emits its next one, which the client relays via
// "ceremony:round" to get the server's next bundle. Loop ends when the device
// signals done (it produces the DKG/refresh result or signature locally).
//
// Worker imported via new Worker(new URL(...)) so the bundler (Next/Turbopack or
// the esbuild e2e harness) emits the worker chunk + its wasm asset. Neither the
// worker nor this logs payloads/shares.

import { io, type Socket } from "socket.io-client"
import type {
  DkgResult,
  RefreshResult,
  SignResult,
} from "./MpcDeviceParty"

export interface MpcClientOptions {
  /** Base URL of the API server (e.g. "http://127.0.0.1:4000"). */
  apiUrl: string
  /**
   * Session token for the /mpc handshake, sent via socket.io `auth` + an
   * Authorization header. Omit if the browser already holds the httpOnly
   * `token` cookie for the API origin (relies on `withCredentials`).
   */
  token?: string
  /**
   * Factory for the device Web Worker. Defaults to mpcWorker.ts; the e2e
   * harness overrides this to point at its esbuild-bundled worker.
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

function defaultCreateWorker(): Worker {
  // This form makes the bundler emit the worker chunk + its wasm asset. The
  // e2e harness overrides createWorker instead.
  return new Worker(new URL("./mpcWorker.ts", import.meta.url), {
    type: "module",
  })
}

// Server message shapes (subset we consume).
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
 * Decode a 0x-prefixed 32-byte sign hash to raw bytes. The only place the
 * device-party hash is derived, so device and server provably sign the same 32
 * bytes.
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

// One instance manages one socket; runs ceremonies sequentially.
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
      // Browsers can't set WS headers, so the token rides in `auth`. In node we
      // also pass extraHeaders; browsers ignore those and fall back to the
      // cookie via withCredentials.
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
   * Run a device(0)+server(1) sign under `keyId`. `signHash` (0x + 32 bytes) is
   * the single source of truth: the ceremony binds the server to it via
   * `ceremony:start.signHash`, and the device hash is derived from the same
   * value here, never passed independently — so both provably sign identical
   * bytes. The server's recoverAddress == address check is the backstop.
   */
  async runSign(
    keyId: string,
    deviceShareBytes: Uint8Array,
    signHash: `0x${string}`,
    derivationIndex = 0,
  ): Promise<SignCeremonyResult> {
    const hash = hashBytesFromSignHash(signHash)
    // HD path: 0 = owner master ("m"), i>=1 = cashier i's child ("m/i"). Device
    // and server must agree on the path, so we send the index to the ceremony
    // and the matching path to the worker.
    const path = derivationIndex > 0 ? `m/${derivationIndex}` : "m"
    const deviceStart = await this.startDevice({
      type: "start",
      ceremony: "sign",
      deviceShareBytes,
      hash,
      path,
    })
    const out = await this.runCeremony("sign", keyId, signHash, deviceStart, derivationIndex)
    return {
      keyId: out.keyId,
      result: out.result as SignResult,
      serverSignature: out.serverSignature,
    }
  }

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
   * Lock-step driver shared by DKG / refresh / sign. `deviceStart` is the
   * worker's first outbound bundle. Returns the device result plus the
   * server-assigned keyId (and server signature for sign).
   */
  private async runCeremony(
    ceremonyType: "dkg" | "sign" | "refresh",
    keyId: string | undefined,
    signHash: `0x${string}` | undefined,
    deviceStart: string,
    derivationIndex = 0,
  ): Promise<{
    keyId: string
    result: DkgResult | RefreshResult | SignResult
    serverSignature?: { r: `0x${string}`; s: `0x${string}`; yParity: 0 | 1 }
  }> {
    const socket = this.socket
    if (!socket || !socket.connected) {
      throw new MpcClientError("not_connected", "socket not connected")
    }

    const started = await this.startServerCeremony(ceremonyType, keyId, signHash, derivationIndex)
    const ceremonyId = started.ceremonyId
    // Round messages need a stable keyId. sign/refresh use the bound keyId; DKG
    // has none until completion, so pick a placeholder uuid the server pins from
    // round 1 and requires constant.
    const wireKeyId =
      keyId ??
      (started.keyId && isUuid(started.keyId) ? started.keyId : randomUuid())

    let serverOut = started.outbound // prior-round server bundle, feeds device
    let deviceOut = deviceStart // current device bundle, sent to server
    let serverSignature:
      | { r: `0x${string}`; s: `0x${string}`; yParity: 0 | 1 }
      | undefined
    let resolvedKeyId = keyId ?? wireKeyId
    let deviceResult: DkgResult | RefreshResult | SignResult | undefined

    // Ceilings real ceremonies (4 rounds) never hit; surfaces stalls vs hang.
    const MAX_ROUNDS = 8
    let round = 1
    let serverDone = false

    while (!deviceResult) {
      if (round > MAX_ROUNDS) {
        throw new MpcClientError("stalled", `ceremony exceeded ${MAX_ROUNDS} rounds`)
      }

      // (a) advance the server one round with the device's current bundle,
      //     unless it already finalised (device may need one more local round
      //     to combine its own signature/share).
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

      // (b) feed the device the server's prior bundle; it emits its next bundle
      //     (to relay next round) or the terminal result.
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
    derivationIndex = 0,
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
        ...(derivationIndex > 0 ? { derivationIndex } : {}),
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
