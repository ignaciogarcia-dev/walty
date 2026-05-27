"use client";

import { useState } from "react";
import { DotsThreeVertical, DeviceMobile } from "@phosphor-icons/react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { useDevices, type Device } from "@/hooks/useDevices";
import { useTranslation } from "@/hooks/useTranslation";
import { DeviceRenameDialog } from "./DeviceRenameDialog";
import { DeviceRevokeDialog } from "./DeviceRevokeDialog";

function relativeTime(iso: string, locale: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const diffMs = Date.now() - then;
  const minutes = Math.round(diffMs / 60_000);
  const hours = Math.round(diffMs / 3_600_000);
  const days = Math.round(diffMs / 86_400_000);
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  if (minutes < 1) return rtf.format(0, "minute");
  if (minutes < 60) return rtf.format(-minutes, "minute");
  if (hours < 24) return rtf.format(-hours, "hour");
  return rtf.format(-days, "day");
}

export function DevicesPanel() {
  const { t, locale } = useTranslation();
  const { devices, loading, error, renameDevice, revokeDevice } = useDevices();
  const [renaming, setRenaming] = useState<Device | null>(null);
  const [revoking, setRevoking] = useState<Device | null>(null);

  return (
    <div className="mx-auto max-w-2xl px-4 py-10 flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">{t("devices-title")}</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {t("devices-description")}
        </p>
      </div>

      <div className="rounded-2xl border border-border bg-card overflow-hidden">
        {loading ? (
          <div className="p-4 flex flex-col gap-3">
            <Skeleton className="h-12 w-full rounded-xl" />
            <Skeleton className="h-12 w-full rounded-xl" />
          </div>
        ) : error ? (
          <div className="text-sm text-destructive text-center py-8">{error}</div>
        ) : devices.length === 0 ? (
          <div className="text-sm text-muted-foreground text-center py-8">
            {t("devices-empty")}
          </div>
        ) : (
          <ul>
            {devices.map((d, idx) => (
              <li
                key={d.id}
                className={
                  "flex items-center gap-3 p-4 " +
                  (idx > 0 ? "border-t border-border" : "")
                }
              >
                <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                  <DeviceMobile size={18} weight="regular" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="truncate text-sm font-medium">
                      {d.label}
                    </span>
                    {d.current && (
                      <Badge variant="secondary">{t("devices-this-device")}</Badge>
                    )}
                    {d.trusted ? (
                      <Badge variant="outline">{t("devices-trusted")}</Badge>
                    ) : (
                      <Badge variant="outline">{t("devices-pending")}</Badge>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {t("devices-last-seen", {
                      time: relativeTime(d.lastSeenAt, locale),
                    })}
                  </div>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" aria-label="More">
                      <DotsThreeVertical size={18} weight="bold" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onSelect={() => setRenaming(d)}>
                      {t("devices-rename")}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="text-destructive focus:text-destructive"
                      onSelect={() => setRevoking(d)}
                    >
                      {t("devices-revoke")}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </li>
            ))}
          </ul>
        )}
      </div>

      <DeviceRenameDialog
        open={renaming != null}
        initialLabel={renaming?.label ?? ""}
        onOpenChange={(o) => !o && setRenaming(null)}
        onSubmit={async (label) => {
          if (renaming) await renameDevice(renaming.id, label);
        }}
      />

      <DeviceRevokeDialog
        open={revoking != null}
        label={revoking?.label ?? ""}
        isCurrent={revoking?.current ?? false}
        onOpenChange={(o) => !o && setRevoking(null)}
        onConfirm={async () => {
          if (revoking) await revokeDevice(revoking.id);
        }}
      />
    </div>
  );
}
