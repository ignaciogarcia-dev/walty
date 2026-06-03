"use client";

import { useEffect } from "react";
import { unwrap } from "@/lib/api/unwrap";
import { clearStoredWallet } from "@/lib/wallet-store";
import { getNamespaceSocket } from "@/lib/ws/socketClient";

/**
 * Self-revoke guard.
 *
 * When this device's session is revoked from elsewhere we want to shred the
 * local encrypted seed and bounce to login *immediately* — defence in depth for
 * a lost/stolen device — rather than waiting for the next request to 401.
 *
 * The listener lives at module scope, attached once to the persistent `/devices`
 * socket singleton and never torn down. It deliberately does NOT follow the
 * React component lifecycle: the dashboard layout unmounts and remounts on
 * routing churn, lock/unlock and (in dev) StrictMode, and any of those windows
 * used to drop the listener so a `device:revoked` arriving then was missed.
 */
let listenerAttached = false;
let knownSid: string | null = null;

/** Test seam: reset the module-level guard state between tests. */
export function __resetSelfRevokeGuardForTest(): void {
  listenerAttached = false;
  knownSid = null;
}

async function refreshKnownSid(): Promise<void> {
  try {
    const res = await fetch("/api/session");
    if (!res.ok) return;
    const body = unwrap<{ user?: { sid?: string | null } }>(await res.json());
    // Only overwrite on success — a transient failure must not clear a sid we
    // already learned.
    if (body?.user?.sid) knownSid = body.user.sid;
  } catch {
    // best-effort; a real 401 elsewhere is the fallback
  }
}

async function onRevoked(payload: { sid?: string }): Promise<void> {
  // Strict match: the revoke is broadcast to every open device of the account,
  // so only the device whose session id matches shreds itself. Other devices
  // (and any device that hasn't learned its sid yet) must never self-wipe.
  if (!payload?.sid || payload.sid !== knownSid) return;
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
}

export function useSelfRevokeWatcher(): void {
  useEffect(() => {
    // Refresh the cached sid on every mount (cheap) so it's known well before
    // any revoke; the listener below is attached only once.
    void refreshKnownSid();

    if (listenerAttached) return;
    listenerAttached = true;
    getNamespaceSocket("/devices").on("device:revoked", onRevoked);
    // No cleanup — the guard must outlive component remounts.
  }, []);
}
