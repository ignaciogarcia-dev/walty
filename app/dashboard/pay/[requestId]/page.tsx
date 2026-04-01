"use client"
import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { useQuery } from "@tanstack/react-query"
import { useWalletContext } from "@/components/wallet/context"
import { PAYMENT_CHAIN_ID, PAYMENT_MODAL_POLL_INTERVAL_MS } from "@/lib/payments/config"
import type { PaymentRequestView } from "@/lib/payments/types"
import {
  getPaymentRequestCountdown,
  getPaymentRequestStatus,
} from "@/lib/payments/types"
import { getTokensByChain } from "@/lib/tokens/tokenRegistry"
import { getTxUrl } from "@/lib/explorer/getTxUrl"
import { CheckCircle, ArrowLeft, Users } from "@phosphor-icons/react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { useTranslation } from "@/hooks/useTranslation"

function truncateHash(hash: string) {
  return `${hash.slice(0, 8)}…${hash.slice(-6)}`
}

export default function DashboardPayPage() {
  const { requestId } = useParams<{ requestId: string }>()
  const router = useRouter()
  const { t } = useTranslation()
  const { address, executeRelayTransfer, relayTxStatus, relayTxHash, relayTxError, resetRelayTx } = useWalletContext()
  const [submitted, setSubmitted] = useState(false)
  const [now, setNow] = useState(0)
  const [customAmount, setCustomAmount] = useState("")

  const { data: request, isLoading: loading } = useQuery({
    queryKey: ["dashboard-payment-request", requestId],
    queryFn: async () => {
      const res = await fetch(`/api/payment-requests/${requestId}`)
      if (!res.ok) return null
      const { data } = (await res.json()) as { data: PaymentRequestView }
      return data
    },
    refetchInterval: (query) => {
      const s = query.state.data?.status
      return s === "pending" || s === "confirming" ? PAYMENT_MODAL_POLL_INTERVAL_MS : false
    },
    staleTime: 0,
  })

  const isPollable = request?.status === "pending" || request?.status === "confirming"
  useEffect(() => {
    if (!isPollable) return
    const id = setInterval(() => setNow(Date.now()), 1_000)
    return () => clearInterval(id)
  }, [isPollable])

  async function handlePay() {
    if (!request) return
    const tokens = getTokensByChain(PAYMENT_CHAIN_ID)
    const token = tokens.find((t) => t.symbol === request.tokenSymbol)
    if (!token) return
    setSubmitted(true)

    // For split payments, use custom amount or remaining amount
    const amountToPay = request.isSplitPayment
      ? (customAmount && parseFloat(customAmount) > 0 ? customAmount : request.remainingAmountUsd ?? request.amountUsd)
      : request.amountUsd

    await executeRelayTransfer({ token, to: request.merchantWalletAddress, grossAmount: amountToPay, chainId: PAYMENT_CHAIN_ID })
  }

  const status = request ? getPaymentRequestStatus(request, now ?? 0) : "pending"
  const countdown = request && now > 0 ? getPaymentRequestCountdown(request.expiresAt, now) : null
  const isSending = submitted && (relayTxStatus === "pending" || relayTxStatus === "pending_on_chain")
  const showTxError = submitted && relayTxStatus === "error" && relayTxError

  if (loading) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-10 flex items-center justify-center">
        <Spinner className="size-6" />
      </div>
    )
  }

  if (request && address?.toLowerCase() === request.merchantWalletAddress.toLowerCase()) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-10 flex flex-col gap-4 items-center text-center">
        <p className="text-lg font-semibold">{t("pay-own-charge")}</p>
        <p className="text-sm text-muted-foreground">{t("pay-own-charge-desc")}</p>
        <Button variant="outline" onClick={() => router.push("/dashboard/home")}>
          {t("back-to-home")}
        </Button>
      </div>
    )
  }

  if (!request || status === "expired") {
    return (
      <div className="mx-auto max-w-2xl px-4 py-10 flex flex-col gap-4 items-center text-center">
        <p className="text-lg font-semibold">
          {status === "expired" ? t("pay-expired") : t("pay-unavailable")}
        </p>
        <p className="text-sm text-muted-foreground">{t("pay-request-new-qr")}</p>
        <Button variant="outline" onClick={() => router.push("/dashboard/home")}>
          {t("back-to-home")}
        </Button>
      </div>
    )
  }

  if (status === "paid") {
    return (
      <div className="mx-auto max-w-md px-4 py-10 flex flex-col items-center gap-4 text-center">
        <CheckCircle size={64} weight="fill" className="text-green-500" />
        <p className="text-2xl font-semibold">{t("pay-confirmed-title")}</p>
        <p className="text-muted-foreground">{request.amountUsd} {request.tokenSymbol}</p>
        {request.txHash && (
          <a
            href={getTxUrl(request.txHash, PAYMENT_CHAIN_ID)}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-muted-foreground hover:text-foreground underline"
          >
            {truncateHash(request.txHash)}
          </a>
        )}
        <Button className="w-full rounded-xl" onClick={() => { resetRelayTx(); router.push("/dashboard/home") }}>
          {t("back-to-home")}
        </Button>
      </div>
    )
  }

  const payAmount = request.isSplitPayment
    ? (customAmount && parseFloat(customAmount) > 0 ? customAmount : request.remainingAmountUsd ?? request.amountUsd)
    : request.amountUsd

  return (
    <div className="mx-auto max-w-md px-4 py-10 flex flex-col gap-6">
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => router.back()} className="text-muted-foreground hover:text-foreground">
          <ArrowLeft size={18} />
        </button>
        <h1 className="text-lg font-semibold">{t("confirm-pay")}</h1>
      </div>

      <div className="rounded-2xl border bg-card p-5 flex flex-col gap-4">
        {request.isSplitPayment && (
          <div className="rounded-xl border bg-primary/5 p-4 flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <Users size={18} className="text-primary" />
              <span className="text-sm font-medium text-primary">{t("pay-split-title")}</span>
            </div>
            <p className="text-xs text-muted-foreground">
              {t("split-payment-desc")}
            </p>
            <div className="space-y-1 text-xs">
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t("total-label")}</span>
                <span className="font-medium">{request.amountUsd} {request.tokenSymbol}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t("paid-label")}</span>
                <span className="font-medium text-green-600">{request.totalPaidUsd ?? "0.00"} {request.tokenSymbol}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t("remaining-label")}</span>
                <span className="font-medium text-amber-600">{request.remainingAmountUsd ?? request.amountUsd} {request.tokenSymbol}</span>
              </div>
            </div>
          </div>
        )}
        <div className="text-center">
          <p className="text-3xl font-bold">${request.isSplitPayment ? (request.remainingAmountUsd ?? request.amountUsd) : request.amountUsd}</p>
          <p className="text-muted-foreground mt-1">{request.tokenSymbol} · Polygon</p>
        </div>

        <div className="rounded-xl border bg-secondary/20 px-4 py-3 flex flex-col gap-1">
          <p className="text-xs text-muted-foreground">{t("pay-to-label")}</p>
          <p className="font-mono text-sm">{request.merchantWalletAddress}</p>
        </div>

        <div className="rounded-xl border bg-secondary/20 px-4 py-3 flex items-center justify-between text-sm">
          <span className="text-muted-foreground">{t("status")}</span>
          <span className="font-medium text-foreground">
            {status === "confirming"
              ? t("pay-confirmations", {
                current: request.confirmations,
                required: request.requiredConfirmations,
              })
              : countdown
                ? t("pay-expires-in", { time: countdown.label })
                : t("pay-status-pending")}
          </span>
        </div>

        {submitted && relayTxHash && status === "pending" && (
          <div className="rounded-xl border border-primary/20 bg-primary/5 px-4 py-3 text-sm text-primary">
            <p className="font-medium">{t("pay-tx-waiting")}</p>
            <a
              href={getTxUrl(relayTxHash!, PAYMENT_CHAIN_ID)}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-block text-xs underline"
            >
              {truncateHash(relayTxHash)}
            </a>
          </div>
        )}

        {status === "confirming" && (
          <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-sm text-amber-700">
            {t("payment-detected-waiting")}
          </div>
        )}

        {showTxError && (
          <p className="text-xs text-destructive text-center">{relayTxError}</p>
        )}

        {request.isSplitPayment && status === "pending" && (!submitted || relayTxStatus === "error") && (
          <div className="flex flex-col gap-2">
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-muted-foreground">{t("pay-amount-optional-label")}</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">$</span>
                <Input
                  type="number"
                  min="0.01"
                  step="0.01"
                  placeholder={request.remainingAmountUsd ?? request.amountUsd}
                  className="rounded-xl pl-7"
                  value={customAmount}
                  onChange={(e) => setCustomAmount(e.target.value)}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                {t("pay-amount-hint", {
                  amount: request.remainingAmountUsd ?? request.amountUsd,
                  token: request.tokenSymbol,
                })}
              </p>
            </div>
          </div>
        )}

        {status === "pending" && (!submitted || relayTxStatus === "error") && (
          <Button
            className="w-full rounded-xl"
            size="lg"
            onClick={handlePay}
            disabled={isSending}
          >
            {isSending ? (
              <>
                <Spinner className="mr-2 size-4" />
                {t("sending")}
              </>
            ) : (
              `${t("pay")} ${payAmount} ${request.tokenSymbol}`
            )}
          </Button>
        )}

        {isSending && (
          <p className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <Spinner className="size-4" />
            {t("pay-sending-tx")}
          </p>
        )}
      </div>
    </div>
  )
}
