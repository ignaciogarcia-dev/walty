"use client"

import { useEffect, useMemo, useState } from "react"
import { motion, AnimatePresence } from "motion/react"
import { useQuery } from "@tanstack/react-query"
import { formatUnits } from "viem"
import { QRCodeSVG } from "qrcode.react"
import {
  ArrowClockwise,
  ArrowURightDown,
  Check,
  CheckCircle,
  Circle,
  CopySimple,
  Users,
  Warning,
} from "@phosphor-icons/react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { getTxUrl } from "@/lib/explorer/getTxUrl"
import {
  PAYMENT_CHAIN_ID,
  PAYMENT_MODAL_POLL_INTERVAL_MS,
} from "@/lib/payments/config"
import { getAbsolutePaymentUrl } from "@/lib/payments/paymentLinks"
import type { PaymentRequestView } from "@/lib/payments/types"
import {
  getPaymentRequestCountdown,
  getPaymentRequestStatus,
} from "@/lib/payments/types"
import { copyToClipboard } from "@/utils/copyToClipboard"
import { cn } from "@/utils/style"
import { useTranslation } from "@/hooks/useTranslation"
import { validateCollectForm } from "@/lib/payments/CollectModalValidation"
import { useIsMobile } from "@/hooks/use-mobile"

type Step = "amount" | "qr" | "confirmed"

type CollectModalProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  merchantWalletAddress: string | null
  activeRequest?: PaymentRequestView | null
  onRequestChange?: (request: PaymentRequestView | null) => void
}

function truncateAddress(addr: string) {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`
}

function truncateHash(hash: string) {
  return `${hash.slice(0, 8)}…${hash.slice(-6)}`
}

type RefundState = "idle" | "confirming" | "sending" | "done" | "error"

export function CollectModal({
  open,
  onOpenChange,
  merchantWalletAddress,
  activeRequest = null,
  onRequestChange,
}: CollectModalProps) {
  const { t } = useTranslation()
  const isMobile = useIsMobile()
  const [step, setStep] = useState<Step>("amount")
  const [amount, setAmount] = useState("")
  const token = "USDC"
  const [isSplitPayment, setIsSplitPayment] = useState(false)
  const [request, setRequest] = useState<PaymentRequestView | null>(null)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copiedAddress, setCopiedAddress] = useState(false)
  const [copiedLink, setCopiedLink] = useState(false)
  const [now, setNow] = useState(Date.now)
  const [refundState, setRefundState] = useState<RefundState>("idle")
  const [refundError, setRefundError] = useState<string | null>(null)

  const hasRequest = !!request
  useEffect(() => {
    if (!hasRequest) return
    const id = setInterval(() => setNow(Date.now()), 1_000)
    return () => clearInterval(id)
  }, [hasRequest])

  useEffect(() => {
    if (!open || !activeRequest) return
    setRequest(activeRequest)
    setAmount(activeRequest.amountUsd)
    setError(null)
    setStep(activeRequest.status === "paid" ? "confirmed" : "qr")
  }, [activeRequest, open])

  const requestId = request?.id
  const pollableStatus = request?.status === "pending" || request?.status === "confirming"

  const { data: polledRequest } = useQuery({
    queryKey: ["payment-request-detail", requestId],
    queryFn: async () => {
      const res = await fetch(`/api/payment-requests/${requestId}`)
      if (!res.ok) return null
      const { data: next } = await res.json() as { data: PaymentRequestView }
      return next
    },
    enabled: !!requestId && pollableStatus,
    refetchInterval: pollableStatus ? PAYMENT_MODAL_POLL_INTERVAL_MS : false,
    staleTime: 0,
    gcTime: 0,
  })

  useEffect(() => {
    if (!polledRequest) return
    setRequest(polledRequest)
    onRequestChange?.(polledRequest)
    if (polledRequest.status === "paid") setStep("confirmed")
  }, [polledRequest, onRequestChange])

  const requestStatus = request ? getPaymentRequestStatus(request, now ?? 0) : "pending"
  const countdown = request && now > 0
    ? getPaymentRequestCountdown(request.expiresAt, now)
    : { expired: false, label: "--:--", seconds: 0 }
  const paymentUrl = useMemo(() => {
    if (!request || typeof window === "undefined") return ""
    return getAbsolutePaymentUrl(request.id, window.location.origin)
  }, [request])

  async function handleRefundSurplus() {
    if (!request?.payerAddress || !request.receivedAmountToken) return
    setRefundState("sending")
    setRefundError(null)
    try {
      const surplusBigInt =
        BigInt(request.receivedAmountToken) - BigInt(request.amountToken)
      const surplusFormatted = formatUnits(surplusBigInt, request.tokenDecimals)

      const res = await fetch("/api/business/refund-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          paymentRequestId: request.id,
          destinationAddress: request.payerAddress,
          reason: t("refund-surplus-reason"),
          amountToken: surplusBigInt.toString(),
          amountUsd: surplusFormatted,
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        setRefundState("error")
        setRefundError(data.error ?? t("refund-surplus-error"))
        return
      }

      setRefundState("done")
    } catch {
      setRefundState("error")
      setRefundError(t("refund-surplus-error"))
    }
  }

  function handleAmountChange(value: string) {
    setAmount(value)
    const result = validateCollectForm({
      amountUsd: value,
      tokenSymbol: token,
      isSplitPayment,
      requiredConfirmations: 12,
    })
    setError(result.type === "valid" ? null : result.message)
  }

  function resetLocalState() {
    setStep("amount")
    setAmount("")
    setIsSplitPayment(false)
    setRequest(null)
    setError(null)
    setCreating(false)
    setCopiedAddress(false)
    setCopiedLink(false)
    setRefundState("idle")
    setRefundError(null)
  }

  function handleClose(nextOpen: boolean) {
    if (!nextOpen) resetLocalState()
    onOpenChange(nextOpen)
  }

  async function handleCreateRequest() {
    if (!merchantWalletAddress) {
      setError(t("unlock-wallet-to-collect"))
      return
    }
    setCreating(true)
    setError(null)
    try {
      const res = await fetch("/api/payment-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amountUsd: amount, token, merchantWalletAddress, isSplitPayment }),
      })
      const body = await res.json()
      if (!res.ok) {
        setError(body.error ?? t("error-creating-collection"))
        return
      }
      const nextRequest = body.data as PaymentRequestView
      setRequest(nextRequest)
      onRequestChange?.(nextRequest)
      setStep("qr")
    } catch {
      setError(t("connection-error"))
    } finally {
      setCreating(false)
    }
  }

  async function handleCopyAddress() {
    if (!request) return
    await copyToClipboard(request.merchantWalletAddress)
    setCopiedAddress(true)
    setTimeout(() => setCopiedAddress(false), 1_500)
  }

  async function handleCopyLink() {
    if (!paymentUrl) return
    await copyToClipboard(paymentUrl)
    setCopiedLink(true)
    setTimeout(() => setCopiedLink(false), 1_500)
  }

  const amountValid = amount !== "" && !Number.isNaN(Number(amount)) && Number(amount) > 0

  // ── shared step bodies (no Dialog primitives) ───────────────────────────────

  const amountBody = (
    <div className="flex flex-col gap-4 py-2">
      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium text-muted-foreground">{t("collect-amount-label")}</label>
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">$</span>
          <Input
            type="number"
            min="0.01"
            step="0.01"
            placeholder="0.00"
            className="rounded-xl pl-7 text-lg"
            value={amount}
            onChange={(e) => handleAmountChange(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && amountValid) void handleCreateRequest() }}
            autoFocus={!isMobile}
          />
        </div>
        <p className="text-xs text-muted-foreground">{t("currency-usd")}</p>
      </div>
      <button
        type="button"
        onClick={() => setIsSplitPayment(!isSplitPayment)}
        className={cn(
          "flex items-center gap-2 rounded-xl border p-3 text-left transition-colors",
          isSplitPayment ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"
        )}
      >
        {isSplitPayment
          ? <CheckCircle size={20} weight="fill" className="shrink-0 text-primary" />
          : <Circle size={20} className="shrink-0 text-muted-foreground" />}
        <div className="flex items-center gap-2">
          <Users size={18} className={isSplitPayment ? "text-primary" : "text-muted-foreground"} />
          <span className={cn("text-sm font-medium", isSplitPayment ? "text-primary" : "text-foreground")}>
            {t("split-payment")}
          </span>
        </div>
      </button>
      {error && <p className="text-xs text-destructive">{error}</p>}
      <Button className="w-full rounded-xl" onClick={handleCreateRequest} disabled={!amountValid || creating}>
        {creating ? <><Spinner className="mr-2" />{t("generating-qr")}</> : t("continue")}
      </Button>
    </div>
  )

  const qrBody = request && (
    <div className="flex flex-col items-center gap-4 py-2">
      <div className="rounded-2xl border bg-white p-4 shadow-xs">
        <QRCodeSVG value={request.merchantWalletAddress} size={160} level="M" includeMargin={false} />
      </div>
      <div className="flex w-full min-w-0 items-center justify-between gap-2 rounded-xl border bg-secondary/20 px-4 py-3">
        <span className="min-w-0 truncate font-mono text-sm text-muted-foreground">
          {truncateAddress(request.merchantWalletAddress)}
        </span>
        <button type="button" onClick={handleCopyAddress} className="shrink-0 text-muted-foreground hover:text-foreground">
          {copiedAddress ? <Check size={16} className="text-green-500" /> : <CopySimple size={16} />}
        </button>
      </div>
      {request.isSplitPayment && (
        <div className="w-full rounded-2xl border bg-secondary/20 p-4">
          <div className="mb-3 flex items-center gap-2">
            <Users size={16} className="text-primary" />
            <span className="text-sm font-medium">{t("split-payment")}</span>
          </div>
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">{t("total-to-pay")}</span>
              <span className="font-medium">{request.amountUsd} {request.tokenSymbol}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">{t("total-paid")}</span>
              <span className="font-medium text-green-600">{request.totalPaidUsd ?? "0.00"} {request.tokenSymbol}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">{t("remaining")}</span>
              <span className="font-medium text-amber-600">{request.remainingAmountUsd ?? request.amountUsd} {request.tokenSymbol}</span>
            </div>
          </div>
          {request.contributions && request.contributions.length > 0 && (
            <div className="mt-4 border-t pt-3">
              <p className="mb-2 text-xs font-medium text-muted-foreground">{t("contributions")}</p>
              <div className="space-y-2">
                {request.contributions.map((contribution) => (
                  <div key={contribution.id} className="flex items-center justify-between rounded-lg border bg-background p-2 text-xs">
                    <div className="flex flex-col">
                      <span className="font-mono text-muted-foreground">{truncateAddress(contribution.payerAddress)}</span>
                      <span className="text-muted-foreground">{contribution.amountUsd} {contribution.tokenSymbol}</span>
                    </div>
                    <div className="flex flex-col items-end">
                      <span className={cn(
                        "text-xs",
                        contribution.status === "confirmed" ? "text-green-600"
                          : contribution.status === "confirming" ? "text-amber-600"
                          : "text-muted-foreground"
                      )}>
                        {contribution.status === "confirmed" ? t("contribution-confirmed")
                          : contribution.status === "confirming" ? t("contribution-confirming")
                          : t("contribution-pending")}
                      </span>
                      {contribution.txHash && (
                        <a href={getTxUrl(contribution.txHash, PAYMENT_CHAIN_ID)} target="_blank" rel="noopener noreferrer" className="text-xs text-muted-foreground underline hover:text-foreground">
                          {truncateHash(contribution.txHash)}
                        </a>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
      <div className="flex w-full justify-between text-sm text-muted-foreground">
        <span>{t("network-polygon")}</span>
        <span className={cn("font-mono", requestStatus === "expired" ? "text-destructive" : "")}>
          {requestStatus === "confirming"
            ? `${request.confirmations}/${request.requiredConfirmations} ${t("confirmations")}`
            : requestStatus === "expired"
              ? t("expired-label")
              : `${t("expires-in")} ${countdown.label}`}
        </span>
      </div>
      {requestStatus === "pending" && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Spinner className="size-4" />{t("waiting-for-payment")}
        </p>
      )}
      {requestStatus === "confirming" && (
        <p className="flex items-center gap-2 text-sm text-amber-500">
          <Spinner className="size-4" />{t("payment-detected-confirming")}
        </p>
      )}
      {requestStatus === "expired" && (
        <div className="flex w-full flex-col items-center gap-3">
          <p className="text-sm text-destructive">{t("collection-expired")}</p>
          <Button variant="outline" className="w-full rounded-xl" onClick={resetLocalState}>
            <ArrowClockwise className="mr-2 size-4" />{t("create-new-collection")}
          </Button>
        </div>
      )}
    </div>
  )

  const confirmedBody = request && (
    <div className="flex flex-col items-center gap-4 py-4">
      {!request.isSplitPayment && request.paymentDiscrepancy === "exact" && (
        <CheckCircle size={64} weight="fill" className="text-green-500" />
      )}
      {!request.isSplitPayment && request.paymentDiscrepancy === "overpaid" && (
        <Warning size={64} weight="fill" className="text-amber-500" />
      )}
      {!request.isSplitPayment && request.paymentDiscrepancy === "underpaid" && (
        <Warning size={64} weight="fill" className="text-orange-500" />
      )}
      {(request.isSplitPayment || !request.paymentDiscrepancy) && (
        <CheckCircle size={64} weight="fill" className="text-green-500" />
      )}
      <p className="text-2xl font-semibold">
        {request.receivedAmountUsd
          ? `${parseFloat(request.receivedAmountUsd).toFixed(6).replace(/\.?0+$/, "")} ${request.tokenSymbol}`
          : `${request.amountUsd} ${request.tokenSymbol}`}
      </p>
      {!request.isSplitPayment && request.paymentDiscrepancy && request.paymentDiscrepancy !== "exact" && (
        <div className={cn(
          "w-full rounded-xl border p-4 space-y-2",
          request.paymentDiscrepancy === "overpaid" ? "border-amber-400/40 bg-amber-50/10" : "border-orange-400/40 bg-orange-50/10"
        )}>
          <p className={cn("text-sm font-semibold", request.paymentDiscrepancy === "overpaid" ? "text-amber-500" : "text-orange-500")}>
            {request.paymentDiscrepancy === "overpaid" ? t("payment-overpaid") : t("payment-underpaid")}
          </p>
          <div className="space-y-1 text-xs">
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t("payment-expected")}</span>
              <span className="font-mono font-medium">{request.amountUsd} {request.tokenSymbol}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t("payment-received-label")}</span>
              <span className="font-mono font-medium">
                {request.receivedAmountUsd
                  ? `${parseFloat(request.receivedAmountUsd).toFixed(6).replace(/\.?0+$/, "")} ${request.tokenSymbol}`
                  : "—"}
              </span>
            </div>
            {request.paymentDiscrepancy === "overpaid" && request.receivedAmountToken && (
              <div className="flex justify-between border-t pt-1 mt-1">
                <span className="text-amber-500 font-medium">{t("payment-surplus")}</span>
                <span className="font-mono font-medium text-amber-500">
                  {formatUnits(BigInt(request.receivedAmountToken) - BigInt(request.amountToken), request.tokenDecimals).replace(/\.?0+$/, "")} {request.tokenSymbol}
                </span>
              </div>
            )}
            {request.paymentDiscrepancy === "underpaid" && request.receivedAmountToken && (
              <div className="flex justify-between border-t pt-1 mt-1">
                <span className="text-orange-500 font-medium">{t("payment-shortfall")}</span>
                <span className="font-mono font-medium text-orange-500">
                  {formatUnits(BigInt(request.amountToken) - BigInt(request.receivedAmountToken), request.tokenDecimals).replace(/\.?0+$/, "")} {request.tokenSymbol}
                </span>
              </div>
            )}
          </div>
          {request.paymentDiscrepancy === "overpaid" && request.payerAddress && (
            <div className="pt-2">
              {refundState === "idle" && (
                <Button variant="outline" size="sm" className="w-full rounded-lg border-amber-400/40 text-amber-600 hover:bg-amber-50/20" onClick={() => setRefundState("confirming")}>
                  <ArrowURightDown className="mr-2 size-4" />{t("refund-surplus")}
                </Button>
              )}
              {refundState === "confirming" && (
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground">
                    {t("refund-surplus-confirm")
                      .replace("{amount}", formatUnits(BigInt(request.receivedAmountToken!) - BigInt(request.amountToken), request.tokenDecimals).replace(/\.?0+$/, ""))
                      .replace("{token}", request.tokenSymbol)
                      .replace("{address}", truncateAddress(request.payerAddress))}
                  </p>
                  <div className="flex gap-2">
                    <Button size="sm" className="flex-1 rounded-lg" onClick={handleRefundSurplus}>{t("refund-surplus")}</Button>
                    <Button size="sm" variant="outline" className="flex-1 rounded-lg" onClick={() => setRefundState("idle")}>{t("cancel")}</Button>
                  </div>
                </div>
              )}
              {refundState === "sending" && (
                <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                  <Spinner className="size-4" />{t("refunding-surplus")}
                </div>
              )}
              {refundState === "done" && (
                <div className="flex items-center justify-center gap-2 text-sm text-green-600">
                  <Check className="size-4" />{t("refund-surplus-success")}
                </div>
              )}
              {refundState === "error" && (
                <p className="text-xs text-center text-destructive">{refundError}</p>
              )}
            </div>
          )}
        </div>
      )}
      {request.isSplitPayment && request.contributions && request.contributions.length > 0 && (
        <div className="w-full rounded-xl border bg-secondary/20 p-4">
          <p className="mb-2 text-xs font-medium text-muted-foreground">{t("contributions-received")}</p>
          <div className="space-y-2">
            {request.contributions.map((contribution) => (
              <div key={contribution.id} className="flex items-center justify-between rounded-lg border bg-background p-2 text-xs">
                <div className="flex flex-col">
                  <span className="font-mono text-muted-foreground">{truncateAddress(contribution.payerAddress)}</span>
                  <span className="text-muted-foreground">{contribution.amountUsd} {contribution.tokenSymbol}</span>
                </div>
                {contribution.txHash && (
                  <a href={getTxUrl(contribution.txHash, PAYMENT_CHAIN_ID)} target="_blank" rel="noopener noreferrer" className="text-xs text-muted-foreground underline hover:text-foreground">
                    {truncateHash(contribution.txHash)}
                  </a>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
      {!request.isSplitPayment && request.txHash && (
        <a href={getTxUrl(request.txHash, PAYMENT_CHAIN_ID)} target="_blank" rel="noopener noreferrer" className="text-xs text-muted-foreground underline hover:text-foreground">
          {truncateHash(request.txHash)}
        </a>
      )}
      <Button className="w-full rounded-xl" onClick={resetLocalState}>{t("new-collection")}</Button>
    </div>
  )

  // ── mobile: Motion bottom sheet ─────────────────────────────────────────────

  if (isMobile) {
    return (
      <AnimatePresence>
        {open && (
          <>
            <motion.div
              key="collect-backdrop"
              className="fixed inset-0 z-50 bg-black/40"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={() => handleClose(false)}
            />
            <motion.div
              key="collect-panel"
              className="fixed inset-x-0 bottom-0 z-50 flex flex-col rounded-t-2xl bg-card border-t max-h-[92vh] pb-[env(safe-area-inset-bottom)]"
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", stiffness: 320, damping: 32, mass: 0.8 }}
            >
              {/* drag handle */}
              <div className="flex justify-center pt-3 pb-1 shrink-0">
                <div className="w-10 h-1 rounded-full bg-muted-foreground/30" />
              </div>

              <div className="overflow-y-auto px-6 pt-5 pb-20">
                {step === "amount" && (
                  <motion.div
                    key="step-amount"
                    initial={{ opacity: 0, y: 14 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.08, duration: 0.28, ease: "easeOut" }}
                    className="flex flex-col gap-2"
                  >
                    <h2 className="text-base font-semibold pt-2">{t("collect-title")}</h2>
                    {amountBody}
                  </motion.div>
                )}

                {step === "qr" && request && (
                  <motion.div
                    key="step-qr"
                    initial={{ opacity: 0, y: 14 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.08, duration: 0.28, ease: "easeOut" }}
                    className="flex flex-col gap-2"
                  >
                    <div className="flex items-center justify-between gap-2 pt-2">
                      <h2 className="text-base font-semibold min-w-0 truncate">
                        {t("collect-title")} ${request.amountUsd} {request.tokenSymbol}
                      </h2>
                      <Button variant="outline" className="shrink-0 rounded-xl" onClick={handleCopyLink}>
                        {copiedLink ? <Check className="mr-2 size-4 text-green-500" /> : <CopySimple className="mr-2 size-4" />}
                        {t("copy-link")}
                      </Button>
                    </div>
                    {qrBody}
                  </motion.div>
                )}

                {step === "confirmed" && request && (
                  <motion.div
                    key="step-confirmed"
                    initial={{ opacity: 0, y: 14 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.08, duration: 0.28, ease: "easeOut" }}
                    className="flex flex-col gap-2"
                  >
                    <h2 className="text-base font-semibold pt-2">{t("payment-received")}</h2>
                    {confirmedBody}
                  </motion.div>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    )
  }

  // ── desktop: Dialog (unchanged) ─────────────────────────────────────────────

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="w-full max-w-[360px] overflow-hidden rounded-4xl border bg-card p-6 shadow-sm sm:max-w-[420px]">
        {step === "amount" && (
          <>
            <DialogHeader>
              <DialogTitle>{t("collect-title")}</DialogTitle>
            </DialogHeader>
            {amountBody}
          </>
        )}
        {step === "qr" && request && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center justify-between gap-2">
                <span className="min-w-0 truncate">
                  {t("collect-title")} ${request.amountUsd} {request.tokenSymbol}
                </span>
                <Button variant="outline" className="shrink-0 rounded-xl" onClick={handleCopyLink}>
                  {copiedLink ? <Check className="mr-2 size-4 text-green-500" /> : <CopySimple className="mr-2 size-4" />}
                  {t("copy-link")}
                </Button>
              </DialogTitle>
            </DialogHeader>
            {qrBody}
          </>
        )}
        {step === "confirmed" && request && (
          <>
            <DialogHeader>
              <DialogTitle>{t("payment-received")}</DialogTitle>
            </DialogHeader>
            {confirmedBody}
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
