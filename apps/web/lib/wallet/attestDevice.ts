"use client";

/**
 * attestDevice
 *
 * Proves this device holds the wallet key by signing a server challenge,
 * which marks the current device session "trusted". A trusted device can
 * approve pairings and (later) is allowed to pull the encrypted backup.
 *
 * Best-effort: callers fire it after unlocking and ignore failures — a device
 * that can't attest simply stays "pending" until it tries again.
 */

import { getWalletClient } from "@/lib/rpc/getWalletClient";
import type { WalletSecurityManager } from "@/lib/wallet/WalletSecurityManager";

// The API returns bare bodies; some legacy proxies wrap them in `{ data }`.
// Unwrap defensively so this works regardless of the envelope.
function unwrap<T>(json: unknown): T {
  return json && typeof json === "object" && "data" in (json as object)
    ? ((json as { data: T }).data)
    : (json as T);
}

interface DeviceRow {
  id: string;
  current: boolean;
  trusted: boolean;
}

export async function attestDevice(
  security: WalletSecurityManager,
): Promise<void> {
  const devRes = await fetch("/api/devices");
  if (!devRes.ok) return;
  const { devices } = unwrap<{ devices: DeviceRow[] }>(await devRes.json());
  const current = devices?.find((d) => d.current);
  if (!current || current.trusted) return;

  const nonceRes = await fetch("/api/wallet/nonce", { method: "POST" });
  if (!nonceRes.ok) return;
  const { nonce } = unwrap<{ nonce: string }>(await nonceRes.json());
  if (!nonce) return;

  const message = `Attest device ${current.id} nonce ${nonce}`;
  const signature = await security.withUnlockedSeed((mnemonic) =>
    getWalletClient(mnemonic, 1).signMessage({ message }),
  );

  await fetch("/api/devices/attest", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ nonce, signature }),
  });
}
