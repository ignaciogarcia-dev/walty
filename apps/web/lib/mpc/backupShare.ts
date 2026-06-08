// Backup-share export/verify/zeroize lifecycle.
//
// INVARIANT: the backup share NEVER touches deviceShareStore, wallet-store, or
// any IndexedDB write path (no storage imports here). It's returned to the caller as a
// serialisable blob for offline export (download/print), never persisted.
// finalizeBackupShare enforces the order: export → verify(true) → zeroize.
//
// Single-layer AES-GCM keyed by PBKDF2(recoveryPassword), not encryptSeedV3:
// the v3 Device Key layer is for PIN rotation on a persisted share (this blob
// is one-shot, never re-wrapped), and validatePin rejects the long non-numeric
// passphrases used as recovery passwords.

// Serialisable encrypted blob carrying the backup share (party 2). Byte arrays
// are base64url so it's safe for JSON, QR codes, or printed paper backups.
//
// v2 adds keyId + generation: every refresh/recover advances the DKLS polynomial
// (all three shares re-randomize, group pubkey unchanged), which silently makes
// any previously-exported kit incompatible. Tagging the generation lets the
// server reject a stale kit with a clear "outdated" error instead of a cryptic
// "Invalid key refresh" crash, and forces a fresh kit to be re-issued on every
// advance. v1 kits (no generation) are still importable for backward compat.
export interface BackupExport {
  /** AES-GCM ciphertext of the raw backup share bytes, base64url. */
  ciphertext: string
  /** 12-byte AES-GCM IV, base64url. */
  iv: string
  /** 16-byte PBKDF2 salt, base64url. */
  salt: string
  /** Format tag — callers should reject unknown formats. */
  format: "walty-backup-share-v1" | "walty-backup-share-v2"
  /** MPC key this backup share belongs to (v2+). */
  keyId?: string
  /** DKLS polynomial generation = mpc_keys.version this share was minted at (v2+). */
  generation?: number
}

/** Provenance written into a v2 kit so a stale kit can be detected on recovery. */
export interface BackupMeta {
  keyId: string
  generation: number
}

const BACKUP_KDF_ITERATIONS = 600_000
const BACKUP_KDF_HASH = "SHA-256"

function toBase64url(bytes: Uint8Array): string {
  let s = ""
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i])
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "")
}

function fromBase64url(s: string): Uint8Array<ArrayBuffer> {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/")
  const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4)
  const bin = atob(padded)
  const out = new Uint8Array(bin.length) as Uint8Array<ArrayBuffer>
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

/** Derive an AES-GCM-256 key from the recovery password via PBKDF2. */
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

/**
 * Encrypt the backup share under a recovery password. Unlike the device PIN,
 * the password is unconstrained — encourage long human-memorable passphrases.
 *
 * @param backupShareBytes  Raw serialised backup(2) keyshare bytes.
 * @param recoveryPassword  Recovery passphrase chosen by the user.
 * @param meta  keyId + generation; when present a v2 kit is written so a stale
 *   kit can be detected on recovery. Omit only for legacy/test callers.
 */
export async function exportBackupShare(
  backupShareBytes: Uint8Array,
  recoveryPassword: string,
  meta?: BackupMeta,
): Promise<BackupExport> {
  const salt = crypto.getRandomValues(new Uint8Array(16)) as Uint8Array<ArrayBuffer>
  const iv = crypto.getRandomValues(new Uint8Array(12)) as Uint8Array<ArrayBuffer>
  const key = await deriveBackupKey(recoveryPassword, salt, ["encrypt"])
  const ciphertextBuf = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    backupShareBytes as Uint8Array<ArrayBuffer>,
  )
  const base = {
    ciphertext: toBase64url(new Uint8Array(ciphertextBuf)),
    iv: toBase64url(iv),
    salt: toBase64url(salt),
  }
  return meta
    ? { ...base, format: "walty-backup-share-v2", keyId: meta.keyId, generation: meta.generation }
    : { ...base, format: "walty-backup-share-v1" }
}

/**
 * Decrypt a BackupExport. The returned plaintext is the CALLER's to zeroize
 * once no longer needed; this module only zeroizes copies it makes internally.
 *
 * @throws "Invalid recovery password" on wrong password or tampered blob
 *   (AES-GCM auth failure).
 */
export async function importBackupShare(
  exp: BackupExport,
  recoveryPassword: string,
): Promise<Uint8Array> {
  if (exp.format !== "walty-backup-share-v1" && exp.format !== "walty-backup-share-v2") {
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

/** True only if the BackupExport decrypts and round-trips byte-for-byte. */
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
    zeroizeShare(decrypted)
    return false
  }
  let diff = 0
  for (let i = 0; i < originalBytes.length; i++) {
    diff |= decrypted[i] ^ originalBytes[i]
  }
  // Wipe the transient plaintext copy we decrypted; caller owns originalBytes.
  zeroizeShare(decrypted)
  return diff === 0
}

/**
 * Best-effort zeroize: overwrites the given view with zeros. The engine may
 * have already copied the underlying buffer (slice, GC relocation, WASM linear
 * memory) — no native zeroing exists on the platform, so this is all we can do.
 */
export function zeroizeShare(buf: Uint8Array): void {
  buf.fill(0)
}

/**
 * export → verify → zeroize, in that order. Returns the BackupExport to
 * download/print. Throws if verification fails — but zeroizes the buffer first,
 * always. Never persisted to storage.
 */
export async function finalizeBackupShare(
  backupShareBytes: Uint8Array,
  recoveryPassword: string,
  meta?: BackupMeta,
): Promise<BackupExport> {
  const exported = await exportBackupShare(backupShareBytes, recoveryPassword, meta)

  let verified: boolean
  try {
    verified = await verifyBackupExport(exported, recoveryPassword, backupShareBytes)
  } catch (err) {
    // Zeroize even when verification throws.
    zeroizeShare(backupShareBytes)
    throw err
  }

  zeroizeShare(backupShareBytes)

  if (!verified) {
    throw new Error(
      "finalizeBackupShare: export verification failed — the encrypted backup did not round-trip to the original bytes",
    )
  }

  return exported
}
