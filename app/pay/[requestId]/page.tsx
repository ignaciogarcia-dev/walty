"use client"
import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { PAYMENT_MODAL_POLL_INTERVAL_MS } from "@/lib/payments/config"
import type { PaymentRequestView } from "@/lib/payments/types"
import {
  getPaymentRequestCountdown,
  getPaymentRequestStatus,
  getPaymentRequestStatusLabel,
} from "@/lib/payments/types"
import { Spinner } from "@/components/ui/spinner"
import { Button } from "@/components/ui/button"

function truncateAddress(addr: string) {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`
}

export default function PayLandingPage() {
  const { requestId } = useParams<{ requestId: string }>()
  const router = useRouter()
  const [request, setRequest] = useState<PaymentRequestView | null>(null)
  const [loading, setLoading] = useState(true)
  const [authed, setAuthed] = useState<boolean | null>(null)
  const [now, setNow] = useState(0)

  useEffect(() => {
    let cancelled = false

    async function loadInitial() {
      const [reqRes, meRes] = await Promise.all([
        fetch(`/api/payment-requests/${requestId}`),
        fetch("/api/me"),
      ])

      if (cancelled) return

      if (reqRes.ok) {
        setRequest(await reqRes.json())
      }

      setAuthed(meRes.ok)
      setLoading(false)
    }

    loadInitial()

    return () => {
      cancelled = true
    }
  }, [requestId])

  useEffect(() => {
    if (!request) return
    if (request.status !== "pending" && request.status !== "confirming") return

    let cancelled = false

    const poll = async () => {
      try {
        const res = await fetch(`/api/payment-requests/${requestId}`)
        if (!res.ok || cancelled) return
        setRequest(await res.json())
      } catch {
        // Retry on next interval.
      }
    }

    const pollId = setInterval(poll, PAYMENT_MODAL_POLL_INTERVAL_MS)
    const clockId = setInterval(() => setNow(Date.now()), 1_000)

    return () => {
      cancelled = true
      clearInterval(pollId)
      clearInterval(clockId)
    }
  }, [request, requestId])

  const status = request ? getPaymentRequestStatus(request, now ?? 0) : "pending"
  const countdown = request && now > 0 ? getPaymentRequestCountdown(request.expiresAt, now) : null

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Spinner className="size-6" />
      </div>
    )
  }

  if (!request || status === "paid" || status === "expired") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4">
        <div className="w-full max-w-sm rounded-4xl border bg-card p-6 shadow-sm text-center flex flex-col gap-4">
          <p className="text-lg font-semibold text-foreground">
            {status === "paid"
              ? "Este cobro ya fue pagado"
              : status === "expired"
              ? "Este cobro expiró"
              : "Este cobro no está disponible"}
          </p>
          <p className="text-sm text-muted-foreground">
            Solicita un nuevo QR al comercio.
          </p>
        </div>
      </div>
    )
  }

  function handlePay() {
    if (!authed) {
      router.push(`/onboarding?next=/pay/${requestId}`)
    } else {
      router.push(`/dashboard/pay/${requestId}`)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm flex flex-col gap-6">
        <div className="text-center">
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Walty</h1>
        </div>

        <div className="rounded-4xl border bg-card p-6 shadow-sm flex flex-col gap-5">
          <div className="text-center">
            <p className="text-3xl font-bold text-foreground">${request.amountUsd}</p>
            <p className="text-muted-foreground mt-1">{request.tokenSymbol} · Polygon</p>
          </div>

          <div className="rounded-2xl border bg-secondary/20 px-4 py-3 flex flex-col gap-1">
            <p className="text-xs text-muted-foreground">Dirección del comercio</p>
            <p className="font-mono text-sm text-foreground">{truncateAddress(request.merchantWalletAddress)}</p>
          </div>

          <div className="rounded-2xl border bg-secondary/20 px-4 py-3 flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground">Estado</p>
              <p className="text-sm font-medium text-foreground">{getPaymentRequestStatusLabel(status)}</p>
            </div>
            {status === "confirming" ? (
              <span className="font-mono text-xs text-amber-600">
                {request.confirmations}/{request.requiredConfirmations} confirmaciones
              </span>
            ) : (
              <span className="font-mono text-xs text-muted-foreground">
                {countdown ? `Expira en ${countdown.label}` : ""}
              </span>
            )}
          </div>

          {status === "pending" ? (
            <Button className="w-full rounded-xl" size="lg" onClick={handlePay}>
              {authed ? "Pagar ahora" : "Iniciar sesión para pagar"}
            </Button>
          ) : (
            <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-sm text-amber-700">
              Pago detectado. Esperando confirmaciones en Polygon.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
