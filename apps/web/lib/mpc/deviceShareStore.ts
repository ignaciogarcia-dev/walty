// apps/web/lib/mpc/deviceShareStore.ts
//
// Encrypt-at-rest persistence for the MPC DEVICE share (party 0 only).
//
// Mirrors the seed envelope handling in lib/crypto.ts (EncryptedSeedV3: random
// Device Key encrypts the payload, KEK derived from the PIN via PBKDF2 600k
// wraps the Device Key) and the IndexedDB access pattern in lib/wallet-store.ts.
// Here the PIN protects the *device share* blob instead of a mnemonic seed —
// this is the stratum-b storage hook; the full seed→share flow swap is stratum
// c.
//
// IMPORTANT: only the DEVICE share is persisted. The BACKUP share is exported
// and zeroized by Task 8 and is never written here.

import { encryptSeedV3, decryptSeedV3, type EncryptedSeedV3 } from "@/lib/crypto"

// ---------------------------------------------------------------------------
// Stored shape
// ---------------------------------------------------------------------------

/** Device share persisted in IndexedDB, encrypted with the same v3 envelope
 *  used for the seed. The share bytes are base64-wrapped as the "mnemonic"
 *  payload so we reuse the audited crypto.ts primitives verbatim. */
export type StoredDeviceShareV3 = {
  /** v3 envelope whose plaintext is the base64 of the device share bytes. */
  encrypted: EncryptedSeedV3
  /** keyId this share belongs to (mpc_keys.id on the server). */
  keyId: string
  /** Combined public key (0x-hex), for quick lookup without decryption. */
  pubkey: string
  /** Ethereum address derived from the combined public key. */
  address: string
  /** Share schema version (independent of the v3 crypto envelope version). */
  shareVersion: number
}

// ---------------------------------------------------------------------------
// IndexedDB helpers (same DB/store as lib/wallet-store.ts)
// ---------------------------------------------------------------------------

const DB_NAME = "walty"
const DB_VERSION = 1
const STORE_NAME = "wallet"
const DEVICE_SHARE_KEY = "mpc-device-share"

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME)
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

function idbGet<T>(key: string): Promise<T | null> {
  return openDB().then(
    (db) =>
      new Promise<T | null>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, "readonly")
        const req = tx.objectStore(STORE_NAME).get(key)
        req.onsuccess = () => resolve((req.result as T) ?? null)
        req.onerror = () => reject(req.error)
      }),
  )
}

function idbPut<T>(key: string, value: T): Promise<void> {
  return openDB().then(
    (db) =>
      new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, "readwrite")
        const req = tx.objectStore(STORE_NAME).put(value, key)
        req.onsuccess = () => resolve()
        req.onerror = () => reject(req.error)
      }),
  )
}

function idbDelete(key: string): Promise<void> {
  return openDB().then(
    (db) =>
      new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, "readwrite")
        const req = tx.objectStore(STORE_NAME).delete(key)
        req.onsuccess = () => resolve()
        req.onerror = () => reject(req.error)
      }),
  )
}

// ---------------------------------------------------------------------------
// base64 helpers (binary-safe, no spread on large arrays)
// ---------------------------------------------------------------------------

function bytesToBase64(bytes: Uint8Array): string {
  let s = ""
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i])
  return btoa(s)
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface DeviceShareMeta {
  keyId: string
  pubkey: string
  address: string
}

/**
 * Encrypt the device share with the PIN (v3 envelope) and persist it to
 * IndexedDB. Only the device share is stored — never the backup share.
 *
 * @param shareBytes  Raw serialised device(0) keyshare bytes.
 * @param pin         6–8 digit PIN (same policy as the seed).
 * @param meta        keyId/pubkey/address describing the key.
 */
export async function saveDeviceShare(
  shareBytes: Uint8Array,
  pin: string,
  meta: DeviceShareMeta,
): Promise<void> {
  if (typeof indexedDB === "undefined") {
    throw new Error("saveDeviceShare: IndexedDB unavailable")
  }
  const payloadB64 = bytesToBase64(shareBytes)
  const encrypted = await encryptSeedV3(payloadB64, pin)
  const record: StoredDeviceShareV3 = {
    encrypted,
    keyId: meta.keyId,
    pubkey: meta.pubkey,
    address: meta.address,
    shareVersion: 1,
  }
  await idbPut(DEVICE_SHARE_KEY, record)
}

/**
 * Load + decrypt the device share from IndexedDB.
 *
 * @returns The raw device share bytes plus its metadata, or null if none is
 *   stored.
 * @throws "Invalid password" (from crypto.ts) on a wrong PIN.
 */
export async function loadDeviceShare(
  pin: string,
): Promise<{ shareBytes: Uint8Array; meta: DeviceShareMeta } | null> {
  if (typeof indexedDB === "undefined") return null
  const record = await idbGet<StoredDeviceShareV3>(DEVICE_SHARE_KEY)
  if (!record) return null
  const payloadB64 = await decryptSeedV3(record.encrypted, pin)
  const shareBytes = base64ToBytes(payloadB64)
  return {
    shareBytes,
    meta: { keyId: record.keyId, pubkey: record.pubkey, address: record.address },
  }
}

/** Read the device-share metadata without decrypting (no PIN required). */
export async function getDeviceShareMeta(): Promise<DeviceShareMeta | null> {
  if (typeof indexedDB === "undefined") return null
  const record = await idbGet<StoredDeviceShareV3>(DEVICE_SHARE_KEY)
  if (!record) return null
  return { keyId: record.keyId, pubkey: record.pubkey, address: record.address }
}

/** Remove the stored device share. Best-effort. */
export async function clearDeviceShare(): Promise<void> {
  if (typeof indexedDB === "undefined") return
  try {
    await idbDelete(DEVICE_SHARE_KEY)
  } catch {
    /* best effort */
  }
}
