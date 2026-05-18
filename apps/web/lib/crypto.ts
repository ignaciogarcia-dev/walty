import { zeroize } from "./zeroize"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** V1: seed encrypted directly with PBKDF2(password) — legacy, local only. */
export type EncryptedSeed = {
  ciphertext: string
  iv: string
  salt: string
  version: 1
}

/**
 * V3: two-layer encryption (Device Key + KEK).
 *
 * seed  ──encrypt──▶ DK (random 256-bit AES key)
 * DK    ──encrypt──▶ KEK (PBKDF2 600k from PIN)
 *
 * Benefits:
 * - PIN rotation doesn't re-encrypt the seed
 * - Attacker must break 2 layers
 */
export type EncryptedSeedV3 = {
  /** seed encrypted with Device Key */
  encryptedSeed: string
  seedIv: string
  /** Device Key encrypted with KEK */
  encryptedDK: string
  dkIv: string
  /** KDF salt for KEK derivation */
  salt: string
  version: 3
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toBase64(bytes: Uint8Array) {
  return btoa(String.fromCharCode(...bytes))
}

function fromBase64(base64: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))
}

const V1_ITERATIONS = 210_000
const V3_ITERATIONS = 600_000

// ---------------------------------------------------------------------------
// V3: Device Key + KEK hierarchy (primary)
// ---------------------------------------------------------------------------

/** Derive a Key Encryption Key (KEK) from a PIN using PBKDF2 600k. */
async function deriveKEK(pin: string, salt: Uint8Array<ArrayBuffer>): Promise<CryptoKey> {
  const baseKey = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(pin),
    "PBKDF2",
    false,
    ["deriveKey"],
  )

  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt,
      iterations: V3_ITERATIONS,
      hash: "SHA-256",
    },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["wrapKey", "unwrapKey"],
  )
}

/**
 * Encrypt a seed with two-layer encryption.
 *
 * 1. Generate random Device Key (DK)
 * 2. Encrypt seed with DK
 * 3. Derive KEK from PIN
 * 4. Wrap (encrypt) DK with KEK
 */
export async function encryptSeedV3(mnemonic: string, pin: string): Promise<EncryptedSeedV3> {
  validatePin(pin)

  const salt = crypto.getRandomValues(new Uint8Array(16)) as Uint8Array<ArrayBuffer>
  const seedIv = crypto.getRandomValues(new Uint8Array(12))
  const dkIv = crypto.getRandomValues(new Uint8Array(12))

  // 1. Generate random Device Key
  const dk = await crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    true, // extractable — we need to wrap it
    ["encrypt", "decrypt"],
  )

  // 2. Encrypt seed with DK
  const mnemonicBytes = new TextEncoder().encode(mnemonic)
  const encryptedSeedBuf = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: seedIv },
    dk,
    mnemonicBytes,
  )
  // Zeroize the plaintext mnemonic bytes
  zeroize(mnemonicBytes)

  // 3. Derive KEK from PIN
  const kek = await deriveKEK(pin, salt)

  // 4. Wrap DK with KEK
  const encryptedDKBuf = await crypto.subtle.wrapKey(
    "raw",
    dk,
    kek,
    { name: "AES-GCM", iv: dkIv },
  )

  return {
    encryptedSeed: toBase64(new Uint8Array(encryptedSeedBuf)),
    seedIv: toBase64(seedIv),
    encryptedDK: toBase64(new Uint8Array(encryptedDKBuf)),
    dkIv: toBase64(dkIv),
    salt: toBase64(salt),
    version: 3,
  }
}

/**
 * Decrypt a v3 encrypted seed.
 *
 * 1. Derive KEK from PIN
 * 2. Unwrap DK with KEK
 * 3. Decrypt seed with DK
 */
export async function decryptSeedV3(encrypted: EncryptedSeedV3, pin: string): Promise<string> {
  const salt = fromBase64(encrypted.salt)
  const seedIv = fromBase64(encrypted.seedIv)
  const dkIv = fromBase64(encrypted.dkIv)
  const encryptedSeed = fromBase64(encrypted.encryptedSeed)
  const encryptedDK = fromBase64(encrypted.encryptedDK)

  // 1. Derive KEK
  const kek = await deriveKEK(pin, salt)

  // 2. Unwrap DK
  let dk: CryptoKey
  try {
    dk = await crypto.subtle.unwrapKey(
      "raw",
      encryptedDK,
      kek,
      { name: "AES-GCM", iv: dkIv },
      { name: "AES-GCM", length: 256 },
      false, // non-extractable once unwrapped
      ["decrypt"],
    )
  } catch {
    throw new Error("Invalid password")
  }

  // 3. Decrypt seed with DK
  try {
    const plaintext = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: seedIv },
      dk,
      encryptedSeed,
    )
    return new TextDecoder().decode(plaintext)
  } catch {
    throw new Error("Invalid password")
  }
}

/**
 * Re-wrap the Device Key with a new PIN without decrypting the seed.
 * Used for PIN rotation.
 */
export async function reEncryptDK(
  encrypted: EncryptedSeedV3,
  oldPin: string,
  newPin: string,
): Promise<EncryptedSeedV3> {
  const oldSalt = fromBase64(encrypted.salt)
  const dkIv = fromBase64(encrypted.dkIv)
  const encryptedDK = fromBase64(encrypted.encryptedDK)

  // Unwrap DK with old PIN
  const oldKEK = await deriveKEK(oldPin, oldSalt)
  const dk = await crypto.subtle.unwrapKey(
    "raw",
    encryptedDK,
    oldKEK,
    { name: "AES-GCM", iv: dkIv },
    { name: "AES-GCM", length: 256 },
    true, // extractable to re-wrap
    ["encrypt", "decrypt"],
  )

  // Wrap DK with new PIN
  const newSalt = crypto.getRandomValues(new Uint8Array(16)) as Uint8Array<ArrayBuffer>
  const newDkIv = crypto.getRandomValues(new Uint8Array(12))
  const newKEK = await deriveKEK(newPin, newSalt)

  const newEncryptedDK = await crypto.subtle.wrapKey(
    "raw",
    dk,
    newKEK,
    { name: "AES-GCM", iv: newDkIv },
  )

  return {
    ...encrypted,
    encryptedDK: toBase64(new Uint8Array(newEncryptedDK)),
    dkIv: toBase64(newDkIv),
    salt: toBase64(newSalt),
  }
}

// ---------------------------------------------------------------------------
// V1: legacy local encryption (kept for migration)
// ---------------------------------------------------------------------------

export async function encryptSeed(mnemonic: string, password: string): Promise<EncryptedSeed> {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const key = await deriveKeyV1(password, salt)

  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(mnemonic)
  )

  return {
    ciphertext: toBase64(new Uint8Array(ciphertext)),
    iv: toBase64(iv),
    salt: toBase64(salt),
    version: 1,
  }
}

export async function decryptSeed(encrypted: EncryptedSeed, password: string): Promise<string> {
  const salt = fromBase64(encrypted.salt)
  const iv = fromBase64(encrypted.iv)
  const ciphertext = fromBase64(encrypted.ciphertext)

  const key = await deriveKeyV1(password, salt)

  try {
    const plaintext = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv },
      key,
      ciphertext
    )
    return new TextDecoder().decode(plaintext)
  } catch {
    throw new Error("Invalid password")
  }
}

// ---------------------------------------------------------------------------
// PIN validation
// ---------------------------------------------------------------------------

export function validatePin(pin: string): void {
  if (pin.length < 6 || pin.length > 8) {
    throw new Error("PIN must be 6–8 digits")
  }

  if (!/^\d+$/.test(pin)) {
    throw new Error("PIN must be numeric")
  }
}

// ---------------------------------------------------------------------------
// KDF helpers
// ---------------------------------------------------------------------------

async function deriveKeyV1(password: string, salt: Uint8Array<ArrayBuffer>) {
  const baseKey = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveKey"]
  )

  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt,
      iterations: V1_ITERATIONS,
      hash: "SHA-256",
    },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  )
}
