// apps/web/lib/mpc/backupShare.test.ts
//
// Vitest tests for the backup-share export / verify / zeroize lifecycle.
// These are pure byte/crypto operations — no WASM, no DOM, no IndexedDB.

import { describe, it, expect, vi } from "vitest"
import {
  exportBackupShare,
  importBackupShare,
  verifyBackupExport,
  zeroizeShare,
  finalizeBackupShare,
  type BackupExport,
} from "./backupShare"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Make a non-trivial fake "share" blob of arbitrary size. */
function makeShare(size = 64): Uint8Array {
  const buf = new Uint8Array(size)
  for (let i = 0; i < size; i++) buf[i] = (i * 37 + 13) & 0xff
  return buf
}

const RECOVERY_PASSWORD = "correct-horse-battery-staple-2026"
const WRONG_PASSWORD = "wrong-password-entirely"

// ---------------------------------------------------------------------------
// export → import round-trip
// ---------------------------------------------------------------------------

describe("exportBackupShare / importBackupShare", () => {
  it("round-trips to the exact original bytes", async () => {
    const original = makeShare(64)
    const exp = await exportBackupShare(original, RECOVERY_PASSWORD)
    const recovered = await importBackupShare(exp, RECOVERY_PASSWORD)
    expect(recovered).toEqual(original)
  })

  it("round-trips with larger share buffers", async () => {
    const original = makeShare(256)
    const exp = await exportBackupShare(original, RECOVERY_PASSWORD)
    const recovered = await importBackupShare(exp, RECOVERY_PASSWORD)
    expect(recovered).toEqual(original)
  })

  it("export produces correct format tag", async () => {
    const original = makeShare(64)
    const exp = await exportBackupShare(original, RECOVERY_PASSWORD)
    expect(exp.format).toBe("walty-backup-share-v1")
  })

  it("export has non-empty iv, salt, ciphertext", async () => {
    const original = makeShare(64)
    const exp = await exportBackupShare(original, RECOVERY_PASSWORD)
    expect(exp.iv.length).toBeGreaterThan(0)
    expect(exp.salt.length).toBeGreaterThan(0)
    expect(exp.ciphertext.length).toBeGreaterThan(0)
  })

  it("two exports of the same share differ (random IV/salt)", async () => {
    const original = makeShare(64)
    const exp1 = await exportBackupShare(original, RECOVERY_PASSWORD)
    const exp2 = await exportBackupShare(original, RECOVERY_PASSWORD)
    // Different IV and salt should produce different ciphertexts.
    expect(exp1.iv).not.toBe(exp2.iv)
    expect(exp1.salt).not.toBe(exp2.salt)
    expect(exp1.ciphertext).not.toBe(exp2.ciphertext)
  })

  it("wrong recovery password throws on import (GCM auth failure)", async () => {
    const original = makeShare(64)
    const exp = await exportBackupShare(original, RECOVERY_PASSWORD)
    await expect(importBackupShare(exp, WRONG_PASSWORD)).rejects.toThrow(
      "Invalid recovery password",
    )
  })

  it("unknown format tag throws on import", async () => {
    const original = makeShare(32)
    const exp = await exportBackupShare(original, RECOVERY_PASSWORD)
    const tampered = { ...exp, format: "unknown-format" } as unknown as BackupExport
    await expect(importBackupShare(tampered, RECOVERY_PASSWORD)).rejects.toThrow(
      /unknown format/,
    )
  })

  it("survives JSON serialisation round-trip", async () => {
    const original = makeShare(64)
    const exp = await exportBackupShare(original, RECOVERY_PASSWORD)
    const json = JSON.stringify(exp)
    const parsed: BackupExport = JSON.parse(json)
    const recovered = await importBackupShare(parsed, RECOVERY_PASSWORD)
    expect(recovered).toEqual(original)
  })
})

// ---------------------------------------------------------------------------
// verifyBackupExport
// ---------------------------------------------------------------------------

describe("verifyBackupExport", () => {
  it("returns true for a valid export and matching original bytes", async () => {
    const original = makeShare(64)
    const exp = await exportBackupShare(original, RECOVERY_PASSWORD)
    const ok = await verifyBackupExport(exp, RECOVERY_PASSWORD, original)
    expect(ok).toBe(true)
  })

  it("returns false when the password is wrong", async () => {
    const original = makeShare(64)
    const exp = await exportBackupShare(original, RECOVERY_PASSWORD)
    const ok = await verifyBackupExport(exp, WRONG_PASSWORD, original)
    expect(ok).toBe(false)
  })

  it("returns false when the original bytes are tampered before comparison", async () => {
    const original = makeShare(64)
    const exp = await exportBackupShare(original, RECOVERY_PASSWORD)
    // Mutate the reference bytes after export.
    const tampered = new Uint8Array(original)
    tampered[0] ^= 0xff
    const ok = await verifyBackupExport(exp, RECOVERY_PASSWORD, tampered)
    expect(ok).toBe(false)
  })

  it("returns false when the ciphertext blob is tampered", async () => {
    const original = makeShare(64)
    const exp = await exportBackupShare(original, RECOVERY_PASSWORD)
    // Flip a byte in the ciphertext (base64url → decode → flip → re-encode).
    // Easiest: just corrupt the ciphertext string directly.
    const badCiphertext =
      exp.ciphertext.slice(0, -4) +
      (exp.ciphertext.endsWith("AAAA") ? "BBBB" : "AAAA")
    const tampered: BackupExport = { ...exp, ciphertext: badCiphertext }
    const ok = await verifyBackupExport(tampered, RECOVERY_PASSWORD, original)
    expect(ok).toBe(false)
  })

  it("returns false when lengths differ", async () => {
    const original = makeShare(64)
    const exp = await exportBackupShare(original, RECOVERY_PASSWORD)
    const shorter = original.slice(0, 32)
    const ok = await verifyBackupExport(exp, RECOVERY_PASSWORD, shorter)
    expect(ok).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// zeroizeShare
// ---------------------------------------------------------------------------

describe("zeroizeShare", () => {
  it("overwrites the entire buffer with zeros", () => {
    const buf = makeShare(32)
    // Verify it's non-zero before zeroizing.
    expect(buf.some((b) => b !== 0)).toBe(true)
    zeroizeShare(buf)
    expect(Array.from(buf).every((b) => b === 0)).toBe(true)
  })

  it("is idempotent — zeroizing an already-zero buffer is safe", () => {
    const buf = new Uint8Array(16)
    zeroizeShare(buf) // already zero
    expect(Array.from(buf).every((b) => b === 0)).toBe(true)
  })

  it("mutates the original buffer in place (same reference)", () => {
    const buf = makeShare(8)
    const ref = buf
    zeroizeShare(buf)
    expect(ref).toBe(buf)
    expect(Array.from(ref).every((b) => b === 0)).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// finalizeBackupShare
// ---------------------------------------------------------------------------

describe("finalizeBackupShare", () => {
  it("success: returns a valid BackupExport", async () => {
    const original = makeShare(64)
    const exp = await finalizeBackupShare(original.slice(), RECOVERY_PASSWORD)
    expect(exp.format).toBe("walty-backup-share-v1")
    // The returned export should be importable with the recovery password.
    const recovered = await importBackupShare(exp, RECOVERY_PASSWORD)
    expect(recovered).toEqual(original)
  })

  it("success: input buffer is zeroized after the call", async () => {
    const buf = makeShare(64)
    await finalizeBackupShare(buf, RECOVERY_PASSWORD)
    expect(Array.from(buf).every((b) => b === 0)).toBe(true)
  })

  it("forced-verify-failure: throws AND still zeroizes the input buffer", async () => {
    // We force a verify failure by spying on crypto.subtle.decrypt and making
    // it throw on the FIRST call (which is the internal verify → importBackupShare
    // → decrypt path). The export step uses crypto.subtle.encrypt, not decrypt,
    // so the spy intercepts only the verification call.
    const decryptSpy = vi
      .spyOn(crypto.subtle, "decrypt")
      .mockImplementationOnce(async () => {
        // Simulate AES-GCM authentication failure on the verify step.
        throw new DOMException("AES-GCM authentication failed", "OperationError")
      })

    const buf = makeShare(64)
    try {
      await expect(finalizeBackupShare(buf, RECOVERY_PASSWORD)).rejects.toThrow()
      // Buffer must be zeroized even though the call threw.
      expect(Array.from(buf).every((b) => b === 0)).toBe(true)
    } finally {
      decryptSpy.mockRestore()
    }
  })

  it("enforces export→verify→zeroize order: verify receives the pre-zeroize bytes", async () => {
    // After finalizeBackupShare the buffer is zeroed, but the export must have
    // been made from the original non-zero bytes. We snapshot original BEFORE
    // passing the buffer so we can compare against the recovered bytes.
    const original = makeShare(64)
    const originalSnapshot = original.slice() // snapshot before passing
    const exp = await finalizeBackupShare(original, RECOVERY_PASSWORD)
    // original is now zero; but the export should still decrypt to originalSnapshot.
    const recovered = await importBackupShare(exp, RECOVERY_PASSWORD)
    expect(recovered).toEqual(originalSnapshot)
    // Confirm the buffer was indeed zeroized.
    expect(Array.from(original).every((b) => b === 0)).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// No-co-persistence invariant
// ---------------------------------------------------------------------------
//
// INVARIANT: backupShare.ts MUST NOT import or call deviceShareStore,
// wallet-store, or any IndexedDB write path. The backup share is never
// persisted to browser storage — it is only returned to the caller for
// offline export.
//
// This test reads the source of backupShare.ts and asserts the absence of
// those imports. It acts as a static guard so any future accidental import of
// the persistence layer will immediately fail the test suite.

describe("no-co-persistence invariant", () => {
  it("backupShare.ts does not import deviceShareStore or wallet-store", async () => {
    // Dynamic import of the raw source text via Vite's ?raw suffix is not
    // available in vitest node env, so we read the file using Node's fs.
    const { readFileSync } = await import("node:fs")
    const { fileURLToPath } = await import("node:url")
    const { dirname, resolve } = await import("node:path")

    const __filename = fileURLToPath(import.meta.url)
    const __dirname = dirname(__filename)
    const source = readFileSync(resolve(__dirname, "backupShare.ts"), "utf8")

    // Must not have an import statement for the device share store or wallet
    // store. We check import lines specifically (not comments).
    const importLines = source
      .split("\n")
      .filter((line) => /^\s*import\b/.test(line))
      .join("\n")
    expect(importLines).not.toMatch(/deviceShareStore/)
    expect(importLines).not.toMatch(/wallet-store/)
    // Must not call IndexedDB write primitives.
    expect(source).not.toMatch(/idbPut\s*\(|objectStore\([^)]*\)\s*\.put\s*\(/)
    // Should contain the invariant comment as documentation.
    expect(source).toMatch(/INVARIANT/)
  })
})
