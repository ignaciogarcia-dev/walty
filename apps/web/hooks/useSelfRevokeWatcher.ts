"use client";

import { useEffect, useRef } from "react";
import { unwrap } from "@/lib/api/unwrap";
import { clearStoredWallet } from "@/lib/wallet-store";
import { getNamespaceSocket } from "@/lib/ws/socketClient";

/**
 * Watches the /devices socket for a revoke event targeted at *this* device.
 * When it fires, wipe the local encrypted wallet copy and bounce to login —
 * defence in depth so that revoking a lost/stolen device from elsewhere
 * shreds its local seed without waiting for the user to hit a 401.
 */
export function useSelfRevokeWatcher(): void {
  const sidRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const res = await fetch("/api/session");
        if (!res.ok) return;
        const body = unwrap<{ user?: { sid?: string | null } }>(
          await res.json(),
        );
        if (!cancelled) sidRef.current = body?.user?.sid ?? null;
      } catch {
        // best-effort; if /session fails the user will hit a real 401 elsewhere.
      }
    })();

    const socket = getNamespaceSocket("/devices");
    const onRevoked = async (payload: { sid?: string }) => {
      if (!payload?.sid || payload.sid !== sidRef.current) return;
      try {
        await clearStoredWallet();
      } catch {
        // best-effort wipe
      }
      try {
        await fetch("/api/auth/logout", { method: "POST" });
      } catch {
        // ignore
      }
      window.location.assign("/onboarding/login?revoked=1");
    };
    socket.on("device:revoked", onRevoked);
    return () => {
      cancelled = true;
      socket.off("device:revoked", onRevoked);
    };
  }, []);
}
