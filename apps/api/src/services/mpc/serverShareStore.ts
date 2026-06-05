// Envelope encryption for the server's MPC key-share at rest.
// Fresh 32-byte DEK + nonce per encrypt (AES-256-GCM), DEK wrapped by the KMS.
// AAD = "<userId>|<keyId>|<pubkey>|<version>" binds the ciphertext to that
// key/user/version; any mismatch fails GCM auth. Share bytes, DEK, ciphertext
// are never logged. Rotation = rewrap(): decrypt under old version, re-encrypt
// under the new one (new DEK, new AAD).

import { randomBytes, createCipheriv, createDecipheriv } from "crypto"
import type { Kms } from "./kms.js"
import { getKms } from "./kms.js"

export interface EncryptedShare {
  /** AES-256-GCM ciphertext with 16-byte tag appended (length = plaintext + 16). */
  ciphertext: Buffer
  nonce: Buffer
  /** DEK wrapped by the KMS KEK (opaque). */
  wrappedDek: Buffer
  /** Rotation version; must match the AAD version at decrypt. Store with the row. */
  version: number
}

export interface ShareContext {
  userId: number
  keyId: string
  pubkey: string
  /** Bumped on each rewrap. */
  version: number
}

const NONCE_LEN = 12
const TAG_LEN = 16
const DEK_LEN = 32
const ALGORITHM = "aes-256-gcm" as const

// Binds the ciphertext to one (userId, keyId, pubkey, version); any mismatch
// at decrypt fails GCM auth.
function buildAad(ctx: ShareContext): Buffer {
  return Buffer.from(`${ctx.userId}|${ctx.keyId}|${ctx.pubkey}|${ctx.version}`)
}

export async function encryptShare(
  ctx: ShareContext,
  shareBytes: Buffer,
  kms: Kms = getKms(),
): Promise<EncryptedShare> {
  const dek = randomBytes(DEK_LEN)
  const nonce = randomBytes(NONCE_LEN)
  const aad = buildAad(ctx)

  const cipher = createCipheriv(ALGORITHM, dek, nonce)
  cipher.setAAD(aad)

  const ciphertext = Buffer.concat([cipher.update(shareBytes), cipher.final()])
  const tag = cipher.getAuthTag()

  const wrappedDek = await kms.wrapDek(dek, { keyId: ctx.keyId, version: ctx.version })

  // [ ciphertext | 16-byte tag ]
  const ciphertextWithTag = Buffer.concat([ciphertext, tag])

  return {
    ciphertext: ciphertextWithTag,
    nonce,
    wrappedDek,
    version: ctx.version,
  }
}

// ctx must match the fields used at encrypt (or last rewrap); any mismatch
// fails GCM auth and throws.
export async function decryptShare(
  ctx: ShareContext,
  enc: EncryptedShare,
  kms: Kms = getKms(),
): Promise<Buffer> {
  if (enc.version !== ctx.version) {
    throw new Error(
      `decryptShare: version mismatch — envelope version=${enc.version}, ctx version=${ctx.version}`,
    )
  }

  const dek = await kms.unwrapDek(enc.wrappedDek, { keyId: ctx.keyId, version: ctx.version })
  const aad = buildAad(ctx)

  const ciphertextLen = enc.ciphertext.length - TAG_LEN
  if (ciphertextLen <= 0) {
    throw new Error("decryptShare: ciphertext field is too short to contain a valid GCM tag")
  }
  const ciphertext = enc.ciphertext.subarray(0, ciphertextLen)
  const tag = enc.ciphertext.subarray(ciphertextLen)

  const decipher = createDecipheriv(ALGORITHM, dek, enc.nonce)
  decipher.setAAD(aad)
  decipher.setAuthTag(tag)

  try {
    return Buffer.concat([decipher.update(ciphertext), decipher.final()])
  } catch {
    // Never put dek, ciphertext, or share bytes in the error.
    throw new Error(
      "decryptShare: GCM authentication failed — " +
        `userId=${ctx.userId} keyId=${ctx.keyId} version=${ctx.version} ` +
        "(tampered AAD field, corrupted ciphertext/tag, or wrong KEK)",
    )
  }
}

// Re-encrypt under a new version (new DEK, new AAD). After this, callers must
// use { ...ctx, version: newVersion }; the old envelope no longer verifies.
export async function rewrap(
  ctx: ShareContext,
  enc: EncryptedShare,
  newVersion: number,
  kms: Kms = getKms(),
): Promise<EncryptedShare> {
  const plaintext = await decryptShare(ctx, enc, kms)
  const newCtx: ShareContext = { ...ctx, version: newVersion }
  return encryptShare(newCtx, plaintext, kms)
}
