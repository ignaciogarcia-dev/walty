// KMS abstraction for DEK wrapping/unwrapping. In production, swap LocalDevKms
// for a cloud KMS (AWS/GCP/Vault) selected via env at startup.

import { randomBytes, createCipheriv, createDecipheriv } from "crypto"
import { AwsKms } from "./awsKms.js"

export interface Kms {
  /** Wrap a 32-byte DEK under the KEK for this ctx; returns opaque bytes. */
  wrapDek(dek: Buffer, ctx: { keyId: string; version: number }): Promise<Buffer>

  /** Throws if the wrapped DEK is invalid or was wrapped under a different KEK. */
  unwrapDek(wrappedDek: Buffer, ctx: { keyId: string; version: number }): Promise<Buffer>
}

// DEV ONLY — NOT FOR PRODUCTION. KEK lives in memory from MPC_KMS_DEV_KEK and
// wraps the DEK directly. A real KMS gives hardware-backed storage, rotation,
// audit logging, and access control.
// Wrapped DEK layout: [ 12-byte nonce | 32-byte ciphertext | 16-byte tag ] = 60 bytes.

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

  async wrapDek(dek: Buffer, ctx: { keyId: string; version: number }): Promise<Buffer> {
    if (dek.length !== DEK_LEN) {
      throw new Error(`LocalDevKms: DEK must be exactly ${DEK_LEN} bytes`)
    }
    const nonce = randomBytes(WRAPPED_DEK_NONCE_LEN)
    const cipher = createCipheriv("aes-256-gcm", this.kek, nonce)
    // Bind ctx into AAD so a wrapped DEK can't be unwrapped under a different
    // keyId/version (mirrors a cloud KMS EncryptionContext).
    cipher.setAAD(Buffer.from(`${ctx.keyId}|${ctx.version}`))
    const ciphertext = Buffer.concat([cipher.update(dek), cipher.final()])
    const tag = cipher.getAuthTag()
    return Buffer.concat([nonce, ciphertext, tag])
  }

  async unwrapDek(wrappedDek: Buffer, ctx: { keyId: string; version: number }): Promise<Buffer> {
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
    // Same AAD as wrap — mismatched ctx fails GCM auth.
    decipher.setAAD(Buffer.from(`${ctx.keyId}|${ctx.version}`))
    try {
      return Buffer.concat([decipher.update(ciphertext), decipher.final()])
    } catch {
      throw new Error("LocalDevKms: DEK unwrap failed — wrong KEK, wrong ctx, or corrupted wrapped DEK")
    }
  }
}

let _kmsInstance: Kms | null = null

// Throws if no provider/KEK is configured so misconfigured envs fail loudly at startup.
export function getKms(): Kms {
  if (_kmsInstance) return _kmsInstance

  const provider = process.env.MPC_KMS_PROVIDER

  if (provider === "aws") {
    const keyId = process.env.MPC_KMS_AWS_KEY_ID
    if (!keyId) {
      throw new Error(
        "MPC_KMS_PROVIDER=aws but MPC_KMS_AWS_KEY_ID is not set. " +
          "Set it to the KMS key ID, ARN, or alias used to wrap MPC share DEKs.",
      )
    }
    _kmsInstance = new AwsKms(keyId)
    return _kmsInstance
  }

  if (provider && provider !== "local") {
    throw new Error(
      `MPC_KMS_PROVIDER="${provider}" is not supported. Use "aws" or leave unset for LocalDevKms (dev only).`,
    )
  }

  const devKekB64 = process.env.MPC_KMS_DEV_KEK
  if (!devKekB64) {
    throw new Error(
      "MPC_KMS_DEV_KEK is not set. " +
        "For local dev: generate a key with `openssl rand -base64 32` and add it to .env. " +
        "For production: set MPC_KMS_PROVIDER=aws and MPC_KMS_AWS_KEY_ID.",
    )
  }

  const kek = Buffer.from(devKekB64, "base64")
  _kmsInstance = new LocalDevKms(kek)
  return _kmsInstance
}

/** Reset the cached instance — tests only. @internal */
export function _resetKmsInstance(): void {
  _kmsInstance = null
}
