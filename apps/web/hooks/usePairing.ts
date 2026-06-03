"use client";

/**
 * usePairing — pending-device side of the pairing flow.
 *
 * A device that has no seed and is blocked from the encrypted backup
 * (HTTP 403 "pairing-required") calls `requestPairing()`. That registers a
 * pairing request and resolves once a trusted device approves it over the
 * `/devices` socket (or rejects/expires it).
 */

import { useCallback, useState } from "react";
import { getNamespaceSocket } from "@/lib/ws/socketClient";

export type PairingState = "idle" | "waiting" | "approved" | "rejected";

export function usePairing() {
  const [state, setState] = useState<PairingState>("idle");

  const requestPairing = useCallback(async (): Promise<boolean> => {
    const socket = getNamespaceSocket("/devices");
    const res = await fetch("/api/devices/pairing-requests", { method: "POST" });
    if (!res.ok) {
      setState("idle");
      throw new Error("pairing-request-failed");
    }
    setState("waiting");

    return new Promise<boolean>((resolve) => {
      const cleanup = () => {
        socket.off("device:pairing-approved", onApproved);
        socket.off("device:pairing-rejected", onRejected);
      };
      const onApproved = () => {
        cleanup();
        setState("approved");
        resolve(true);
      };
      const onRejected = () => {
        cleanup();
        setState("rejected");
        resolve(false);
      };
      socket.on("device:pairing-approved", onApproved);
      socket.on("device:pairing-rejected", onRejected);
    });
  }, []);

  return { state, requestPairing };
}
