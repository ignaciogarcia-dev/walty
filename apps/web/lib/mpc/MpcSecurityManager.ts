/**
 * MpcSecurityManager
 *
 * The MPC-custody counterpart of WalletSecurityManager. Holds the PIN in refs
 * (never React state), loads + decrypts the device share on demand, and zeroizes
 * the share bytes after use. Mirrors WalletSecurityManager's PIN/TTL surface so a
 * single PIN entry can drive whichever custody the user has.
 *
 * Pure security operations — IndexedDB I/O via deviceShareStore, no networking.
 */

import { zeroize } from "@/lib/zeroize"
import { loadDeviceShare, type DeviceShareMeta } from "@/lib/mpc/deviceShareStore"

export interface UnlockedDeviceShare {
  shareBytes: Uint8Array
  meta: DeviceShareMeta
}

export class MpcSecurityManager {
  private pinRef: React.MutableRefObject<string | null>
  private lastUnlockRef: React.MutableRefObject<number>
  private unlockTtlMs: number

  constructor(
    pinRef: React.MutableRefObject<string | null>,
    lastUnlockRef: React.MutableRefObject<number>,
    unlockTtlMs: number = 30_000,
  ) {
    this.pinRef = pinRef
    this.lastUnlockRef = lastUnlockRef
    this.unlockTtlMs = unlockTtlMs
  }

  isRecentlyUnlocked(): boolean {
    return Date.now() - this.lastUnlockRef.current < this.unlockTtlMs
  }

  updateUnlockTime(): void {
    this.lastUnlockRef.current = Date.now()
  }

  clearPin(): void {
    this.pinRef.current = null
    this.lastUnlockRef.current = 0
  }

  setPin(pin: string): void {
    this.pinRef.current = pin
    this.updateUnlockTime()
  }

  isPinAvailable(): boolean {
    return this.pinRef.current !== null
  }

  getPin(): string | null {
    return this.pinRef.current
  }

  /**
   * Load + decrypt the device share, pass it to `fn`, then zeroize the share
   * bytes. The bytes are only valid for the duration of `fn`.
   *
   * @throws "Wallet locked" if no PIN is set.
   * @throws "No device share found" if nothing is stored.
   * @throws "Invalid password" (from crypto.ts) on a wrong PIN.
   */
  async withDeviceShare<T>(
    fn: (share: UnlockedDeviceShare) => T | Promise<T>,
  ): Promise<T> {
    const pin = this.pinRef.current
    if (!pin) {
      throw new Error("Wallet locked")
    }

    const loaded = await loadDeviceShare(pin)
    if (!loaded) {
      throw new Error("No device share found")
    }

    try {
      return await fn(loaded)
    } finally {
      zeroize(loaded.shareBytes)
    }
  }
}

/** Factory for React hook usage. */
export function createMpcSecurityManager(
  pinRef: React.MutableRefObject<string | null>,
  lastUnlockRef: React.MutableRefObject<number>,
  unlockTtlMs?: number,
): MpcSecurityManager {
  return new MpcSecurityManager(pinRef, lastUnlockRef, unlockTtlMs)
}
