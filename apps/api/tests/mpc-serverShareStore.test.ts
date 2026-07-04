// apps/api/tests/mpc-serverShareStore.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest"
import { randomBytes } from "crypto"

// Set up env before importing modules
process.env.MPC_KMS_DEV_KEK = randomBytes(32).toString("base64")
process.env.NODE_ENV = "test"

import type { ShareContext, EncryptedShare } from "../src/services/mpc/serverShareStore.js"
import type { Kms } from "../src/services/mpc/kms.js"

// Lazy imports (modules don't exist yet — test runner will error on import)
let encryptShare: (ctx: ShareContext, shareBytes: Buffer, kms?: Kms) => Promise<EncryptedShare>
let decryptShare: (ctx: ShareContext, enc: EncryptedShare, kms?: Kms) => Promise<Buffer>
let getKms: () => Kms

beforeEach(async () => {
  const store = await import("../src/services/mpc/serverShareStore.js")
  const kmsModule = await import("../src/services/mpc/kms.js")
  encryptShare = store.encryptShare
  decryptShare = store.decryptShare
  getKms = kmsModule.getKms
})

const baseCtx: ShareContext = {
  userId: 42,
  keyId: "key-abc-123",
  pubkey: "0x04aabbcc",
  version: 1,
}

describe("round-trip", () => {
  it("encrypts and decrypts a ~247KB buffer correctly", async () => {
    const original = randomBytes(247_000)
    const enc = await encryptShare(baseCtx, original)
    const decrypted = await decryptShare(baseCtx, enc)
    expect(decrypted).toEqual(original)
  })
})

describe("AAD tamper tests", () => {
  it("throws when userId is tampered", async () => {
    const original = randomBytes(1024)
    const enc = await encryptShare(baseCtx, original)
    const tamperedCtx: ShareContext = { ...baseCtx, userId: 999 }
    await expect(decryptShare(tamperedCtx, enc)).rejects.toThrow()
  })

  it("throws when keyId is tampered", async () => {
    const original = randomBytes(1024)
    const enc = await encryptShare(baseCtx, original)
    const tamperedCtx: ShareContext = { ...baseCtx, keyId: "key-evil" }
    await expect(decryptShare(tamperedCtx, enc)).rejects.toThrow()
  })

  it("throws when pubkey is tampered", async () => {
    const original = randomBytes(1024)
    const enc = await encryptShare(baseCtx, original)
    const tamperedCtx: ShareContext = { ...baseCtx, pubkey: "0x04evil" }
    await expect(decryptShare(tamperedCtx, enc)).rejects.toThrow()
  })

  it("throws when version is tampered in AAD", async () => {
    const original = randomBytes(1024)
    const enc = await encryptShare(baseCtx, original)
    // Tamper both the envelope version and context version to bypass version guard,
    // but the AAD will be wrong (wrappedDek was wrapped under version=1, now unwrapping
    // with ctx={keyId, version:99}) — or if unwrap ignores version, GCM auth fails due
    // to AAD mismatch. Either way, this must throw.
    const tamperedCtx: ShareContext = { ...baseCtx, version: 99 }
    const tamperedEnc: EncryptedShare = { ...enc, version: 99 }
    await expect(decryptShare(tamperedCtx, tamperedEnc)).rejects.toThrow()
  })
})

describe("ciphertext tamper tests", () => {
  it("throws when ciphertext is modified (GCM auth failure)", async () => {
    const original = randomBytes(1024)
    const enc = await encryptShare(baseCtx, original)
    // Flip a byte in the middle of ciphertext
    const tampered = Buffer.from(enc.ciphertext)
    tampered[512] ^= 0xff
    const tamperedEnc: EncryptedShare = { ...enc, ciphertext: tampered }
    await expect(decryptShare(baseCtx, tamperedEnc)).rejects.toThrow()
  })
})

describe("wrong KEK", () => {
  it("fails to decrypt when using a different KEK", async () => {
    const original = randomBytes(1024)
    const enc = await encryptShare(baseCtx, original)

    // Build a second KMS with a completely different KEK
    const { LocalDevKms } = await import("../src/services/mpc/kms.js")
    const wrongKms = new LocalDevKms(randomBytes(32))

    await expect(decryptShare(baseCtx, enc, wrongKms)).rejects.toThrow()
  })
})

describe("no-logging of sensitive material", () => {
  it("does not log shareBytes, DEK, or ciphertext to console during encrypt/decrypt", async () => {
    const original = randomBytes(247_000)

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {})
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {})
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {})
    const debugSpy = vi.spyOn(console, "debug").mockImplementation(() => {})

    try {
      const enc = await encryptShare(baseCtx, original)
      await decryptShare(baseCtx, enc)
    } finally {
      logSpy.mockRestore()
      warnSpy.mockRestore()
      errorSpy.mockRestore()
      infoSpy.mockRestore()
      debugSpy.mockRestore()
    }

    // Gather all console calls and assert no Buffer/Uint8Array of sensitive size was passed
    const allCalls = [
      ...logSpy.mock.calls,
      ...warnSpy.mock.calls,
      ...errorSpy.mock.calls,
      ...infoSpy.mock.calls,
      ...debugSpy.mock.calls,
    ].flat()

    for (const arg of allCalls) {
      if (Buffer.isBuffer(arg) || arg instanceof Uint8Array) {
        // Any buffer emission longer than a tiny ID is suspicious
        expect((arg as Buffer).length).toBeLessThan(64)
      }
      if (typeof arg === "string") {
        // The original share as hex/base64 shouldn't appear
        expect(arg.length).toBeLessThan(512)
      }
    }
  })
})
