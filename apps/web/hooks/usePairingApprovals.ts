"use client";

/**
 * usePairingApprovals — trusted-device side of the pairing flow.
 *
 * Listens on the `/devices` socket for incoming pairing requests and lets the
 * user approve or reject them. Approval requires a fresh wallet-key signature
 * (the server re-verifies it), so a trusted session alone cannot release the
 * backup to a new device.
 */

import { useCallback, useEffect, useState } from "react";
import { getWalletClient } from "@/lib/rpc/getWalletClient";
import { unwrap } from "@/lib/api/unwrap";
import type { WalletSecurityManager } from "@/lib/wallet/WalletSecurityManager";
import { getNamespaceSocket } from "@/lib/ws/socketClient";

export interface IncomingPairing {
  pairingId: string;
  label: string;
  requestIp: string | null;
  createdAt: string;
  expiresAt: string;
}

export function usePairingApprovals(security: WalletSecurityManager) {
  const [incoming, setIncoming] = useState<IncomingPairing[]>([]);

  useEffect(() => {
    const socket = getNamespaceSocket("/devices");
    const onRequested = (e: IncomingPairing) =>
      setIncoming((cur) =>
        cur.some((p) => p.pairingId === e.pairingId) ? cur : [...cur, e],
      );
    const drop = (e: { pairingId: string }) =>
      setIncoming((cur) => cur.filter((p) => p.pairingId !== e.pairingId));
    socket.on("device:pairing-requested", onRequested);
    socket.on("device:pairing-approved", drop);
    socket.on("device:pairing-rejected", drop);
    return () => {
      socket.off("device:pairing-requested", onRequested);
      socket.off("device:pairing-approved", drop);
      socket.off("device:pairing-rejected", drop);
    };
  }, []);

  const approve = useCallback(
    async (pairingId: string) => {
      const nonceRes = await fetch("/api/wallet/nonce", { method: "POST" });
      if (!nonceRes.ok) throw new Error("nonce-failed");
      const { nonce } = unwrap<{ nonce: string }>(await nonceRes.json());

      const message = `Approve device pairing ${pairingId} nonce ${nonce}`;
      const signature = await security.withUnlockedSeed((mnemonic) =>
        getWalletClient(mnemonic, 1).signMessage({ message }),
      );

      const res = await fetch(
        `/api/devices/pairing-requests/${pairingId}/approve`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ nonce, signature }),
        },
      );
      if (!res.ok) throw new Error("approve-failed");
      setIncoming((cur) => cur.filter((p) => p.pairingId !== pairingId));
    },
    [security],
  );

  const reject = useCallback(async (pairingId: string) => {
    await fetch(`/api/devices/pairing-requests/${pairingId}/reject`, {
      method: "POST",
    });
    setIncoming((cur) => cur.filter((p) => p.pairingId !== pairingId));
  }, []);

  return { incoming, approve, reject };
}
