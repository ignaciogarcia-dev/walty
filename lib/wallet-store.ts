import type { EncryptedSeed } from "@/lib/crypto"

export type StoredWallet = {
  encrypted: EncryptedSeed
  address: string
}

export function getStoredWallet(): StoredWallet | null {
  const stored = localStorage.getItem("wallet")
  if (!stored) return null
  return JSON.parse(stored) as StoredWallet
}

export function saveWallet(data: StoredWallet) {
  localStorage.setItem("wallet", JSON.stringify(data))
}
