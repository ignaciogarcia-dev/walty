export type EncryptedSeed = {
  ciphertext: string
  iv: string
  salt: string
  version: 1
}

// Used for server-side PIN-based backups (version 2).
// key = PBKDF2(pin + serverChallenge, salt) — offline brute force requires the server pepper.
export type PinEncryptedSeed = {
  ciphertext: string
  iv: string
  salt: string
  version: 2
}

function toBase64(bytes: Uint8Array) {
  return btoa(String.fromCharCode(...bytes))
}

function fromBase64(base64: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))
}

export async function encryptSeed(mnemonic: string, password: string): Promise<EncryptedSeed> {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const key = await deriveKey(password, salt)

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

  const key = await deriveKey(password, salt)

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

export async function encryptSeedWithPin(
  mnemonic: string,
  pin: string,
  challenge: string,
): Promise<PinEncryptedSeed> {
  const salt = crypto.getRandomValues(new Uint8Array(16)) as Uint8Array<ArrayBuffer>
  const iv = crypto.getRandomValues(new Uint8Array(12)) as Uint8Array<ArrayBuffer>
  const key = await derivePinKey(pin, challenge, salt)

  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(mnemonic),
  )

  return {
    ciphertext: toBase64(new Uint8Array(ciphertext)),
    iv: toBase64(iv),
    salt: toBase64(salt),
    version: 2,
  }
}

export async function decryptSeedWithPin(
  encrypted: PinEncryptedSeed,
  pin: string,
  challenge: string,
): Promise<string> {
  const salt = fromBase64(encrypted.salt)
  const iv = fromBase64(encrypted.iv)
  const ciphertext = fromBase64(encrypted.ciphertext)

  const key = await derivePinKey(pin, challenge, salt)

  try {
    const plaintext = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv },
      key,
      ciphertext,
    )
    return new TextDecoder().decode(plaintext)
  } catch {
    throw new Error("Invalid PIN")
  }
}

async function derivePinKey(pin: string, challenge: string, salt: Uint8Array<ArrayBuffer>) {
  // Mix PIN with server challenge so offline brute force requires the server pepper
  const material = pin + challenge
  const baseKey = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(material),
    "PBKDF2",
    false,
    ["deriveKey"],
  )

  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt,
      iterations: 210000,
      hash: "SHA-256",
    },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  )
}

async function deriveKey(password: string, salt: Uint8Array<ArrayBuffer>) {
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
      iterations: 210000,
      hash: "SHA-256",
    },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  )
}
