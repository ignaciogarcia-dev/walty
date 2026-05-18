/**
 * WalletSecurityManager
 *
 * Manages PIN state (in refs, never in React state), secure seed decryption
 * on-demand with zeroization, and TTL tracking for recently-unlocked status.
 *
 * Pure security operations — no I/O, no networking.
 */

import { decryptSeedV3 } from "@/lib/crypto";
import { zeroize } from "@/lib/zeroize";
import { getStoredWallet } from "@/lib/wallet-store";

export class WalletSecurityManager {
  private pinRef: React.MutableRefObject<string | null>;
  private lastUnlockRef: React.MutableRefObject<number>;
  private unlockTtlMs: number;

  constructor(
    pinRef: React.MutableRefObject<string | null>,
    lastUnlockRef: React.MutableRefObject<number>,
    unlockTtlMs: number = 30_000,
  ) {
    this.pinRef = pinRef;
    this.lastUnlockRef = lastUnlockRef;
    this.unlockTtlMs = unlockTtlMs;
  }

  /** Returns true if wallet was unlocked within the TTL window. */
  isRecentlyUnlocked(): boolean {
    return Date.now() - this.lastUnlockRef.current < this.unlockTtlMs;
  }

  /** Update the last unlock timestamp. */
  updateUnlockTime(): void {
    this.lastUnlockRef.current = Date.now();
  }

  /** Clear PIN and reset unlock time. Called on lock. */
  clearPin(): void {
    this.pinRef.current = null;
    this.lastUnlockRef.current = 0;
  }

  /** Set the PIN in the ref and update unlock time. */
  setPin(pin: string): void {
    this.pinRef.current = pin;
    this.updateUnlockTime();
  }

  /** Check if PIN is currently available. */
  isPinAvailable(): boolean {
    return this.pinRef.current !== null;
  }

  /** Get the current PIN (for internal use only). */
  getPin(): string | null {
    return this.pinRef.current;
  }

  /**
   * Decrypt the seed, pass it to `fn`, then zeroize.
   * Fetches the stored wallet from IndexedDB internally.
   *
   * @throws If wallet is locked (no PIN available)
   * @throws If stored wallet is missing
   * @throws If wallet version is unsupported
   */
  async withUnlockedSeed<T>(
    fn: (mnemonic: string) => T | Promise<T>,
  ): Promise<T> {
    const pin = this.pinRef.current;
    if (!pin) {
      throw new Error("Wallet locked");
    }

    const stored = await getStoredWallet();
    if (!stored) {
      throw new Error("No wallet found");
    }

    if (stored.encrypted.version !== 3) {
      throw new Error(
        "Unsupported wallet version — please recover your wallet",
      );
    }

    const mnemonic = await decryptSeedV3(stored.encrypted, pin);

    try {
      return await fn(mnemonic);
    } finally {
      const buf = new TextEncoder().encode(mnemonic);
      zeroize(buf);
    }
  }
}

/** Factory for React hook usage. */
export function createWalletSecurityManager(
  pinRef: React.MutableRefObject<string | null>,
  lastUnlockRef: React.MutableRefObject<number>,
  unlockTtlMs?: number,
): WalletSecurityManager {
  return new WalletSecurityManager(pinRef, lastUnlockRef, unlockTtlMs);
}
