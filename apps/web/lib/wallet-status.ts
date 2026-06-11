import { getStoredWallet, clearStoredWallet } from "./wallet-store";
import { getDeviceShareMeta, clearDeviceShare } from "./mpc/deviceShareStore";
import { unwrap } from "./api/unwrap";

async function getLocalCustody(): Promise<{ address: string } | null> {
  const legacySeed = await getStoredWallet();
  if (legacySeed) return { address: legacySeed.address };
  const share = await getDeviceShareMeta();
  if (share) return { address: share.address };
  return null;
}

type MpcKeyResult = {
  keyId: string | null;
  address: string | null;
};

export type InitialWalletStatus =
  | "new"
  | "locked"
  | "recoverable"
  | "invalid-local";

const STATUS_CACHE_TTL_MS = 5000;
let cachedStatus: { value: InitialWalletStatus; expiresAt: number } | null =
  null;
let inFlightStatusPromise: Promise<InitialWalletStatus> | null = null;

function normalizeAddress(address: string): string {
  return address.trim().toLowerCase();
}

async function fetchMpcKey(): Promise<MpcKeyResult | null> {
  const res = await fetch("/api/mpc-key");
  if (res.status === 401) {
    return null;
  }
  if (!res.ok) {
    return null;
  }
  return unwrap<MpcKeyResult>(await res.json());
}

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
      const [local, mpcKey] = await Promise.all([
        getLocalCustody(),
        fetchMpcKey(),
      ]);

      if (!mpcKey?.keyId || !mpcKey.address) {
        await clearStoredWallet();
        await clearDeviceShare();
        cachedStatus = {
          value: "new",
          expiresAt: Date.now() + STATUS_CACHE_TTL_MS,
        };
        return "new";
      }

      if (!local) {
        cachedStatus = {
          value: "recoverable",
          expiresAt: Date.now() + STATUS_CACHE_TTL_MS,
        };
        return "recoverable";
      }

      const status =
        normalizeAddress(local.address) === normalizeAddress(mpcKey.address)
          ? "locked"
          : "invalid-local";
      cachedStatus = {
        value: status,
        expiresAt: Date.now() + STATUS_CACHE_TTL_MS,
      };
      return status;
    } catch {
      const local = await getLocalCustody().catch(() => null);
      const status = local ? "locked" : "new";
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
