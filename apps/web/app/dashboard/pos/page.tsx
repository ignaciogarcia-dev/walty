"use client"

import { useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { Plus, Trash } from "@phosphor-icons/react"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog"
import { CreatePosModal } from "@/components/pos/CreatePosModal"
import { useTranslation } from "@/hooks/useTranslation"
import { unwrap } from "@/lib/api/unwrap"
import { cn } from "@/utils/style"

type PosDevice = {
  id: number
  name: string
  status: "pending" | "active" | "revoked"
  walletAddress: string
  derivationIndex: number
  lastSeenAt: string | null
  createdAt: string
  revokedAt: string | null
}

export default function PosPage() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [createOpen, setCreateOpen] = useState(false)
  const [revoking, setRevoking] = useState<number | null>(null)
  const [pendingRevoke, setPendingRevoke] = useState<PosDevice | null>(null)

  const { data: devices = [], isLoading } = useQuery({
    queryKey: ["pos-devices"],
    queryFn: async () => {
      const res = await fetch("/api/business/pos")
      if (!res.ok) throw new Error("Failed to load POS devices")
      const data = unwrap<{ devices: PosDevice[] }>(await res.json())
      return data.devices
    },
    refetchInterval: 30_000,
    staleTime: 15_000,
  })

  async function confirmRevoke() {
    const device = pendingRevoke
    if (!device) return
    setRevoking(device.id)
    try {
      await fetch(`/api/business/pos/${device.id}`, { method: "DELETE" })
      queryClient.invalidateQueries({ queryKey: ["pos-devices"] })
    } finally {
      setRevoking(null)
      setPendingRevoke(null)
    }
  }

  const activeDevices = devices.filter((d) => d.status !== "revoked")
  const revokedDevices = devices.filter((d) => d.status === "revoked")

  return (
    <div className="mx-auto max-w-2xl px-4 py-10 flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">{t("pos-title")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("pos-subtitle")}</p>
        </div>
        <Button onClick={() => setCreateOpen(true)} className="rounded-xl shrink-0">
          <Plus className="mr-2 size-4" />
          {t("pos-add")}
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-10">
          <Spinner className="size-6" />
        </div>
      ) : devices.length === 0 ? (
        <div className="rounded-2xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
          {t("pos-empty")}
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-3">
            {activeDevices.map((device) => (
              <PosCard
                key={device.id}
                device={device}
                revoking={revoking === device.id}
                onRevoke={setPendingRevoke}
              />
            ))}
          </div>

          {revokedDevices.length > 0 && (
            <>
              <h2 className="mt-2 text-sm font-medium text-muted-foreground">
                {t("pos-revoked-heading")}
              </h2>
              <div className="flex flex-col gap-3">
                {revokedDevices.map((device) => (
                  <PosCard key={device.id} device={device} revoking={false} onRevoke={setPendingRevoke} />
                ))}
              </div>
            </>
          )}
        </>
      )}

      <CreatePosModal
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={() => queryClient.invalidateQueries({ queryKey: ["pos-devices"] })}
      />

      <Dialog
        open={pendingRevoke !== null}
        onOpenChange={(open) => {
          if (!open && revoking === null) setPendingRevoke(null)
        }}
      >
        <DialogContent className="max-w-sm rounded-2xl border bg-card p-6 shadow-xl">
          <DialogTitle className="text-lg font-semibold">{t("pos-revoke-title")}</DialogTitle>
          <DialogDescription className="mt-2 text-sm text-muted-foreground">
            {t("pos-revoke-confirm")}
          </DialogDescription>
          <div className="mt-6 flex justify-end gap-2">
            <Button
              variant="outline"
              className="rounded-xl"
              onClick={() => setPendingRevoke(null)}
              disabled={revoking !== null}
            >
              {t("cancel")}
            </Button>
            <Button
              variant="destructive"
              className="rounded-xl"
              onClick={confirmRevoke}
              disabled={revoking !== null}
            >
              {revoking !== null ? <Spinner className="size-4" /> : t("pos-revoke")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function PosCard({
  device,
  revoking,
  onRevoke,
}: {
  device: PosDevice
  revoking: boolean
  onRevoke: (device: PosDevice) => void
}) {
  const { t } = useTranslation()
  const isRevoked = device.status === "revoked"

  const statusLabel =
    device.status === "active"
      ? t("pos-status-active")
      : device.status === "pending"
        ? t("pos-status-pending")
        : t("pos-status-revoked")

  const statusClass =
    device.status === "active"
      ? "bg-green-500/15 text-green-600 dark:text-green-400"
      : device.status === "pending"
        ? "bg-amber-500/15 text-amber-600 dark:text-amber-400"
        : "bg-muted text-muted-foreground"

  return (
    <div
      className={cn(
        "flex items-center justify-between gap-4 rounded-2xl border border-border bg-card p-5",
        isRevoked && "opacity-60",
      )}
    >
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <p className="truncate text-sm font-semibold">{device.name}</p>
          <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-medium", statusClass)}>
            {statusLabel}
          </span>
        </div>
        <p className="mt-0.5 font-mono text-xs text-muted-foreground">
          {device.walletAddress.slice(0, 6)}…{device.walletAddress.slice(-4)}
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {device.lastSeenAt
            ? `${t("pos-last-seen")}: ${new Date(device.lastSeenAt).toLocaleString()}`
            : t("pos-never-connected")}
        </p>
      </div>

      {!isRevoked && (
        <Button
          variant="ghost"
          size="icon"
          onClick={() => onRevoke(device)}
          disabled={revoking}
          className="shrink-0 text-muted-foreground hover:text-destructive"
          aria-label={t("pos-revoke")}
        >
          {revoking ? <Spinner className="size-4" /> : <Trash className="size-4" />}
        </Button>
      )}
    </div>
  )
}
