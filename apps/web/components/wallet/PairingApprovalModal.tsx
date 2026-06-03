"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useWalletContext } from "@/components/wallet/context";
import { usePairingApprovals } from "@/hooks/usePairingApprovals";

/**
 * Shown on a trusted (unlocked) device when another device asks to pair.
 * Approving signs a challenge with the wallet key, which lets the server
 * release the encrypted backup to the requesting device.
 */
export function PairingApprovalModal() {
  const { security } = useWalletContext();
  const { incoming, approve, reject } = usePairingApprovals(security);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pending = incoming[0];
  if (!pending) return null;

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch {
      setError("No se pudo completar la acción. Intentá de nuevo.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nuevo dispositivo quiere acceder</DialogTitle>
          <DialogDescription>
            Aprobá solo si fuiste vos. Al aprobar, este dispositivo desbloquea
            tu copia de seguridad cifrada para el nuevo dispositivo.
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-lg border bg-muted/40 p-3 text-sm">
          <div className="font-medium text-foreground">{pending.label}</div>
          {pending.requestIp && (
            <div className="text-muted-foreground">IP: {pending.requestIp}</div>
          )}
          <div className="text-muted-foreground">
            {new Date(pending.createdAt).toLocaleString()}
          </div>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <DialogFooter>
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => run(() => reject(pending.pairingId))}
          >
            Rechazar
          </Button>
          <Button
            disabled={busy}
            onClick={() => run(() => approve(pending.pairingId))}
          >
            {busy ? "Aprobando…" : "Aprobar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
