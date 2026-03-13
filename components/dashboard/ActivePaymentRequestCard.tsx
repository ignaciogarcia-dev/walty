"use client"

import { useEffect, useMemo, useState } from "react"
import {
  Check,
  CopySimple,
  LinkSimple,
  QrCode,
  ShareNetwork,
  X,
} from "@phosphor-icons/react"
import { Button } from "@/components/ui/button"
import { getAbsolutePaymentUrl } from "@/lib/payments/paymentLinks"
import type { PaymentRequestView } from "@/lib/payments/types"
import {
  getPaymentRequestCountdown,
  getPaymentRequestStatus,
  getPaymentRequestStatusLabel,
  getPaymentShareText,
} from "@/lib/payments/types"
import { copyToClipboard } from "@/utils/copyToClipboard"
import { cn } from "@/utils/style"

type ActivePaymentRequestCardProps = {
  request: PaymentRequestView
  onOpenQr: () => void
  onCancel: () => void
}

export function ActivePaymentRequestCard({ request, onOpenQr, onCancel }: ActivePaymentRequestCardProps) {
  const [copied, setCopied] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [now, setNow] = useState(0)

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1_000)
    return () => clearInterval(id)
  }, [])

  const paymentUrl = useMemo(() => {
    if (typeof window === "undefined") return ""
    return getAbsolutePaymentUrl(request.id, window.location.origin)
  }, [request.id])

  const status = getPaymentRequestStatus(request, now ?? 0)
  const countdown = now > 0
    ? getPaymentRequestCountdown(request.expiresAt, now)
    : { expired: false, label: "--:--", seconds: 0 }
  const shareSupported = typeof navigator !== "undefined" && typeof navigator.share === "function"

  async function handleCopyLink() {
    if (!paymentUrl) return
    await copyToClipboard(paymentUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 1_500)
  }

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

  async function handleShare() {
    if (!paymentUrl || !shareSupported) return
    try {
      await navigator.share({
        title: "Cobro Walty",
        text: getPaymentShareText(request, paymentUrl),
        url: paymentUrl,
      })
    } catch {
      // Ignore cancelled shares.
    }
  }

  return (
    <div className="rounded-4xl border bg-card p-6 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-muted-foreground">Cobro activo</p>
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
          {getPaymentRequestStatusLabel(status)}
        </span>
      </div>

      <div className="mt-4 flex items-center justify-between text-sm text-muted-foreground">
        <span>Red: Polygon</span>
        <span className="font-mono">
          {status === "confirming"
            ? `${request.confirmations}/${request.requiredConfirmations} confirmaciones`
            : `Expira en ${countdown.label}`}
        </span>
      </div>

      <div className="mt-4 rounded-2xl border bg-secondary/20 p-4">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <LinkSimple size={14} />
          Link público
        </div>
        <p className="mt-2 break-all text-sm text-foreground">{paymentUrl}</p>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <Button className="rounded-xl" onClick={onOpenQr}>
          <QrCode className="mr-2 h-4 w-4" />
          Ver QR
        </Button>
        <Button variant="outline" className="rounded-xl" onClick={handleCopyLink}>
          {copied ? <Check className="mr-2 h-4 w-4 text-green-500" /> : <CopySimple className="mr-2 h-4 w-4" />}
          Copiar link
        </Button>
        {shareSupported && (
          <Button variant="outline" className="rounded-xl" onClick={handleShare}>
            <ShareNetwork className="mr-2 h-4 w-4" />
            Compartir
          </Button>
        )}
        <Button
          variant="outline"
          className="rounded-xl text-destructive hover:bg-destructive/10 hover:text-destructive"
          onClick={handleCancel}
          disabled={cancelling || status === "confirming"}
        >
          <X className="mr-2 h-4 w-4" />
          {cancelling ? "Cancelando..." : "Cancelar cobro"}
        </Button>
      </div>
    </div>
  )
}
