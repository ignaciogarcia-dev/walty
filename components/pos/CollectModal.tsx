"use client"

import { useEffect, useMemo, useState } from "react"
import { QRCodeSVG } from "qrcode.react"
import {
  ArrowClockwise,
  ArrowLeft,
  Check,
  CheckCircle,
  Circle,
  CopySimple,
  LinkSimple,
  ShareNetwork,
  Users,
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
  isPaymentTokenSymbol,
} from "@/lib/payments/config"
import { getAbsolutePaymentUrl } from "@/lib/payments/paymentLinks"
import type { PaymentRequestView } from "@/lib/payments/types"
import {
  getPaymentRequestCountdown,
  getPaymentRequestStatus,
  getPaymentShareText,
} from "@/lib/payments/types"
import { copyToClipboard } from "@/utils/copyToClipboard"
import { cn } from "@/utils/style"

const TOKENS = ["USDC", "USDT"] as const

type Token = typeof TOKENS[number]
type Step = "amount" | "token" | "qr" | "confirmed"

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

export function CollectModal({
  open,
  onOpenChange,
  merchantWalletAddress,
  activeRequest = null,
  onRequestChange,
}: CollectModalProps) {
  const [step, setStep] = useState<Step>("amount")
  const [amount, setAmount] = useState("")
  const [token, setToken] = useState<Token>("USDC")
  const [isSplitPayment, setIsSplitPayment] = useState(false)
  const [request, setRequest] = useState<PaymentRequestView | null>(null)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copiedAddress, setCopiedAddress] = useState(false)
  const [copiedLink, setCopiedLink] = useState(false)
  const [now, setNow] = useState(0)

  useEffect(() => {
    if (!request) return

    const id = setInterval(() => setNow(Date.now()), 1_000)
    return () => clearInterval(id)
  }, [request])

  useEffect(() => {
    if (!open || !activeRequest) return

    setRequest(activeRequest)
    setAmount(activeRequest.amountUsd)

    if (isPaymentTokenSymbol(activeRequest.tokenSymbol)) {
      setToken(activeRequest.tokenSymbol)
    }

    setError(null)
    setStep(activeRequest.status === "paid" ? "confirmed" : "qr")
  }, [activeRequest, open])

  useEffect(() => {
    if (!request) return
    if (request.status !== "pending" && request.status !== "confirming") return

    let cancelled = false

    const poll = async () => {
      try {
        const res = await fetch(`/api/payment-requests/${request.id}`)
        if (!res.ok) return

        const next = (await res.json()) as PaymentRequestView
        if (cancelled) return

        setRequest(next)
        onRequestChange?.(next)

        if (next.status === "paid") {
          setStep("confirmed")
        }
      } catch {
        // Retry on the next tick.
      }
    }

    poll()
    const id = setInterval(poll, PAYMENT_MODAL_POLL_INTERVAL_MS)

    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [onRequestChange, request])

  const requestStatus = request ? getPaymentRequestStatus(request, now ?? 0) : "pending"
  const countdown = request && now > 0
    ? getPaymentRequestCountdown(request.expiresAt, now)
    : { expired: false, label: "--:--", seconds: 0 }
  const paymentUrl = useMemo(() => {
    if (!request || typeof window === "undefined") return ""
    return getAbsolutePaymentUrl(request.id, window.location.origin)
  }, [request])
  const shareSupported = typeof navigator !== "undefined" && typeof navigator.share === "function"

  function resetLocalState() {
    setStep("amount")
    setAmount("")
    setToken("USDC")
    setIsSplitPayment(false)
    setRequest(null)
    setError(null)
    setCreating(false)
    setCopiedAddress(false)
    setCopiedLink(false)
  }

  function handleClose(nextOpen: boolean) {
    if (!nextOpen) {
      resetLocalState()
    }
    onOpenChange(nextOpen)
  }

  async function handleCreateRequest() {
    if (!merchantWalletAddress) {
      setError("Desbloquea la wallet del comercio para crear el cobro.")
      return
    }

    setCreating(true)
    setError(null)

    try {
      const res = await fetch("/api/payment-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amountUsd: amount,
          token,
          merchantWalletAddress,
          isSplitPayment,
        }),
      })

      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? "Error al crear el cobro")
        return
      }

      const nextRequest = data as PaymentRequestView
      setRequest(nextRequest)
      onRequestChange?.(nextRequest)
      setStep("qr")
    } catch {
      setError("Error de conexión")
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

  async function handleShareLink() {
    if (!request || !paymentUrl || !shareSupported) return
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

  const amountValid = amount !== "" && !Number.isNaN(Number(amount)) && Number(amount) > 0

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-sm rounded-4xl border bg-card p-6 shadow-sm">
        {step === "amount" && (
          <>
            <DialogHeader>
              <DialogTitle>Cobrar</DialogTitle>
            </DialogHeader>
            <div className="flex flex-col gap-4 py-2">
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-muted-foreground">Monto</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">$</span>
                  <Input
                    type="number"
                    min="0.01"
                    step="0.01"
                    placeholder="0.00"
                    className="rounded-xl pl-7 text-lg"
                    value={amount}
                    onChange={(event) => setAmount(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && amountValid) {
                        setStep("token")
                      }
                    }}
                    autoFocus
                  />
                </div>
                <p className="text-xs text-muted-foreground">Moneda: USD</p>
              </div>
              <button
                type="button"
                onClick={() => setIsSplitPayment(!isSplitPayment)}
                className={cn(
                  "flex items-center gap-2 rounded-xl border p-3 text-left transition-colors",
                  isSplitPayment
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-primary/50"
                )}
              >
                {isSplitPayment ? (
                  <CheckCircle size={20} weight="fill" className="shrink-0 text-primary" />
                ) : (
                  <Circle size={20} className="shrink-0 text-muted-foreground" />
                )}
                <div className="flex items-center gap-2">
                  <Users size={18} className={isSplitPayment ? "text-primary" : "text-muted-foreground"} />
                  <span className={cn("text-sm font-medium", isSplitPayment ? "text-primary" : "text-foreground")}>
                    Pago dividido
                  </span>
                </div>
              </button>
              <Button
                className="w-full rounded-xl"
                onClick={() => setStep("token")}
                disabled={!amountValid}
              >
                Continuar
              </Button>
            </div>
          </>
        )}

        {step === "token" && (
          <>
            <DialogHeader>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setStep("amount")}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <ArrowLeft size={16} />
                </button>
                <DialogTitle>¿Con qué token pagará el cliente?</DialogTitle>
              </div>
            </DialogHeader>
            <div className="flex flex-col gap-3 py-2">
              {TOKENS.map((candidate) => (
                <button
                  key={candidate}
                  type="button"
                  onClick={() => setToken(candidate)}
                  className={cn(
                    "flex items-center gap-3 rounded-2xl border p-4 text-left transition-colors",
                    token === candidate
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-primary/50"
                  )}
                >
                  {token === candidate ? (
                    <CheckCircle size={20} weight="fill" className="shrink-0 text-primary" />
                  ) : (
                    <Circle size={20} className="shrink-0 text-muted-foreground" />
                  )}
                  <div>
                    <p className="font-medium">{candidate}</p>
                    <p className="text-xs text-muted-foreground">
                      {candidate === "USDC" ? "USD Coin" : "Tether"} · Polygon
                    </p>
                  </div>
                </button>
              ))}
              {error && <p className="text-xs text-destructive">{error}</p>}
              <Button
                className="w-full rounded-xl"
                onClick={handleCreateRequest}
                disabled={creating}
              >
                {creating ? (
                  <>
                    <Spinner className="mr-2" />
                    Generando QR...
                  </>
                ) : (
                  "Continuar"
                )}
              </Button>
            </div>
          </>
        )}

        {step === "qr" && request && (
          <>
            <DialogHeader>
              <DialogTitle>
                Cobrar ${request.amountUsd} {request.tokenSymbol}
              </DialogTitle>
            </DialogHeader>
            <div className="flex flex-col items-center gap-4 py-2">
              <div className="rounded-2xl border bg-white p-4 shadow-xs">
                <QRCodeSVG value={paymentUrl} size={200} level="M" includeMargin={false} />
              </div>

              <div className="flex w-full items-center justify-between rounded-xl border bg-secondary/20 px-4 py-3">
                <span className="font-mono text-sm text-muted-foreground">
                  {truncateAddress(request.merchantWalletAddress)}
                </span>
                <button
                  type="button"
                  onClick={handleCopyAddress}
                  className="ml-2 text-muted-foreground hover:text-foreground"
                >
                  {copiedAddress ? (
                    <Check size={16} className="text-green-500" />
                  ) : (
                    <CopySimple size={16} />
                  )}
                </button>
              </div>

              <div className="w-full rounded-2xl border bg-secondary/20 p-4">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <LinkSimple size={14} />
                  Link público
                </div>
                <p className="mt-2 break-all text-sm text-foreground">{paymentUrl}</p>
                <div className="mt-3 flex gap-2">
                  <Button variant="outline" className="flex-1 rounded-xl" onClick={handleCopyLink}>
                    {copiedLink ? <Check className="mr-2 size-4 text-green-500" /> : <CopySimple className="mr-2 size-4" />}
                    Copiar link
                  </Button>
                  {shareSupported && (
                    <Button variant="outline" className="flex-1 rounded-xl" onClick={handleShareLink}>
                      <ShareNetwork className="mr-2 size-4" />
                      Compartir
                    </Button>
                  )}
                </div>
              </div>

              {request.isSplitPayment && (
                <div className="w-full rounded-2xl border bg-secondary/20 p-4">
                  <div className="mb-3 flex items-center gap-2">
                    <Users size={16} className="text-primary" />
                    <span className="text-sm font-medium">Pago dividido</span>
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Total a pagar:</span>
                      <span className="font-medium">{request.amountUsd} {request.tokenSymbol}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Total pagado:</span>
                      <span className="font-medium text-green-600">{request.totalPaidUsd ?? "0.00"} {request.tokenSymbol}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Restante:</span>
                      <span className="font-medium text-amber-600">{request.remainingAmountUsd ?? request.amountUsd} {request.tokenSymbol}</span>
                    </div>
                  </div>
                  {request.contributions && request.contributions.length > 0 && (
                    <div className="mt-4 border-t pt-3">
                      <p className="mb-2 text-xs font-medium text-muted-foreground">Contribuciones:</p>
                      <div className="space-y-2">
                        {request.contributions.map((contribution) => (
                          <div
                            key={contribution.id}
                            className="flex items-center justify-between rounded-lg border bg-background p-2 text-xs"
                          >
                            <div className="flex flex-col">
                              <span className="font-mono text-muted-foreground">
                                {truncateAddress(contribution.payerAddress)}
                              </span>
                              <span className="text-muted-foreground">
                                {contribution.amountUsd} {contribution.tokenSymbol}
                              </span>
                            </div>
                            <div className="flex flex-col items-end">
                              <span
                                className={cn(
                                  "text-xs",
                                  contribution.status === "confirmed"
                                    ? "text-green-600"
                                    : contribution.status === "confirming"
                                    ? "text-amber-600"
                                    : "text-muted-foreground"
                                )}
                              >
                                {contribution.status === "confirmed"
                                  ? "Confirmado"
                                  : contribution.status === "confirming"
                                  ? "Confirmando"
                                  : "Pendiente"}
                              </span>
                              {contribution.txHash && (
                                <a
                                  href={getTxUrl(contribution.txHash, PAYMENT_CHAIN_ID)}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-xs text-muted-foreground underline hover:text-foreground"
                                >
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
                <span>Red: Polygon</span>
                <span className={cn("font-mono", requestStatus === "expired" ? "text-destructive" : "")}>
                  {requestStatus === "confirming"
                    ? `${request.confirmations}/${request.requiredConfirmations} confirmaciones`
                    : requestStatus === "expired"
                    ? "Expirado"
                    : `Expira en ${countdown.label}`}
                </span>
              </div>

              {requestStatus === "pending" && (
                <p className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Spinner className="size-4" />
                  Esperando pago...
                </p>
              )}

              {requestStatus === "confirming" && (
                <p className="flex items-center gap-2 text-sm text-amber-500">
                  <Spinner className="size-4" />
                  Pago detectado · Confirmando...
                </p>
              )}

              {requestStatus === "expired" && (
                <div className="flex w-full flex-col items-center gap-3">
                  <p className="text-sm text-destructive">Este cobro expiró</p>
                  <Button
                    variant="outline"
                    className="w-full rounded-xl"
                    onClick={resetLocalState}
                  >
                    <ArrowClockwise className="mr-2 size-4" />
                    Crear nuevo cobro
                  </Button>
                </div>
              )}
            </div>
          </>
        )}

        {step === "confirmed" && request && (
          <>
            <DialogHeader>
              <DialogTitle>Pago recibido</DialogTitle>
            </DialogHeader>
            <div className="flex flex-col items-center gap-4 py-4">
              <CheckCircle size={64} weight="fill" className="text-green-500" />
              <p className="text-2xl font-semibold">
                {request.amountUsd} {request.tokenSymbol}
              </p>
              {request.isSplitPayment && request.contributions && request.contributions.length > 0 && (
                <div className="w-full rounded-xl border bg-secondary/20 p-4">
                  <p className="mb-2 text-xs font-medium text-muted-foreground">Contribuciones recibidas:</p>
                  <div className="space-y-2">
                    {request.contributions.map((contribution) => (
                      <div
                        key={contribution.id}
                        className="flex items-center justify-between rounded-lg border bg-background p-2 text-xs"
                      >
                        <div className="flex flex-col">
                          <span className="font-mono text-muted-foreground">
                            {truncateAddress(contribution.payerAddress)}
                          </span>
                          <span className="text-muted-foreground">
                            {contribution.amountUsd} {contribution.tokenSymbol}
                          </span>
                        </div>
                        {contribution.txHash && (
                          <a
                            href={getTxUrl(contribution.txHash, PAYMENT_CHAIN_ID)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-muted-foreground underline hover:text-foreground"
                          >
                            {truncateHash(contribution.txHash)}
                          </a>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {!request.isSplitPayment && request.txHash && (
                <a
                  href={getTxUrl(request.txHash, PAYMENT_CHAIN_ID)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-muted-foreground underline hover:text-foreground"
                >
                  {truncateHash(request.txHash)}
                </a>
              )}
              <Button className="w-full rounded-xl" onClick={resetLocalState}>
                Nuevo cobro
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
