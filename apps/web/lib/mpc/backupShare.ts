// apps/web/lib/mpc/backupShare.ts
//
// Backup-share export / verify / zeroize lifecycle (Task 8 — Spec Req #3).
//
// INVARIANT: This module NEVER imports or calls deviceShareStore, wallet-store,
// or any IndexedDB write path. The backup share is returned to the caller as a
// serialisable blob for offline export (download / print). It is never persisted
// to browser storage.
//
// Required order enforced by finalizeBackupShare:
//   exportBackupShare → verifyBackupExport (must return true) → zeroizeShare
//
// Crypto: AES-GCM with a one-layer PBKDF2 KEK (600 k iters / SHA-256) derived
// from the recovery password. We intentionally bypass encryptSeedV3 / the v3
// two-layer hierarchy because:
//   1. The v3 Device Key layer is designed for PIN rotation on a persisted
//      share; the backup export is a one-shot, never-stored blob.
//   2. encryptSeedV3 calls validatePin which rejects non-numeric / long
//      passphrases — recovery passwords are unconstrained human phrases.
// The envelope shape is documented below as BackupExport and is structurally
// analogous to the v3 envelope but single-layer keyed by the recovery password.

// ---------------------------------------------------------------------------
// Serialisable export shape
// ---------------------------------------------------------------------------

/**
 * A serialisable encrypted blob carrying the backup share (party 2).
 *
 * Shape mirrors the v3 seed envelope for auditability, but uses a single
 * AES-GCM layer keyed directly by PBKDF2(recoveryPassword). There is no
 * separate Device Key layer because the backup export is never re-wrapped.
 *
 * All byte arrays are base64url-encoded strings so the object is safe for
 * JSON, QR codes, or printed paper backups.
 */
export interface BackupExport {
  /** AES-GCM ciphertext of the raw backup share bytes, base64url. */
  ciphertext: string
  /** 12-byte AES-GCM IV, base64url. */
  iv: string
  /** 16-byte PBKDF2 salt, base64url. */
  salt: string
  /** Format tag — callers should reject unknown formats. */
  format: "walty-backup-share-v1"
}

// ---------------------------------------------------------------------------
// Internal crypto helpers
// ---------------------------------------------------------------------------

const BACKUP_KDF_ITERATIONS = 600_000
const BACKUP_KDF_HASH = "SHA-256"

function toBase64url(bytes: Uint8Array): string {
  // Binary-safe btoa + standard base64url substitution.
  let s = ""
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i])
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "")
}

function fromBase64url(s: string): Uint8Array<ArrayBuffer> {
  // Restore standard base64 padding.
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/")
  const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4)
  const bin = atob(padded)
  const out = new Uint8Array(bin.length) as Uint8Array<ArrayBuffer>
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

/**
 * Derive an AES-GCM-256 key from the recovery password using PBKDF2.
 * Usage includes "encrypt" or "decrypt" depending on the direction.
 */
async function deriveBackupKey(
  password: string,
  salt: Uint8Array<ArrayBuffer>,
  usage: KeyUsage[],
): Promise<CryptoKey> {
  const baseKey = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveKey"],
  )
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt,
      iterations: BACKUP_KDF_ITERATIONS,
      hash: BACKUP_KDF_HASH,
    },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    usage,
  )
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Encrypt the backup share under a recovery password.
 *
 * The recovery password is unconstrained (unlike the device PIN). Callers
 * should encourage long human-memorable passphrases.
 *
 * @param backupShareBytes  Raw serialised backup(2) keyshare bytes.
 * @param recoveryPassword  Recovery passphrase chosen by the user.
 */
export async function exportBackupShare(
  backupShareBytes: Uint8Array,
  recoveryPassword: string,
): Promise<BackupExport> {
  const salt = crypto.getRandomValues(new Uint8Array(16)) as Uint8Array<ArrayBuffer>
  const iv = crypto.getRandomValues(new Uint8Array(12)) as Uint8Array<ArrayBuffer>
  const key = await deriveBackupKey(recoveryPassword, salt, ["encrypt"])
  const ciphertextBuf = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    backupShareBytes as Uint8Array<ArrayBuffer>,
  )
  return {
    ciphertext: toBase64url(new Uint8Array(ciphertextBuf)),
    iv: toBase64url(iv),
    salt: toBase64url(salt),
    format: "walty-backup-share-v1",
  }
}

/**
 * Decrypt a BackupExport using the recovery password.
 *
 * OWNERSHIP: the returned Uint8Array holds the plaintext backup share. The
 * CALLER owns its lifecycle and MUST `zeroizeShare` it as soon as it is no
 * longer needed (e.g. after re-importing it into a fresh keygen/refresh). This
 * module only zeroizes copies it creates internally (see verifyBackupExport).
 *
 * @throws "Invalid recovery password" when the password is wrong or the blob
 *   is tampered (AES-GCM authentication failure).
 */
export async function importBackupShare(
  exp: BackupExport,
  recoveryPassword: string,
): Promise<Uint8Array> {
  if (exp.format !== "walty-backup-share-v1") {
    throw new Error(`importBackupShare: unknown format "${exp.format}"`)
  }
  const salt = fromBase64url(exp.salt)
  const iv = fromBase64url(exp.iv)
  const ciphertext = fromBase64url(exp.ciphertext)
  const key = await deriveBackupKey(recoveryPassword, salt, ["decrypt"])
  try {
    const plaintext = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv },
      key,
      ciphertext,
    )
    return new Uint8Array(plaintext)
  } catch {
    throw new Error("Invalid recovery password")
  }
}

/**
 * Verify that a BackupExport decrypts correctly AND round-trips to the exact
 * original bytes. Returns true only on a byte-perfect match.
 */
export async function verifyBackupExport(
  exp: BackupExport,
  recoveryPassword: string,
  originalBytes: Uint8Array,
): Promise<boolean> {
  let decrypted: Uint8Array
  try {
    decrypted = await importBackupShare(exp, recoveryPassword)
  } catch {
    return false
  }
  if (decrypted.length !== originalBytes.length) {
    // Still wipe the transient plaintext copy we just decrypted.
    zeroizeShare(decrypted)
    return false
  }
  // Constant-time-ish comparison (best-effort in JS — V8 may short-circuit,
  // but for a correctness check rather than a timing-sensitive path this is
  // acceptable).
  let diff = 0
  for (let i = 0; i < originalBytes.length; i++) {
    diff |= decrypted[i] ^ originalBytes[i]
  }
  // Zeroize the transient decrypted copy this function created — it is a second
  // in-memory plaintext of the backup share and must not linger after the
  // round-trip check. (The caller's `originalBytes` is owned by the caller.)
  zeroizeShare(decrypted)
  return diff === 0
}

/**
 * Overwrite a share buffer in place with zeros (best-effort zeroization).
 *
 * Caveats: JS engines may have already copied the Uint8Array's underlying
 * ArrayBuffer (e.g. typed-array slice, GC relocation, or WASM linear-memory
 * copies from the DKG boundary). This call zeroes the *given view* and is the
 * best defence available without native zeroing support in the platform.
 */
export function zeroizeShare(buf: Uint8Array): void {
  buf.fill(0)
}

/**
 * Export + verify + zeroize the backup share in the required order.
 *
 * Returns the serialisable BackupExport for the user to download or print.
 * THROWS if verification fails (and still zeroizes the buffer regardless).
 * Never persists the backup share to IndexedDB or any browser storage.
 *
 * Enforced order:
 *   1. exportBackupShare  — encrypt under recoveryPassword
 *   2. verifyBackupExport — decrypt + compare to originalBytes (must be true)
 *   3. zeroizeShare       — overwrite buffer with zeros
 *
 * If step 2 fails, step 3 still runs before the error is thrown.
 */
export async function finalizeBackupShare(
  backupShareBytes: Uint8Array,
  recoveryPassword: string,
): Promise<BackupExport> {
  // Step 1 — export (encrypt).
  const exported = await exportBackupShare(backupShareBytes, recoveryPassword)

  // Step 2 — verify round-trip (always runs before zeroize, even if it throws).
  let verified: boolean
  try {
    verified = await verifyBackupExport(exported, recoveryPassword, backupShareBytes)
  } catch (err) {
    // Unexpected error during verification — zeroize then re-throw.
    zeroizeShare(backupShareBytes)
    throw err
  }

  // Step 3 — zeroize (unconditional).
  zeroizeShare(backupShareBytes)

  if (!verified) {
    throw new Error(
      "finalizeBackupShare: export verification failed — the encrypted backup did not round-trip to the original bytes",
    )
  }

  return exported
}
