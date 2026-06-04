// apps/api/src/services/mpc/kms.ts
//
// KMS abstraction for DEK wrapping/unwrapping.
//
// Production: replace LocalDevKms with a cloud-KMS implementation (e.g. AWS KMS,
// GCP Cloud KMS, HashiCorp Vault Transit) and select it via env at startup.
// The interface is intentionally minimal so any KMS backend can implement it.

import { randomBytes, createCipheriv, createDecipheriv } from "crypto"

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

export interface Kms {
  /**
   * Wraps a 32-byte DEK with the KEK identified by the given context.
   * Returns the wrapped DEK bytes (opaque to the caller).
   */
  wrapDek(dek: Buffer, ctx: { keyId: string; version: number }): Promise<Buffer>

  /**
   * Unwraps a previously wrapped DEK.
   * Throws if the wrapped DEK is invalid or was wrapped under a different KEK.
   */
  unwrapDek(wrappedDek: Buffer, ctx: { keyId: string; version: number }): Promise<Buffer>
}

// ---------------------------------------------------------------------------
// DEV-ONLY local implementation
// ---------------------------------------------------------------------------
//
// ⚠  DEV ONLY — NOT FOR PRODUCTION USE ⚠
//
// The KEK lives in memory, derived from MPC_KMS_DEV_KEK env var.
// This implementation is intentionally simple: it AES-256-GCM wraps the DEK
// using the KEK directly. In production, use a managed KMS that provides:
//   - Hardware-backed key storage
//   - Key versioning and rotation
//   - Audit logging of all key operations
//   - Access control policies
//
// Wrapped DEK layout: [ 12-byte nonce | 32-byte ciphertext | 16-byte tag ]
// Total: 60 bytes.

const WRAPPED_DEK_NONCE_LEN = 12
const WRAPPED_DEK_TAG_LEN = 16
const DEK_LEN = 32

export class LocalDevKms implements Kms {
  private readonly kek: Buffer

  constructor(kek: Buffer) {
    if (kek.length !== DEK_LEN) {
      throw new Error(`LocalDevKms: KEK must be exactly ${DEK_LEN} bytes, got ${kek.length}`)
    }
    this.kek = kek
  }

  async wrapDek(dek: Buffer, _ctx: { keyId: string; version: number }): Promise<Buffer> {
    if (dek.length !== DEK_LEN) {
      throw new Error(`LocalDevKms: DEK must be exactly ${DEK_LEN} bytes`)
    }
    const nonce = randomBytes(WRAPPED_DEK_NONCE_LEN)
    const cipher = createCipheriv("aes-256-gcm", this.kek, nonce)
    const ciphertext = Buffer.concat([cipher.update(dek), cipher.final()])
    const tag = cipher.getAuthTag()
    // Layout: nonce | ciphertext | tag
    return Buffer.concat([nonce, ciphertext, tag])
  }

  async unwrapDek(wrappedDek: Buffer, _ctx: { keyId: string; version: number }): Promise<Buffer> {
    const expectedLen = WRAPPED_DEK_NONCE_LEN + DEK_LEN + WRAPPED_DEK_TAG_LEN
    if (wrappedDek.length !== expectedLen) {
      throw new Error(
        `LocalDevKms: wrapped DEK has unexpected length ${wrappedDek.length}, expected ${expectedLen}`,
      )
    }
    const nonce = wrappedDek.subarray(0, WRAPPED_DEK_NONCE_LEN)
    const ciphertext = wrappedDek.subarray(WRAPPED_DEK_NONCE_LEN, WRAPPED_DEK_NONCE_LEN + DEK_LEN)
    const tag = wrappedDek.subarray(WRAPPED_DEK_NONCE_LEN + DEK_LEN)

    const decipher = createDecipheriv("aes-256-gcm", this.kek, nonce)
    decipher.setAuthTag(tag)
    try {
      return Buffer.concat([decipher.update(ciphertext), decipher.final()])
    } catch {
      throw new Error("LocalDevKms: DEK unwrap failed — wrong KEK or corrupted wrapped DEK")
    }
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

let _kmsInstance: Kms | null = null

/**
 * Returns the configured KMS instance.
 *
 * Selection order:
 *   1. (Future) Cloud KMS when MPC_KMS_PROVIDER env is set (not yet implemented)
 *   2. LocalDevKms from MPC_KMS_DEV_KEK — dev/test only
 *
 * Throws at startup if no KEK is configured, so misconfigured environments
 * fail loudly rather than silently.
 */
export function getKms(): Kms {
  if (_kmsInstance) return _kmsInstance

  // TODO: add cloud KMS factory branch here when MPC_KMS_PROVIDER is set,
  // e.g.: if (process.env.MPC_KMS_PROVIDER === "aws") { return new AwsKms(...) }

  const devKekB64 = process.env.MPC_KMS_DEV_KEK
  if (!devKekB64) {
    throw new Error(
      "MPC_KMS_DEV_KEK is not set. " +
        "For local dev: generate a key with `openssl rand -base64 32` and add it to .env. " +
        "For production: configure a cloud KMS provider.",
    )
  }

  const kek = Buffer.from(devKekB64, "base64")
  _kmsInstance = new LocalDevKms(kek)
  return _kmsInstance
}

/**
 * Reset the cached KMS instance — for testing only.
 * @internal
 */
export function _resetKmsInstance(): void {
  _kmsInstance = null
}
