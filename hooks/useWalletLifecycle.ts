"use client";

/**
 * useWalletLifecycle
 *
 * Manages the complete wallet lifecycle:
 * create, unlock, lock, recover, export, import, backup, auto-lock.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  getStoredWallet,
  saveWallet,
  type StoredWallet,
  type StoredWalletV3,
} from "@/lib/wallet-store";
import {
  determineWalletStatus,
  type InitialWalletStatus,
} from "@/lib/wallet-status";
import { createWallet } from "@/lib/wallet";
import {
  encryptSeedV3,
  decryptSeedV3,
  validatePin,
  type EncryptedSeedV3,
} from "@/lib/crypto";
import { getWalletClient } from "@/lib/rpc/getWalletClient";
import { zeroize } from "@/lib/zeroize";
import {
  createWalletSecurityManager,
  type WalletSecurityManager,
} from "@/lib/wallet/WalletSecurityManager";
import { createWalletSessionManager } from "@/lib/wallet/WalletSessionManager";

export type WalletStatus = "loading" | "unlocked" | InitialWalletStatus;

export interface UseWalletLifecycleResult {
  status: WalletStatus;
  address: string | null;
  security: WalletSecurityManager;
  create: (pin: string) => Promise<void>;
  unlock: (pin: string) => Promise<void>;
  lock: () => void;
  refreshStatus: () => Promise<void>;
  isRecentlyUnlocked: () => boolean;
  exportWallet: () => void;
  importWallet: (file: File) => Promise<void>;
  createBackup: (pin: string) => Promise<void>;
  recoverWallet: (pin: string, newPin: string) => Promise<void>;
  linkWallet: (
    addr: string,
    walletClient: ReturnType<typeof getWalletClient>,
  ) => Promise<void>;
}

const LOCK_TIMEOUT_MS = 2 * 60 * 1000;

export function useWalletLifecycle(): UseWalletLifecycleResult {
  const [status, setStatus] = useState<WalletStatus>("loading");
  const [address, setAddress] = useState<string | null>(null);

  const pinRef = useRef<string | null>(null);
  const lastUnlockRef = useRef<number>(0);

  const [security] = useState(() =>
    createWalletSecurityManager(pinRef, lastUnlockRef, 30_000),
  );

  // ── Check wallet status on mount ────────────────────────────────────────
  useEffect(() => {
    determineWalletStatus().then(setStatus);
  }, []);

  // ── Lock ────────────────────────────────────────────────────────────────
  const lock = useCallback(() => {
    security.clearPin();
    setAddress(null);
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
      const {
        data: { nonce },
      } = await nonceRes.json();

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

      const buf = new TextEncoder().encode(mnemonic);
      zeroize(buf);

      await saveWallet({ encrypted, address: addr } satisfies StoredWalletV3);
      setAddress(addr);
      pinRef.current = pin;
      lastUnlockRef.current = Date.now();
      setStatus("unlocked");
    },
    [linkWallet],
  );

  // ── Unlock ──────────────────────────────────────────────────────────────
  const unlock = useCallback(async (pin: string) => {
    const stored = await getStoredWallet();
    if (!stored) throw new Error("No wallet found");

    if (stored.encrypted.version !== 3) {
      throw new Error(
        "Unsupported wallet version — please recover your wallet",
      );
    }

    await decryptSeedV3(stored.encrypted, pin);

    setAddress(stored.address);
    pinRef.current = pin;
    lastUnlockRef.current = Date.now();
    setStatus("unlocked");
  }, []);

  // ── Export ──────────────────────────────────────────────────────────────
  const exportWallet = useCallback(() => {
    (async () => {
      const stored = await getStoredWallet();
      if (!stored) return;
      const blob = new Blob([JSON.stringify(stored)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "walty-backup.json";
      a.click();
      URL.revokeObjectURL(url);
    })();
  }, []);

  // ── Import ──────────────────────────────────────────────────────────────
  const importWallet = useCallback(async (file: File) => {
    const text = await file.text();
    const parsed = JSON.parse(text) as StoredWallet;
    if (!parsed.encrypted || !parsed.address)
      throw new Error("Invalid file");
    await saveWallet(parsed);
    setStatus("locked");
  }, []);

  // ── Create backup ──────────────────────────────────────────────────────
  const createBackup = useCallback(
    async (pin: string) => {
      if (!pinRef.current || !address) throw new Error("Wallet locked");
      validatePin(pin);

      await security.withUnlockedSeed(async (mnemonic) => {
        const encrypted = await encryptSeedV3(mnemonic, pin);

        const res = await fetch("/api/wallet/backup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(encrypted),
        });

        if (!res.ok) throw new Error("Failed to save backup on server");
      });
    },
    [address, security],
  );

  // ── Recover wallet ─────────────────────────────────────────────────────
  const recoverWallet = useCallback(
    async (pin: string, newPin: string) => {
      validatePin(newPin);

      const res = await fetch("/api/wallet/backup");
      if (!res.ok) throw new Error("Failed to retrieve backup");
      const { data: backup } = await res.json();
      if (!backup) throw new Error("No backup found on server");

      const backupData = backup as EncryptedSeedV3;
      const mnemonic = await decryptSeedV3(backupData, pin);

      const { mnemonicToAccount } = await import("viem/accounts");
      const addr = mnemonicToAccount(mnemonic).address;

      const encrypted = await encryptSeedV3(mnemonic, newPin);
      const buf = new TextEncoder().encode(mnemonic);
      zeroize(buf);

      await saveWallet({ encrypted, address: addr } satisfies StoredWalletV3);
      setAddress(addr);
      pinRef.current = newPin;
      lastUnlockRef.current = Date.now();
      setStatus("unlocked");
    },
    [],
  );

  return {
    status,
    address,
    security,
    create,
    unlock,
    lock,
    refreshStatus,
    isRecentlyUnlocked: () => security.isRecentlyUnlocked(),
    exportWallet,
    importWallet,
    createBackup,
    recoverWallet,
    linkWallet,
  };
}
