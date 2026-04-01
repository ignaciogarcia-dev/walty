"use client"

import { useEffect, useState } from "react"
import {
  QrCode,
  X,
} from "@phosphor-icons/react"
import { Button } from "@/components/ui/button"
import type { PaymentRequestView } from "@/lib/payments/types"
import {
  getPaymentRequestCountdown,
  getPaymentRequestStatus,
} from "@/lib/payments/types"
import { cn } from "@/utils/style"
import { useTranslation } from "@/hooks/useTranslation"

type ActivePaymentRequestCardProps = {
  request: PaymentRequestView
  onOpenQr: () => void
  onCancel: () => void
}

export function ActivePaymentRequestCard({ request, onOpenQr, onCancel }: ActivePaymentRequestCardProps) {
  const { t } = useTranslation()
  const [cancelling, setCancelling] = useState(false)
  const [now, setNow] = useState(0)

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1_000)
    return () => clearInterval(id)
  }, [])

  const status = getPaymentRequestStatus(request, now ?? 0)
  const countdown = now > 0
    ? getPaymentRequestCountdown(request.expiresAt, now)
    : { expired: false, label: "--:--", seconds: 0 }

  async function handleCancel() {
    if (cancelling) return
    setCancelling(true)
    try {
      await fetch("/api/payment-requests", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: request.id }),
      })
      onCancel()
    } finally {
      setCancelling(false)
    }
  }

  return (
    <div className="rounded-4xl border bg-card p-6 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-muted-foreground">{t("active-collection")}</p>
          <p className="mt-1 text-2xl font-semibold text-foreground">
            ${request.amountUsd} {request.tokenSymbol}
          </p>
        </div>
        <span
          className={cn(
            "rounded-full px-3 py-1 text-xs font-medium",
            status === "confirming"
              ? "bg-amber-500/10 text-amber-600"
              : "bg-primary/10 text-primary"
          )}
        >
          {status === "confirming" ? t("payment-status-confirming")
            : status === "paid" ? t("payment-status-paid")
            : status === "expired" ? t("payment-status-expired")
            : status === "cancelled" ? t("payment-status-cancelled")
            : t("payment-status-pending")}
        </span>
      </div>

      <div className="mt-4 flex items-center justify-between text-sm text-muted-foreground">
        <span>{t("network-polygon")}</span>
        <span className="font-mono">
          {status === "confirming"
            ? `${request.confirmations}/${request.requiredConfirmations} ${t("confirmations")}`
            : `${t("expires-in")} ${countdown.label}`}
        </span>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <Button className="rounded-xl" onClick={onOpenQr}>
          <QrCode className="mr-2 h-4 w-4" />
          {t("view-qr")}
        </Button>
        <Button
          variant="outline"
          className="rounded-xl text-destructive hover:bg-destructive/10 hover:text-destructive"
          onClick={handleCancel}
          disabled={cancelling || status === "confirming"}
        >
          <X className="mr-2 h-4 w-4" />
          {cancelling ? t("cancelling") : t("cancel-collection")}
        </Button>
      </div>
    </div>
  )
}
