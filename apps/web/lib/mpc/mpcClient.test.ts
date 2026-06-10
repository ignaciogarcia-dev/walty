// Drives the MpcClient lock-step ceremony loop (runCeremony) with a fake socket
// (stands in for the server orchestrator over socket.io) and a fake worker
// (stands in for the device WASM party). Bundles are opaque strings the client
// only relays, so the protocol can be exercised end-to-end without real crypto:
// we assert round sequencing, done-handling, server-signature passthrough, and
// every failure exit (server error, abort, disconnect, timeout, stall). Also
// pins the input guards that reject before any I/O.

import { describe, it, expect, vi, beforeEach } from "vitest"

// --- socket.io-client mock: io() hands back the test's current fake socket ----
const holder = vi.hoisted(() => ({
  socket: null as null | FakeSocketLike,
  connectMode: "ok" as "ok" | "error",
}))
vi.mock("socket.io-client", () => ({
  io: vi.fn(() => {
    const s = holder.socket!
    // Simulate the async connection result on the next microtask, after the
    // client has attached its connect/connect_error listeners.
    queueMicrotask(() => {
      if (holder.connectMode === "error") {
        s.deliver("connect_error", new Error("refused"))
      } else {
        s.connected = true
        s.deliver("connect")
      }
    })
    return s
  }),
}))

import { MpcClient, MpcClientError } from "./mpcClient"

// --- fakes --------------------------------------------------------------------

interface Listener {
  fn: (payload?: unknown) => void
  once: boolean
}

type ServerHandler = (event: string, payload: unknown, socket: FakeSocketLike) => void

class FakeSocketLike {
  connected = false
  private listeners = new Map<string, Listener[]>()
  constructor(private serverHandler: ServerHandler) {}

  on(event: string, fn: (p?: unknown) => void) {
    this.add(event, fn, false)
    return this
  }
  once(event: string, fn: (p?: unknown) => void) {
    this.add(event, fn, true)
    return this
  }
  off(event: string, fn: (p?: unknown) => void) {
    const ls = this.listeners.get(event)
    if (ls) this.listeners.set(event, ls.filter((l) => l.fn !== fn))
    return this
  }
  removeAllListeners() {
    this.listeners.clear()
    return this
  }
  emit(event: string, payload?: unknown) {
    // client -> server
    this.serverHandler(event, payload, this)
    return this
  }
  disconnect() {
    this.connected = false
    this.deliver("disconnect")
    return this
  }
  // server -> client
  deliver(event: string, payload?: unknown) {
    const ls = this.listeners.get(event) ?? []
    for (const l of [...ls]) {
      if (l.once) this.off(event, l.fn)
      l.fn(payload)
    }
  }
  private add(event: string, fn: (p?: unknown) => void, once: boolean) {
    const ls = this.listeners.get(event) ?? []
    ls.push({ fn, once })
    this.listeners.set(event, ls)
  }
}

type WorkerReply = {
  type: "ready" | "outbound" | "result" | "error"
  outboundBundle?: string
  result?: unknown
  error?: string
}

class FakeWorker {
  onmessage: ((e: { data: unknown }) => void) | null = null
  onerror: ((e: unknown) => void) | null = null
  terminated = false
  constructor(private handler: (msg: Record<string, unknown>) => WorkerReply) {}
  postMessage(msg: Record<string, unknown>) {
    queueMicrotask(() => {
      const reply = this.handler(msg)
      this.onmessage?.({ data: { ...reply, id: msg.id } })
    })
  }
  terminate() {
    this.terminated = true
  }
}

// A device worker that walks: init -> ready, start -> "dev-start", and N round
// replies; the last reply is the terminal result.
function scriptedWorker(roundReplies: WorkerReply[]) {
  let round = 0
  return new FakeWorker((msg) => {
    if (msg.type === "init") return { type: "ready" }
    if (msg.type === "start") return { type: "outbound", outboundBundle: "dev-start" }
    if (msg.type === "round") return roundReplies[round++]
    return { type: "error", error: `unexpected worker msg ${String(msg.type)}` }
  })
}

function makeClient(worker: FakeWorker, serverHandler: ServerHandler, stepTimeoutMs = 10_000) {
  holder.socket = new FakeSocketLike(serverHandler)
  holder.connectMode = "ok"
  return new MpcClient({
    apiUrl: "http://localhost:4000",
    createWorker: () => worker as unknown as Worker,
    stepTimeoutMs,
    connectTimeoutMs: 10_000,
  })
}

const VALID_HASH = ("0x" + "ab".repeat(32)) as `0x${string}`
const SIG = { r: ("0x" + "11".repeat(32)) as `0x${string}`, s: ("0x" + "22".repeat(32)) as `0x${string}`, yParity: 1 as const }

beforeEach(() => {
  holder.socket = null
  holder.connectMode = "ok"
})

describe("MpcClient input guards", () => {
  it("rejects a malformed sign hash before any I/O", async () => {
    const client = new MpcClient({ apiUrl: "http://localhost:4000" })
    await expect(client.runSign("key-1", new Uint8Array([1]), "0xdeadbeef")).rejects.toThrow(
      /invalid_sign_hash|32-byte/,
    )
  })

  it("rejects a child derivation index < 1", async () => {
    const client = new MpcClient({ apiUrl: "http://localhost:4000" })
    await expect(client.deriveChildAddress("key-1", new Uint8Array([1]), 0)).rejects.toThrow(
      /index must be >= 1/,
    )
  })

  it("throws not_connected when running a ceremony without connect()", async () => {
    const client = new MpcClient({ apiUrl: "http://localhost:4000" })
    await expect(client.runDkg()).rejects.toMatchObject({ reason: "not_connected" })
  })

  it("close() is idempotent on a fresh instance", async () => {
    const client = new MpcClient({ apiUrl: "http://localhost:4000" })
    await expect(client.close()).resolves.toBeUndefined()
    await expect(client.close()).resolves.toBeUndefined()
  })

  it("MpcClientError carries a reason", () => {
    const err = new MpcClientError("boom", "it broke")
    expect(err).toBeInstanceOf(Error)
    expect(err.reason).toBe("boom")
    expect(err.name).toBe("MpcClientError")
  })
})

describe("MpcClient sign ceremony (lock-step)", () => {
  it("relays bundles round-by-round and returns the server signature", async () => {
    const worker = scriptedWorker([
      { type: "outbound", outboundBundle: "dev-r1" },
      { type: "outbound", outboundBundle: "dev-r2" },
      { type: "result", result: { r: new Uint8Array(32), s: new Uint8Array(32) } },
    ])

    const roundsSeen: string[] = []
    const serverHandler: ServerHandler = (event, payload, socket) => {
      if (event === "ceremony:start") {
        queueMicrotask(() =>
          socket.deliver("ceremony:started", {
            ceremonyId: "cer-1",
            keyId: "key-1",
            outbound: "srv-start",
            expiresAt: Date.now() + 10_000,
          }),
        )
      } else if (event === "ceremony:round") {
        const p = payload as { payload: string }
        roundsSeen.push(p.payload)
        const n = roundsSeen.length
        queueMicrotask(() =>
          socket.deliver("ceremony:message", {
            ceremonyId: "cer-1",
            outbound: `srv-r${n}`,
            done: n === 2, // server finalises on round 2, sends the signature
            ...(n === 2 ? { signature: SIG } : {}),
            expiresAt: Date.now() + 10_000,
          }),
        )
      }
    }

    const client = makeClient(worker, serverHandler)
    await client.connect()
    const out = await client.runSign("key-1", new Uint8Array([9, 9, 9]), VALID_HASH)

    expect(out.keyId).toBe("key-1")
    expect(out.serverSignature).toEqual(SIG)
    // The device's start bundle and each device round bundle reached the server in order.
    expect(roundsSeen).toEqual(["dev-start", "dev-r1"])
    await client.close()
  })

  it("propagates a server ceremony:error", async () => {
    const worker = scriptedWorker([{ type: "outbound", outboundBundle: "dev-r1" }])
    const serverHandler: ServerHandler = (event, _payload, socket) => {
      if (event === "ceremony:start") {
        queueMicrotask(() =>
          socket.deliver("ceremony:started", {
            ceremonyId: "cer-1",
            keyId: "key-1",
            outbound: "srv-start",
            expiresAt: Date.now() + 10_000,
          }),
        )
      } else if (event === "ceremony:round") {
        queueMicrotask(() =>
          socket.deliver("ceremony:error", {
            ceremonyId: "cer-1",
            reason: "server_rejected",
            message: "nope",
          }),
        )
      }
    }
    const client = makeClient(worker, serverHandler)
    await client.connect()
    await expect(client.runSign("key-1", new Uint8Array([1]), VALID_HASH)).rejects.toMatchObject({
      reason: "server_rejected",
    })
    await client.close()
  })

  it("rejects with 'aborted' on ceremony:aborted", async () => {
    const worker = scriptedWorker([{ type: "outbound", outboundBundle: "dev-r1" }])
    const serverHandler: ServerHandler = (event, _payload, socket) => {
      if (event === "ceremony:start") {
        queueMicrotask(() =>
          socket.deliver("ceremony:started", {
            ceremonyId: "cer-1",
            keyId: "key-1",
            outbound: "srv-start",
            expiresAt: Date.now() + 10_000,
          }),
        )
      } else if (event === "ceremony:round") {
        queueMicrotask(() => socket.deliver("ceremony:aborted", { ceremonyId: "cer-1" }))
      }
    }
    const client = makeClient(worker, serverHandler)
    await client.connect()
    await expect(client.runSign("key-1", new Uint8Array([1]), VALID_HASH)).rejects.toMatchObject({
      reason: "aborted",
    })
    await client.close()
  })

  it("rejects with 'disconnected' if the socket drops mid-round", async () => {
    const worker = scriptedWorker([{ type: "outbound", outboundBundle: "dev-r1" }])
    const serverHandler: ServerHandler = (event, _payload, socket) => {
      if (event === "ceremony:start") {
        queueMicrotask(() =>
          socket.deliver("ceremony:started", {
            ceremonyId: "cer-1",
            keyId: "key-1",
            outbound: "srv-start",
            expiresAt: Date.now() + 10_000,
          }),
        )
      } else if (event === "ceremony:round") {
        queueMicrotask(() => socket.disconnect())
      }
    }
    const client = makeClient(worker, serverHandler)
    await client.connect()
    await expect(client.runSign("key-1", new Uint8Array([1]), VALID_HASH)).rejects.toMatchObject({
      reason: "disconnected",
    })
    await client.close()
  })

  it("times out a round the server never answers", async () => {
    const worker = scriptedWorker([{ type: "outbound", outboundBundle: "dev-r1" }])
    const serverHandler: ServerHandler = (event, _payload, socket) => {
      if (event === "ceremony:start") {
        queueMicrotask(() =>
          socket.deliver("ceremony:started", {
            ceremonyId: "cer-1",
            keyId: "key-1",
            outbound: "srv-start",
            expiresAt: Date.now() + 10_000,
          }),
        )
      }
      // ceremony:round: intentionally no response -> step timeout fires
    }
    const client = makeClient(worker, serverHandler, 30) // 30ms step timeout
    await client.connect()
    await expect(client.runSign("key-1", new Uint8Array([1]), VALID_HASH)).rejects.toMatchObject({
      reason: "timeout",
    })
    await client.close()
  })

  it("stalls out after MAX_ROUNDS when neither side finishes", async () => {
    // Worker never returns a result; server never sets done -> exceeds MAX_ROUNDS.
    const neverDone: WorkerReply[] = Array.from({ length: 12 }, (_, i) => ({
      type: "outbound" as const,
      outboundBundle: `dev-r${i + 1}`,
    }))
    const worker = scriptedWorker(neverDone)
    let n = 0
    const serverHandler: ServerHandler = (event, _payload, socket) => {
      if (event === "ceremony:start") {
        queueMicrotask(() =>
          socket.deliver("ceremony:started", {
            ceremonyId: "cer-1",
            keyId: "key-1",
            outbound: "srv-start",
            expiresAt: Date.now() + 10_000,
          }),
        )
      } else if (event === "ceremony:round") {
        n += 1
        queueMicrotask(() =>
          socket.deliver("ceremony:message", {
            ceremonyId: "cer-1",
            outbound: `srv-r${n}`,
            done: false,
            expiresAt: Date.now() + 10_000,
          }),
        )
      }
    }
    const client = makeClient(worker, serverHandler)
    await client.connect()
    await expect(client.runSign("key-1", new Uint8Array([1]), VALID_HASH)).rejects.toMatchObject({
      reason: "stalled",
    })
    await client.close()
  })
})
