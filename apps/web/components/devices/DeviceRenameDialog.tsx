"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useTranslation } from "@/hooks/useTranslation";

interface Props {
  open: boolean;
  initialLabel: string;
  onOpenChange: (open: boolean) => void;
  onSubmit: (label: string) => Promise<void>;
}

export function DeviceRenameDialog({
  open,
  initialLabel,
  onOpenChange,
  onSubmit,
}: Props) {
  const { t } = useTranslation();
  const [label, setLabel] = useState(initialLabel);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setLabel(initialLabel);
      setError(null);
    }
  }, [open, initialLabel]);

  async function handleSubmit() {
    const trimmed = label.trim();
    if (trimmed.length === 0 || trimmed.length > 80) return;
    setBusy(true);
    setError(null);
    try {
      await onSubmit(trimmed);
      onOpenChange(false);
    } catch {
      setError(t("devices-rename-error"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("devices-rename-title")}</DialogTitle>
          <DialogDescription>{t("devices-rename-description")}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2">
          <Label htmlFor="device-label">{t("devices-rename")}</Label>
          <Input
            id="device-label"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder={t("devices-rename-placeholder")}
            maxLength={80}
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleSubmit();
              }
            }}
          />
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={busy}
          >
            {t("cancel")}
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={busy || label.trim().length === 0}
          >
            {t("save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
