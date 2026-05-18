import type { EncryptedSeed, EncryptedSeedV3 } from "@/lib/crypto"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** V1 wallet stored in localStorage (legacy). */
export type StoredWalletV1 = {
  encrypted: EncryptedSeed
  address: string
}

/** V3 wallet stored in IndexedDB. */
export type StoredWalletV3 = {
  encrypted: EncryptedSeedV3
  address: string
}

/** Union of all versions consumers may encounter. */
export type StoredWallet = StoredWalletV1 | StoredWalletV3

// ---------------------------------------------------------------------------
// IndexedDB helpers
// ---------------------------------------------------------------------------

const DB_NAME = "walty"
const DB_VERSION = 1
const STORE_NAME = "wallet"
const WALLET_KEY = "main"

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

async function idbGet<T>(key: string): Promise<T | null> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly")
    const store = tx.objectStore(STORE_NAME)
    const req = store.get(key)
    req.onsuccess = () => resolve((req.result as T) ?? null)
    req.onerror = () => reject(req.error)
  })
}

async function idbPut<T>(key: string, value: T): Promise<void> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite")
    const store = tx.objectStore(STORE_NAME)
    const req = store.put(value, key)
    req.onsuccess = () => resolve()
    req.onerror = () => reject(req.error)
  })
}

async function idbDelete(key: string): Promise<void> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite")
    const store = tx.objectStore(STORE_NAME)
    const req = store.delete(key)
    req.onsuccess = () => resolve()
    req.onerror = () => reject(req.error)
  })
}

// ---------------------------------------------------------------------------
// Public API (async — IndexedDB is async by nature)
// ---------------------------------------------------------------------------

/**
 * Read the stored wallet from IndexedDB.
 * Falls back to localStorage for v1 migration — if found there, returns it
 * (caller is responsible for upgrading to v3 and saving back).
 */
export async function getStoredWallet(): Promise<StoredWallet | null> {
  if (typeof window === "undefined") return null

  // Try IndexedDB first
  try {
    const wallet = await idbGet<StoredWalletV3>(WALLET_KEY)
    if (wallet) return wallet
  } catch {
    // IndexedDB unavailable — fall through to localStorage
  }

  // Fallback: check localStorage for v1 wallet (migration path)
  try {
    const raw = localStorage.getItem("wallet")
    if (!raw) return null
    const parsed = JSON.parse(raw) as StoredWalletV1
    if (parsed.encrypted && parsed.address) return parsed
  } catch {
    // Corrupt data
  }

  return null
}

/** Save a v3 wallet to IndexedDB. Also clears any legacy localStorage entry. */
export async function saveWallet(data: StoredWallet): Promise<void> {
  if (typeof window === "undefined") return

  try {
    await idbPut(WALLET_KEY, data)
    // Clean up legacy localStorage if present
    localStorage.removeItem("wallet")
  } catch {
    // If IndexedDB fails, fall back to localStorage for v1 only
    if (data.encrypted.version === 1) {
      localStorage.setItem("wallet", JSON.stringify(data))
    }
  }
}

/** Remove stored wallet from both IndexedDB and localStorage. */
export async function clearStoredWallet(): Promise<void> {
  if (typeof window === "undefined") return

  try {
    await idbDelete(WALLET_KEY)
  } catch {
    // Best effort
  }
  localStorage.removeItem("wallet")
}

// ---------------------------------------------------------------------------
// Synchronous read (for status checks that cannot be async)
// ---------------------------------------------------------------------------

/**
 * Synchronous check — only reads localStorage (v1).
 * Used by `determineWalletStatus` as a quick check before the async path.
 * After migration to v3, this returns null — the async path is authoritative.
 */
export function getStoredWalletSync(): StoredWalletV1 | null {
  if (typeof window === "undefined") return null

  try {
    const raw = localStorage.getItem("wallet")
    if (!raw) return null
    return JSON.parse(raw) as StoredWalletV1
  } catch {
    return null
  }
}
