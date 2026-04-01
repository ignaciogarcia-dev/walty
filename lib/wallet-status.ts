import { getStoredWallet, clearStoredWallet } from "./wallet-store";

export type LinkedAddress = {
  id: number;
  userId: number;
  address: string;
};

export type InitialWalletStatus =
  | "new"
  | "locked"
  | "recoverable"
  | "invalid-local";

type LinkedAddressesResult = {
  addresses: LinkedAddress[];
  isAuthenticated: boolean;
};

const STATUS_CACHE_TTL_MS = 5000;
let cachedStatus: { value: InitialWalletStatus; expiresAt: number } | null =
  null;
let inFlightStatusPromise: Promise<InitialWalletStatus> | null = null;

function normalizeAddress(address: string): string {
  return address.trim().toLowerCase();
}

/**
 * Fetches the user's linked addresses from the server
 * @returns Array of linked addresses, or empty array on error
 */
export async function fetchLinkedAddresses(): Promise<LinkedAddressesResult | null> {
  const res = await fetch("/api/addresses");
  if (res.status === 401) {
    return { addresses: [], isAuthenticated: false };
  }
  if (!res.ok) {
    return null;
  }

  const {
    data: { addresses },
  } = await res.json();
  if (!Array.isArray(addresses)) {
    return null;
  }

  return {
    addresses: addresses as LinkedAddress[],
    isAuthenticated: true,
  };
}

/**
 * Checks if a wallet address belongs to the user's linked addresses
 */
export function isAddressLinked(
  address: string,
  linkedAddresses: LinkedAddress[],
): boolean {
  return linkedAddresses.some(
    (addr) => normalizeAddress(addr.address) === normalizeAddress(address),
  );
}

/**
 * Determines the initial wallet status based on:
 * - User's linked addresses in the database
 * - Wallet stored in IndexedDB (or localStorage for v1 migration)
 *
 * @returns "new" | "locked" | "recoverable" | "invalid-local"
 */
export async function determineWalletStatus(
  options: { force?: boolean } = {},
): Promise<InitialWalletStatus> {
  const now = Date.now();
  if (!options.force && cachedStatus && cachedStatus.expiresAt > now) {
    return cachedStatus.value;
  }

  if (options.force) {
    cachedStatus = null;
    inFlightStatusPromise = null;
  }

  if (inFlightStatusPromise) {
    return inFlightStatusPromise;
  }

  inFlightStatusPromise = (async () => {
    try {
      const [stored, linkedResult] = await Promise.all([
        getStoredWallet(),
        fetchLinkedAddresses(),
      ]);

      // Keep local wallet intact until we can confirm the authenticated identity.
      if (!linkedResult || !linkedResult.isAuthenticated) {
        const status = stored ? "locked" : "new";
        cachedStatus = {
          value: status,
          expiresAt: Date.now() + STATUS_CACHE_TTL_MS,
        };
        return status;
      }

      const linkedAddresses = linkedResult.addresses;
      const hasLinkedAddresses = linkedAddresses.length > 0;

      if (!hasLinkedAddresses) {
        // Authenticated user with no linked addresses is the only true "new" case.
        await clearStoredWallet();
        cachedStatus = {
          value: "new",
          expiresAt: Date.now() + STATUS_CACHE_TTL_MS,
        };
        return "new";
      }

      if (stored) {
        if (isAddressLinked(stored.address, linkedAddresses)) {
          cachedStatus = {
            value: "locked",
            expiresAt: Date.now() + STATUS_CACHE_TTL_MS,
          };
          return "locked";
        }

        cachedStatus = {
          value: "invalid-local",
          expiresAt: Date.now() + STATUS_CACHE_TTL_MS,
        };
        return "invalid-local";
      }

      cachedStatus = {
        value: "recoverable",
        expiresAt: Date.now() + STATUS_CACHE_TTL_MS,
      };
      return "recoverable";
    } catch {
      const stored = await getStoredWallet().catch(() => null);
      const status = stored ? "locked" : "new";
      cachedStatus = {
        value: status,
        expiresAt: Date.now() + STATUS_CACHE_TTL_MS,
      };
      return status;
    } finally {
      inFlightStatusPromise = null;
    }
  })();

  return inFlightStatusPromise;
}
