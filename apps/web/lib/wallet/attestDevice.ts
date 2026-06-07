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

import { hashMessage } from "viem";
import { getMpcClient } from "@/lib/mpc/getMpcClient";
import { getWalletClient } from "@/lib/rpc/getWalletClient";
import type { MpcSecurityManager } from "@/lib/mpc/MpcSecurityManager";
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

/**
 * attestDeviceMpc
 *
 * MPC equivalent of attestDevice. MPC devices cannot produce a standalone
 * ECDSA signature (they hold only one share), so this runs a lightweight
 * sign ceremony against the attestation message and submits the result to
 * the same /devices/attest endpoint. The server verifies the assembled
 * signature against the user's linked MPC address — same proof model as the
 * mnemonic path, just a different signing mechanism.
 */
export async function attestDeviceMpc(
  mpcSecurity: MpcSecurityManager,
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
  const signHash = hashMessage(message);

  const { serverSignature } = await mpcSecurity.withDeviceShare(async (share) => {
    const client = getMpcClient();
    try {
      await client.connect();
      return client.runSign(share.meta.keyId, share.shareBytes, signHash);
    } finally {
      await client.close();
    }
  });

  if (!serverSignature) return;

  // Assemble 65-byte Ethereum signature: r (32 bytes) + s (32 bytes) + v (1 byte)
  const r = serverSignature.r.slice(2);
  const s = serverSignature.s.slice(2);
  const v = (27 + serverSignature.yParity).toString(16).padStart(2, "0");
  const signature = `0x${r}${s}${v}`;

  await fetch("/api/devices/attest", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ nonce, signature }),
  });
}
