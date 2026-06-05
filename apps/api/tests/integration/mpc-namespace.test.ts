// apps/api/tests/integration/mpc-namespace.test.ts
//
// H1 (security-review hardening) coverage for the /mpc transport adapter
// (ws/mpc.ts): the LIVE-ceremony concurrency caps (per socket + per user) and
// the active deadline reaper that frees an idle ceremony without waiting for
// disconnect. Uses a real socket.io Server + socket.io-client over loopback and
// the real Ceremony orchestrator (real WASM + walty_test DB), with the real
// session-liveness re-check (M3) satisfied by a seeded device_session + JWT.

import { randomBytes } from "node:crypto"

// Dev KEK + JWT secret. The round timeout is read PER-CALL in ceremony.ts, so
// the reaper test sets MPC_ROUND_TIMEOUT_MS in beforeAll and restores it in
// afterAll to avoid shortening deadlines for other integration files.
process.env.MPC_KMS_DEV_KEK =
  process.env.MPC_KMS_DEV_KEK ?? randomBytes(32).toString("base64")
process.env.JWT_SECRET = process.env.JWT_SECRET ?? "mpc-namespace-test-secret"

const REAPER_TIMEOUT_MS = "600"
let prevRoundTimeout: string | undefined

import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { createServer, type Server as HttpServer } from "node:http"
import { Server } from "socket.io"
import { io as ioClient, type Socket as ClientSocket } from "socket.io-client"
import { db, users, deviceSessions } from "@walty/db"
import { signSessionToken } from "@walty/shared/auth/session-token"
import { verifySessionToken } from "@walty/shared/auth/session-token"
import { findSession } from "../../src/services/deviceSessions.js"
import { registerMpcNamespace } from "../../src/ws/mpc.js"

// Real-enough auth middleware: verify the handshake token, confirm a live
// session, and pin userId/sid on socket.data — exactly what io.ts does. The
// in-handler isSocketSessionLive re-reads the SAME handshake token.
async function authMiddleware(
  socket: import("socket.io").Socket,
  next: (err?: Error) => void,
) {
  const authObj = socket.handshake.auth as { token?: unknown } | undefined
  const token = typeof authObj?.token === "string" ? authObj.token : null
  if (!token) return next(new Error("unauthorized"))
  try {
    const auth = verifySessionToken(token)
    if (!auth.sid) return next(new Error("unauthorized"))
    const session = await findSession(auth.sid)
    if (!session || session.userId !== auth.userId || session.revokedAt) {
      return next(new Error("unauthorized"))
    }
    socket.data.userId = auth.userId
    socket.data.sid = auth.sid
    next()
  } catch {
    next(new Error("unauthorized"))
  }
}

let httpServer: HttpServer
let io: Server
let baseUrl: string

beforeAll(async () => {
  prevRoundTimeout = process.env.MPC_ROUND_TIMEOUT_MS
  process.env.MPC_ROUND_TIMEOUT_MS = REAPER_TIMEOUT_MS
  httpServer = createServer()
  io = new Server(httpServer)
  registerMpcNamespace(io, authMiddleware)
  await new Promise<void>((res) => httpServer.listen(0, "127.0.0.1", () => res()))
  const addr = httpServer.address()
  const port = typeof addr === "object" && addr ? addr.port : 0
  baseUrl = `http://127.0.0.1:${port}`
})

afterAll(async () => {
  if (prevRoundTimeout === undefined) delete process.env.MPC_ROUND_TIMEOUT_MS
  else process.env.MPC_ROUND_TIMEOUT_MS = prevRoundTimeout
  await new Promise<void>((res) => io.close(() => res()))
  await new Promise<void>((res) => httpServer.close(() => res()))
})

async function seedUserToken(): Promise<{ userId: number; token: string }> {
  const [user] = await db
    .insert(users)
    .values({
      email: `mpc-ns-${Date.now()}-${Math.random()}@example.com`,
      passwordHash: "x",
    })
    .returning()
  const [session] = await db
    .insert(deviceSessions)
    .values({ userId: user.id, label: "mpc-ns-test" })
    .returning()
  return { userId: user.id, token: signSessionToken({ userId: user.id, sid: session.id }) }
}

function connect(token: string): Promise<ClientSocket> {
  const socket = ioClient(`${baseUrl}/mpc`, {
    transports: ["websocket"],
    forceNew: true,
    auth: { token },
  })
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("connect timeout")), 5000)
    socket.on("connect", () => {
      clearTimeout(t)
      resolve(socket)
    })
    socket.on("connect_error", (e) => {
      clearTimeout(t)
      reject(e)
    })
  })
}

/** Emit ceremony:start and resolve with "started" | the error reason. */
function startDkg(socket: ClientSocket): Promise<{ ok: true } | { ok: false; reason: string }> {
  return new Promise((resolve) => {
    const onStarted = () => {
      cleanup()
      resolve({ ok: true })
    }
    const onError = (err: { reason: string }) => {
      cleanup()
      resolve({ ok: false, reason: err.reason })
    }
    const cleanup = () => {
      socket.off("ceremony:started", onStarted)
      socket.off("ceremony:error", onError)
    }
    socket.once("ceremony:started", onStarted)
    socket.once("ceremony:error", onError)
    socket.emit("ceremony:start", { ceremonyType: "dkg" })
  })
}

describe("/mpc namespace — H1 caps + reaper", () => {
  it("rejects a 4th concurrent ceremony on one socket (MAX_CEREMONIES_PER_SOCKET = 3)", async () => {
    const { token } = await seedUserToken()
    const socket = await connect(token)
    try {
      // 3 live ceremonies are allowed.
      for (let i = 0; i < 3; i++) {
        const r = await startDkg(socket)
        expect(r.ok).toBe(true)
      }
      // The 4th must be rejected cleanly while the first 3 are still live.
      const r4 = await startDkg(socket)
      expect(r4).toEqual({ ok: false, reason: "too_many_ceremonies" })
    } finally {
      socket.disconnect()
    }
  })

  it("frees the per-user slot after the active reaper aborts an idle ceremony", async () => {
    const { token } = await seedUserToken()
    const socket = await connect(token)
    try {
      // Fill the socket up to its cap with idle (never-advanced) ceremonies.
      for (let i = 0; i < 3; i++) {
        const r = await startDkg(socket)
        expect(r.ok).toBe(true)
      }
      // Immediately, the cap is hit.
      const blocked = await startDkg(socket)
      expect(blocked).toEqual({ ok: false, reason: "too_many_ceremonies" })

      // Wait past the (tiny) round deadline so the reaper fires on all three,
      // freeing their WASM parties + the per-socket/per-user slots.
      await new Promise((res) => setTimeout(res, 1500))

      // A fresh start now succeeds — proving the reaper reclaimed the slots
      // rather than leaking them until disconnect.
      const afterReap = await startDkg(socket)
      expect(afterReap.ok).toBe(true)
    } finally {
      socket.disconnect()
    }
  })

  it("enforces the per-user cap across multiple sockets (MAX_CEREMONIES_PER_USER = 5)", async () => {
    const { token } = await seedUserToken()
    const sockA = await connect(token)
    const sockB = await connect(token)
    try {
      // socket A: 3 live (its own cap).
      for (let i = 0; i < 3; i++) expect((await startDkg(sockA)).ok).toBe(true)
      // socket B: 2 more brings the USER total to 5.
      for (let i = 0; i < 2; i++) expect((await startDkg(sockB)).ok).toBe(true)
      // The 6th for the user (B's 3rd, under B's own per-socket cap) is rejected
      // by the per-USER cap.
      const overUser = await startDkg(sockB)
      expect(overUser).toEqual({ ok: false, reason: "too_many_ceremonies" })
    } finally {
      sockA.disconnect()
      sockB.disconnect()
      // Let teardown/disconnect bookkeeping settle so the next test's user
      // counter starts clean (counters are keyed per-user, so distinct users
      // are already isolated; this is just hygiene).
      await new Promise((res) => setTimeout(res, 50))
    }
  })
})
