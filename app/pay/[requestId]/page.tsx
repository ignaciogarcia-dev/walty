"use client"
import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { useQuery } from "@tanstack/react-query"
import { useUser } from "@/hooks/useUser"
import { PAYMENT_MODAL_POLL_INTERVAL_MS } from "@/lib/payments/config"
import type { PaymentRequestView } from "@/lib/payments/types"
import {
  getPaymentRequestCountdown,
  getPaymentRequestStatus,
} from "@/lib/payments/types"
import { Spinner } from "@/components/ui/spinner"
import { Button } from "@/components/ui/button"
import { useTranslation } from "@/hooks/useTranslation"
import { QRCodeSVG } from "qrcode.react"
import { Check, CopySimple } from "@phosphor-icons/react"
import { copyToClipboard } from "@/utils/copyToClipboard"

export default function PayLandingPage() {
  const { t } = useTranslation()
  const { requestId } = useParams<{ requestId: string }>()
  const router = useRouter()
  const { user } = useUser()
  const authed = user !== null
  const [now, setNow] = useState(0)
  const [copiedAddress, setCopiedAddress] = useState(false)

  const { data: request, isLoading: loading } = useQuery({
    queryKey: ["payment-request-public", requestId],
    queryFn: async () => {
      const res = await fetch(`/api/payment-requests/${requestId}`)
      if (!res.ok) return null
      const { data } = await res.json()
      return data as PaymentRequestView
    },
    refetchInterval: (query) => {
      const s = query.state.data?.status
      return s === "pending" || s === "confirming"
        ? PAYMENT_MODAL_POLL_INTERVAL_MS
        : false
    },
    staleTime: 0,
  })

  // Clock for countdown — pure UI state
  const isPollable = request?.status === "pending" || request?.status === "confirming"
  useEffect(() => {
    if (!isPollable) return
    const id = setInterval(() => setNow(Date.now()), 1_000)
    return () => clearInterval(id)
  }, [isPollable])

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
              ? t("pay-already-paid")
              : status === "expired"
                ? t("pay-expired")
                : t("pay-unavailable")}
          </p>
          <p className="text-sm text-muted-foreground">
            {t("pay-request-new-qr")}
          </p>
        </div>
      </div>
    )
  }

  async function handleCopyAddress() {
    await copyToClipboard(request?.merchantWalletAddress ?? "")
    setCopiedAddress(true)
    setTimeout(() => setCopiedAddress(false), 1500)
  }

  function truncateAddress(addr: string) {
    if (addr.length <= 10) return addr
    return `${addr.slice(0, 6)}…${addr.slice(-4)}`
  }

  function handlePay() {
    if (!authed) {
      const target = `/dashboard/pay/${requestId}`
      document.cookie = `walty_pay_redirect=${encodeURIComponent(target)};path=/;max-age=1800;SameSite=Strict`
      router.push(`/onboarding/login?next=${encodeURIComponent(target)}`)
    } else {
      router.push(`/dashboard/pay/${requestId}`)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-md flex flex-col gap-6">
        <div className="text-center">
          <h1 className="text-6xl text-center font-bold tracking-tight text-[#22c55e]">WALTY</h1>
        </div>

        <div className="rounded-4xl border bg-card p-6 shadow-sm flex flex-col gap-5">
          <div className="text-center">
            <p className="text-3xl font-bold text-foreground">${request.amountUsd}</p>
            <p className="text-muted-foreground mt-1">{request.tokenSymbol} · Polygon</p>
          </div>

          <div className="rounded-2xl border bg-secondary/20 p-4 flex flex-col items-center gap-3">
            <div className="rounded-xl border bg-white p-3 shadow-xs">
              <QRCodeSVG
                value={request.merchantWalletAddress}
                size={160}
                level="M"
                includeMargin={false}
                aria-label={t("merchant-address")}
              />
            </div>
            <p className="sr-only">{t("merchant-address")}: {request.merchantWalletAddress}</p>
            <div className="flex w-full items-center justify-between rounded-xl border bg-card px-3 py-2">
              <span
                className="font-mono text-xs text-muted-foreground"
                title={request.merchantWalletAddress}
              >
                {truncateAddress(request.merchantWalletAddress)}
              </span>
              <button
                type="button"
                onClick={handleCopyAddress}
                className="ml-2 p-1 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
                aria-label={t("copy-address")}
              >
                {copiedAddress ? (
                  <Check size={16} className="text-green-500" />
                ) : (
                  <CopySimple size={16} />
                )}
              </button>
            </div>
          </div>

          <div className="rounded-2xl border bg-secondary/20 px-4 py-3 flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground">{t("status")}</p>
              <p className="text-sm font-medium text-foreground">
                {status === "confirming" ? t("payment-status-confirming")
                  : status === "cancelled" ? t("payment-status-cancelled")
                    : t("payment-status-pending")}
              </p>
            </div>
            {status === "confirming" ? (
              <span className="font-mono text-xs text-amber-600">
                {request.confirmations}/{request.requiredConfirmations} {t("confirmations")}
              </span>
            ) : (
              <span className="font-mono text-xs text-muted-foreground">
                {countdown ? `${t("expires-in")} ${countdown.label}` : ""}
              </span>
            )}
          </div>

          {status === "pending" ? (
            <Button className="w-full rounded-xl" size="lg" onClick={handlePay}>
              {authed ? t("pay-now") : t("login-to-pay")}
            </Button>
          ) : (
            <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-sm text-amber-700">
              {t("payment-detected-waiting")}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
