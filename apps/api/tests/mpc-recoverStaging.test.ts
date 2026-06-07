import { describe, it, expect } from "vitest"
import {
  stageRecovery,
  takeRecovery,
  markConsumed,
} from "../src/services/mpc/recoverStaging.js"
import type { EncryptedShare } from "../src/services/mpc/serverShareStore.js"

const enc = (): EncryptedShare => ({
  ciphertext: Buffer.from("ct"),
  nonce: Buffer.from("nonce"),
  wrappedDek: Buffer.from("dek"),
  version: 2,
})

const USER = 8
const KEY = "key-1"

describe("recoverStaging", () => {
  it("stages and resolves a token for the owning user", () => {
    const token = stageRecovery(USER, KEY, enc(), 2)
    const r = takeRecovery(USER, token)
    expect(r.status).toBe("ready")
    if (r.status === "ready") {
      expect(r.staged.keyId).toBe(KEY)
      expect(r.staged.nextVersion).toBe(2)
    }
  })

  it("never resolves a token for a different user", () => {
    const token = stageRecovery(USER, KEY, enc(), 2)
    expect(takeRecovery(USER + 1, token).status).toBe("not_found")
  })

  it("is idempotent after commit (markConsumed)", () => {
    const token = stageRecovery(USER, KEY, enc(), 2)
    expect(takeRecovery(USER, token).status).toBe("ready")
    markConsumed(token)
    expect(takeRecovery(USER, token).status).toBe("already_committed")
  })

  it("treats unknown tokens as not_found", () => {
    expect(takeRecovery(USER, "nope").status).toBe("not_found")
  })

  it("staging a second token for the same key evicts the first (no concurrent commit)", () => {
    const key = "key-evict"
    const t1 = stageRecovery(USER, key, enc(), 2)
    const t2 = stageRecovery(USER, key, enc(), 2)
    // Only the latest recovery for a key is committable; the first token is dead.
    expect(takeRecovery(USER, t1).status).toBe("not_found")
    expect(takeRecovery(USER, t2).status).toBe("ready")
  })

  it("stays idempotent through the consumed grace window, then is swept", () => {
    const key = "key-grace"
    const t0 = 5_000_000
    const token = stageRecovery(USER, key, enc(), 2, t0)
    expect(takeRecovery(USER, token, t0).status).toBe("ready")
    markConsumed(token, t0 + 1000)
    // Within the grace window: a lost commit-response can safely re-commit.
    expect(takeRecovery(USER, token, t0 + 1000 + 30_000).status).toBe("already_committed")
    // Past the grace window: swept.
    expect(takeRecovery(USER, token, t0 + 1000 + 61_000).status).toBe("not_found")
  })

  it("expires a pending entry after its TTL (no commit happened)", () => {
    const t0 = 1_000_000
    const token = stageRecovery(USER, KEY, enc(), 2, t0)
    // Just before TTL: still resolvable.
    expect(takeRecovery(USER, token, t0 + 9 * 60 * 1000).status).toBe("ready")
    // After 10-min TTL: gone — caller will surface recovery_session_expired,
    // and since nothing was committed the old kit stays valid (no brick).
    expect(takeRecovery(USER, token, t0 + 11 * 60 * 1000).status).toBe("not_found")
  })
})
