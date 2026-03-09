import { getStoredWallet, clearStoredWallet } from "./wallet-store"

export type LinkedAddress = {
  id: number
  userId: number
  address: string
}

export type InitialWalletStatus =
  | "new"
  | "locked"
  | "recoverable"
  | "invalid-local"

type LinkedAddressesResult = {
  addresses: LinkedAddress[]
  isAuthenticated: boolean
}

function normalizeAddress(address: string): string {
  return address.trim().toLowerCase()
}

/**
 * Fetches the user's linked addresses from the server
 * @returns Array of linked addresses, or empty array on error
 */
export async function fetchLinkedAddresses(): Promise<LinkedAddressesResult | null> {
  try {
    const res = await fetch("/api/addresses")
    if (res.status === 401) {
      return { addresses: [], isAuthenticated: false }
    }
    if (!res.ok) {
      return null
    }

    const data = await res.json()
    if (!Array.isArray(data.addresses)) {
      return null
    }

    return {
      addresses: data.addresses as LinkedAddress[],
      isAuthenticated: true,
    }
  } catch (err) {
    console.error("Error fetching linked addresses:", err)
    return null
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
    (addr) => normalizeAddress(addr.address) === normalizeAddress(address)
  )
}

/**
 * Determines the initial wallet status based on:
 * - User's linked addresses in the database
 * - Wallet stored in localStorage
 *
 * @returns "new" | "locked" | "recoverable" | "invalid-local"
 */
export async function determineWalletStatus(): Promise<InitialWalletStatus> {
  try {
    const stored = getStoredWallet()
    const linkedResult = await fetchLinkedAddresses()

    // Keep local wallet intact until we can confirm the authenticated identity.
    if (!linkedResult || !linkedResult.isAuthenticated) {
      return stored ? "locked" : "new"
    }

    const linkedAddresses = linkedResult.addresses
    const hasLinkedAddresses = linkedAddresses.length > 0

    if (!hasLinkedAddresses) {
      // Authenticated user with no linked addresses is the only true "new" case.
      clearStoredWallet()
      return "new"
    }

    if (stored) {
      if (isAddressLinked(stored.address, linkedAddresses)) {
        return "locked"
      }

      return "invalid-local"
    }

    return "recoverable"
  } catch (err) {
    console.error("Error determining wallet status:", err)
    return getStoredWallet() ? "locked" : "new"
  }
}
