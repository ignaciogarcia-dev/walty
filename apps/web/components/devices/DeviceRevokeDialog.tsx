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
import { useTranslation } from "@/hooks/useTranslation";

interface Props {
  open: boolean;
  label: string;
  isCurrent: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => Promise<void>;
}

export function DeviceRevokeDialog({
  open,
  label,
  isCurrent,
  onOpenChange,
  onConfirm,
}: Props) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleConfirm() {
    setBusy(true);
    setError(null);
    try {
      await onConfirm();
      onOpenChange(false);
    } catch {
      setError(t("devices-revoke-error"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md rounded-4xl border bg-card p-6 shadow-sm sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("devices-revoke-title")}</DialogTitle>
          <DialogDescription>
            {isCurrent
              ? t("devices-revoke-self-warning")
              : t("devices-revoke-description")}
          </DialogDescription>
        </DialogHeader>
        <div className="rounded-2xl border bg-muted/40 p-3 text-sm font-medium">
          {label}
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <DialogFooter>
          <Button
            variant="outline"
            className="rounded-xl"
            onClick={() => onOpenChange(false)}
            disabled={busy}
          >
            {t("cancel")}
          </Button>
          <Button
            variant="destructive"
            className="rounded-xl"
            onClick={handleConfirm}
            disabled={busy}
          >
            {t("devices-revoke-confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
