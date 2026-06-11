"use client";

/**
 * useWalletLifecycle
 *
 * Manages the complete wallet lifecycle:
 * create, unlock, lock, MPC recovery, auto-lock.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  getStoredWallet,
  saveWallet,
  type StoredWalletV3,
} from "@/lib/wallet-store";
import {
  determineWalletStatus,
  type InitialWalletStatus,
} from "@/lib/wallet-status";
import { createWallet } from "@/lib/wallet";
import { encryptSeedV3, decryptSeedV3, validatePin } from "@/lib/crypto";
import { getWalletClient } from "@/lib/rpc/getWalletClient";
import { unwrap } from "@/lib/api/unwrap";
import { zeroize } from "@/lib/zeroize";
import {
  createWalletSecurityManager,
  type WalletSecurityManager,
} from "@/lib/wallet/WalletSecurityManager";
import {
  createMpcSecurityManager,
  type MpcSecurityManager,
} from "@/lib/mpc/MpcSecurityManager";
import { getDeviceShareMeta } from "@/lib/mpc/deviceShareStore";
import { getMpcClient } from "@/lib/mpc/getMpcClient";
import { createWalletSessionManager } from "@/lib/wallet/WalletSessionManager";
import { attestDevice, attestDeviceMpc } from "@/lib/wallet/attestDevice";

export type WalletStatus = "loading" | "unlocked" | InitialWalletStatus;

/** Which custody backs the currently-unlocked session. */
export type WalletCustody = "mnemonic" | "mpc" | null;

export interface UseWalletLifecycleResult {
  status: WalletStatus;
  address: string | null;
  security: WalletSecurityManager;
  /** MPC-custody unlock manager (shares the same PIN refs as `security`). */
  mpcSecurity: MpcSecurityManager;
  /** Which custody unlocked this session — null until unlocked. */
  custody: WalletCustody;
  create: (pin: string) => Promise<void>;
  unlock: (pin: string) => Promise<void>;
  lock: () => void;
  refreshStatus: () => Promise<void>;
  isRecentlyUnlocked: () => boolean;
  /** MPC custody: derive cashier `index`'s HD child address (m/index). */
  deriveCashierAddress: (index: number) => Promise<string>;
  linkWallet: (
    addr: string,
    walletClient: ReturnType<typeof getWalletClient>,
  ) => Promise<void>;
}

const LOCK_TIMEOUT_MS = 2 * 60 * 1000;

export function useWalletLifecycle(): UseWalletLifecycleResult {
  const [status, setStatus] = useState<WalletStatus>("loading");
  const [address, setAddress] = useState<string | null>(null);
  const [custody, setCustody] = useState<WalletCustody>(null);

  const pinRef = useRef<string | null>(null);
  const lastUnlockRef = useRef<number>(0);

  const [security] = useState(() =>
    createWalletSecurityManager(pinRef, lastUnlockRef, 30_000),
  );
  // Shares the same PIN refs as `security`, so one PIN entry drives whichever custody exists.
  const [mpcSecurity] = useState(() =>
    createMpcSecurityManager(pinRef, lastUnlockRef, 30_000),
  );

  // ── Check wallet status on mount ────────────────────────────────────────
  useEffect(() => {
    determineWalletStatus().then(setStatus);
  }, []);

  // ── Lock ────────────────────────────────────────────────────────────────
  const lock = useCallback(() => {
    security.clearPin();
    setAddress(null);
    setCustody(null);
    setStatus("locked");
  }, [security]);

  // ── Auto-lock on inactivity + visibilitychange ──────────────────────────
  useEffect(() => {
    if (status !== "unlocked") return;

    const isDev = process.env.NODE_ENV === "development";
    const session = createWalletSessionManager({
      timeoutMs: LOCK_TIMEOUT_MS,
      onLock: lock,
      isProd: !isDev,
    });

    return session.startSession();
  }, [status, lock]);

  // ── Refresh status ──────────────────────────────────────────────────────
  const refreshStatus = useCallback(async () => {
    if (status === "unlocked") return;
    const next = await determineWalletStatus({ force: true });
    setStatus(next);
  }, [status]);

  // ── Link wallet (EIP-191 nonce signing) ─────────────────────────────────
  const linkWallet = useCallback(
    async (
      addr: string,
      walletClient: ReturnType<typeof getWalletClient>,
    ) => {
      const nonceRes = await fetch("/api/wallet/nonce", { method: "POST" });
      if (!nonceRes.ok) {
        if (nonceRes.status === 429) throw new Error("too-many-requests");
        throw new Error("Failed to obtain nonce");
      }
      const { nonce } = unwrap<{ nonce: string }>(await nonceRes.json());

      const message = `Link wallet ${addr} nonce ${nonce}`;
      const signature = await walletClient.signMessage({ message });

      const res = await fetch("/api/wallet/link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address: addr, signature, nonce }),
      });

      if (!res.ok) throw new Error("Failed to link wallet");
    },
    [],
  );

  // ── Create ──────────────────────────────────────────────────────────────
  const create = useCallback(
    async (pin: string) => {
      validatePin(pin);

      const { mnemonic, address: addr } = createWallet();

      const encrypted = await encryptSeedV3(mnemonic, pin);

      const walletClient = getWalletClient(mnemonic, 1);
      await linkWallet(addr, walletClient);

      // Best-effort: deploy the treasury Safe for this owner.
      // A failed deploy must not block wallet creation — ensureTreasury is idempotent and retryable.
      try {
        await fetch("/api/treasury/deploy", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ownerAddress: addr }),
        });
      } catch {
        // intentionally swallowed — treasury deploy is best-effort
      }

      const buf = new TextEncoder().encode(mnemonic);
      zeroize(buf);

      await saveWallet({ encrypted, address: addr } satisfies StoredWalletV3);
      setAddress(addr);
      pinRef.current = pin;
      lastUnlockRef.current = Date.now();
      setCustody("mnemonic");
      setStatus("unlocked");
      void attestDevice(security).catch(() => {});
    },
    [linkWallet, security],
  );

  // ── Unlock ──────────────────────────────────────────────────────────────
  const unlock = useCallback(async (pin: string) => {
    const stored = await getStoredWallet();

    // Mnemonic custody.
    if (stored) {
      if (stored.encrypted.version !== 3) {
        throw new Error(
          "Unsupported wallet version — please recover your wallet",
        );
      }
      await decryptSeedV3(stored.encrypted, pin);
      setAddress(stored.address);
      pinRef.current = pin;
      lastUnlockRef.current = Date.now();
      setCustody("mnemonic");
      setStatus("unlocked");
      void attestDevice(security).catch(() => {});
      return;
    }

    // MPC custody: validate the PIN by loading (decrypting) the device share.
    const meta = await getDeviceShareMeta();
    if (!meta) throw new Error("No wallet found");
    mpcSecurity.setPin(pin);
    try {
      await mpcSecurity.withDeviceShare(async () => {});
    } catch (e) {
      mpcSecurity.clearPin();
      throw e;
    }
    setAddress(meta.address);
    setCustody("mpc");
    setStatus("unlocked");
    void attestDeviceMpc(mpcSecurity).catch(() => {});
  }, [security, mpcSecurity]);

  // ── Derive a cashier's HD child address (MPC custody) ────────────────────
  // Runs the derive ceremony at m/index via the owner's MPC quorum; the cashier
  // stays keyless. Requires the device share unlocked (PIN).
  const deriveCashierAddress = useCallback(
    async (index: number): Promise<string> => {
      return mpcSecurity.withDeviceShare(async ({ shareBytes, meta }) => {
        const client = getMpcClient();
        try {
          await client.connect();
          return await client.deriveChildAddress(meta.keyId, shareBytes, index);
        } finally {
          await client.close();
        }
      });
    },
    [mpcSecurity],
  );

  return {
    status,
    address,
    security,
    mpcSecurity,
    custody,
    create,
    unlock,
    lock,
    refreshStatus,
    isRecentlyUnlocked: () => security.isRecentlyUnlocked(),
    linkWallet,
    deriveCashierAddress,
  };
}
