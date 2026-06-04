// apps/api/src/services/mpc/serverShareStore.ts
//
// Envelope encryption for the server's MPC key-share at rest.
//
// Security design:
//   - Each share is encrypted with a fresh random 32-byte DEK (AES-256-GCM).
//   - The DEK is wrapped by the KMS using the caller-provided Kms implementation.
//   - AAD = "<userId>|<keyId>|<pubkey>|<version>" binds the ciphertext to the
//     specific key/user/rotation-version so any mismatch causes GCM auth failure.
//   - The share bytes, DEK, and ciphertext are NEVER logged.
//
// Key rotation (rewrap):
//   Because AAD embeds the version, the existing ciphertext cannot be verified
//   under a new AAD without re-encrypting. rewrap() decrypts with the old context
//   and re-encrypts under the new version context. The DEK is freshly generated
//   on each encryptShare call, so rewrap produces a new DEK as well.

import { randomBytes, createCipheriv, createDecipheriv } from "crypto"
import type { Kms } from "./kms.js"
import { getKms } from "./kms.js"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface EncryptedShare {
  /** AES-256-GCM ciphertext with 16-byte GCM auth tag appended. Length = plaintext + 16. */
  ciphertext: Buffer
  /** 12-byte random nonce used for AES-256-GCM. */
  nonce: Buffer
  /** The DEK, wrapped by the KMS KEK (opaque bytes). */
  wrappedDek: Buffer
  /**
   * Key-rotation version. Must match the version used in AAD during decrypt.
   * Store this alongside the ciphertext in your DB row.
   */
  version: number
}

export interface ShareContext {
  /** Owner's user ID from the database. */
  userId: number
  /** Stable identifier for this MPC key (e.g. a UUID stored in the DB row). */
  keyId: string
  /** Compressed or uncompressed public key hex — used in AAD for binding. */
  pubkey: string
  /** Rotation version — incremented on each rewrap. */
  version: number
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const NONCE_LEN = 12 // AES-GCM standard nonce size (bytes)
const TAG_LEN = 16 // AES-GCM authentication tag size (128-bit = 16 bytes)
const DEK_LEN = 32 // AES-256 key size in bytes
const ALGORITHM = "aes-256-gcm" as const

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Builds the Additional Authenticated Data buffer from a context.
 * This ties the ciphertext to exactly one (userId, keyId, pubkey, version).
 * Any field mismatch on decrypt causes GCM authentication to fail.
 *
 * Format: "<userId>|<keyId>|<pubkey>|<version>"
 */
function buildAad(ctx: ShareContext): Buffer {
  return Buffer.from(`${ctx.userId}|${ctx.keyId}|${ctx.pubkey}|${ctx.version}`)
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Encrypts a share buffer under a fresh DEK wrapped by the KMS.
 *
 * @param ctx        Context whose fields are bound into the AAD.
 * @param shareBytes The raw MPC share bytes to encrypt (~247 KB).
 * @param kms        KMS instance; defaults to getKms() (env-configured).
 * @returns          Encrypted envelope suitable for at-rest storage.
 */
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

  // Wrap the DEK via KMS before the raw DEK leaves this scope.
  const wrappedDek = await kms.wrapDek(dek, { keyId: ctx.keyId, version: ctx.version })

  // Store ciphertext with tag appended: [ encrypted_share | 16-byte tag ]
  const ciphertextWithTag = Buffer.concat([ciphertext, tag])

  // shareBytes, dek are not logged — they go out of scope here.
  return {
    ciphertext: ciphertextWithTag,
    nonce,
    wrappedDek,
    version: ctx.version,
  }
}

/**
 * Decrypts a previously encrypted share.
 *
 * The caller MUST supply the exact same `ctx` fields used during encryption
 * (or after the last rewrap). Any mismatch → GCM authentication failure → throws.
 *
 * @param ctx  Must exactly match the context used during encrypt/rewrap.
 * @param enc  The encrypted share envelope from storage.
 * @param kms  KMS instance; defaults to getKms().
 */
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

  // Split the stored [ ciphertext | tag ] back apart
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
    // Do NOT include dek, ciphertext, or share bytes in the error message.
    throw new Error(
      "decryptShare: GCM authentication failed — " +
        `userId=${ctx.userId} keyId=${ctx.keyId} version=${ctx.version} ` +
        "(tampered AAD field, corrupted ciphertext/tag, or wrong KEK)",
    )
  }
}

/**
 * Rotates to a new version by decrypting the current share and re-encrypting
 * under the new version context (with a new DEK and new AAD).
 *
 * After rotation, callers must use `{ ...ctx, version: newVersion }` for all
 * subsequent decryptions. The old envelope is no longer valid.
 *
 * @param ctx        The CURRENT context (before rotation).
 * @param enc        The CURRENT encrypted envelope.
 * @param newVersion The new version number (must differ from ctx.version).
 * @param kms        KMS instance; defaults to getKms().
 */
export async function rewrap(
  ctx: ShareContext,
  enc: EncryptedShare,
  newVersion: number,
  kms: Kms = getKms(),
): Promise<EncryptedShare> {
  // Decrypt with the current (old) context
  const plaintext = await decryptShare(ctx, enc, kms)

  // Re-encrypt under the new version
  const newCtx: ShareContext = { ...ctx, version: newVersion }
  return encryptShare(newCtx, plaintext, kms)
}
