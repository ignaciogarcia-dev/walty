import { getStoredWallet, clearStoredWallet } from "./wallet-store"

export type LinkedAddress = {
  id: number
  userId: number
  address: string
}

/**
 * Fetches the user's linked addresses from the server
 * @returns Array of linked addresses, or empty array on error
 */
export async function fetchLinkedAddresses(): Promise<LinkedAddress[]> {
  try {
    const res = await fetch("/api/addresses")
    if (!res.ok) {
      return []
    }
    const data = await res.json()
    // Validate response structure
    if (!Array.isArray(data.addresses)) {
      return []
    }
    return data.addresses
  } catch (err) {
    console.error("Error fetching linked addresses:", err)
    return []
  }
}

/**
 * Checks if a wallet address belongs to the user's linked addresses
 */
export function isAddressLinked(
  address: string,
  linkedAddresses: LinkedAddress[]
): boolean {
  return linkedAddresses.some(
    (addr) => addr.address.toLowerCase() === address.toLowerCase()
  )
}

/**
 * Clears localStorage if the stored wallet doesn't belong to the current user
 */
export function clearStaleWallet(linkedAddresses: LinkedAddress[]): void {
  const stored = getStoredWallet()
  if (!stored) return

  const addressMatches = isAddressLinked(stored.address, linkedAddresses)
  if (!addressMatches) {
    clearStoredWallet()
  }
}

async function hasServerBackup(): Promise<boolean> {
  try {
    const res = await fetch("/api/wallet/backup")
    if (!res.ok) return false
    const { backup } = await res.json()
    return backup !== null
  } catch {
    return false
  }
}

/**
 * Determines the initial wallet status based on:
 * - User's linked addresses in the database
 * - Wallet stored in localStorage
 * - Server-side encrypted backup
 *
 * @returns "new" | "locked" | "recoverable"
 */
export async function determineWalletStatus(): Promise<
  "new" | "locked" | "recoverable"
> {
  try {
    const linkedAddresses = await fetchLinkedAddresses()
    const hasLinkedAddresses = linkedAddresses.length > 0

    if (!hasLinkedAddresses) {
      // New user - clear any stale localStorage from other users
      clearStoredWallet()
      return "new"
    }

    // User has linked addresses - verify stored wallet belongs to them
    clearStaleWallet(linkedAddresses)

    const stored = getStoredWallet()
    if (stored) {
      // Verify the stored wallet belongs to this user
      if (isAddressLinked(stored.address, linkedAddresses)) {
        return "locked"
      }
      // If we get here, clearStaleWallet should have cleared it, but double-check
      clearStoredWallet()
    }

    // User has linked address but no local wallet — check for server backup
    const backupExists = await hasServerBackup()
    if (backupExists) return "recoverable"

    return "new"
  } catch (err) {
    // On error, fallback to localStorage check
    console.error("Error determining wallet status:", err)
    return getStoredWallet() ? "locked" : "new"
  }
}
