import type { EncryptedSeed } from "@/lib/crypto"

export type StoredWallet = {
  encrypted: EncryptedSeed
  address: string
}

const WALLET_STORAGE_KEY = "wallet"

export function getStoredWallet(): StoredWallet | null {
  if (typeof window === "undefined") return null
  
  const stored = localStorage.getItem(WALLET_STORAGE_KEY)
  if (!stored) return null
  
  try {
    return JSON.parse(stored) as StoredWallet
  } catch {
    // Invalid JSON - clear it
    clearStoredWallet()
    return null
  }
}

export function saveWallet(data: StoredWallet) {
  if (typeof window === "undefined") return
  localStorage.setItem(WALLET_STORAGE_KEY, JSON.stringify(data))
}

export function clearStoredWallet() {
  if (typeof window === "undefined") return
  localStorage.removeItem(WALLET_STORAGE_KEY)
}
