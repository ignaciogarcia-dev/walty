"use client"
import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { useWalletContext } from "@/components/wallet/context"
import { PAYMENT_CHAIN_ID, PAYMENT_MODAL_POLL_INTERVAL_MS } from "@/lib/payments/config"
import type { PaymentRequestView } from "@/lib/payments/types"
import {
  getPaymentRequestCountdown,
  getPaymentRequestStatus,
} from "@/lib/payments/types"
import { getTokensByChain } from "@/lib/tokens/tokenRegistry"
import { getTxUrl } from "@/lib/explorer/getTxUrl"
import { CheckCircle, ArrowLeft } from "@phosphor-icons/react"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"

function truncateAddress(addr: string) {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`
}

function truncateHash(hash: string) {
  return `${hash.slice(0, 8)}…${hash.slice(-6)}`
}

export default function DashboardPayPage() {
  const { requestId } = useParams<{ requestId: string }>()
  const router = useRouter()
  const { sendToken, txStatus, txHash, txError, resetTx } = useWalletContext()

  const [request, setRequest] = useState<PaymentRequestView | null>(null)
  const [loading, setLoading] = useState(true)
  const [submitted, setSubmitted] = useState(false)
  const [now, setNow] = useState(0)

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      try {
        const res = await fetch(`/api/payment-requests/${requestId}`)
        if (!res.ok) {
          if (!cancelled) setLoading(false)
          return
        }

        const data = (await res.json()) as PaymentRequestView
        if (!cancelled) {
          setRequest(data)
          setLoading(false)
        }
      } catch {
        if (!cancelled) setLoading(false)
      }
    }

    load()

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

  async function handlePay() {
    if (!request) return
    const tokens = getTokensByChain(PAYMENT_CHAIN_ID)
    const token = tokens.find((t) => t.symbol === request.tokenSymbol)
    if (!token) return
    setSubmitted(true)
    await sendToken(token, request.merchantWalletAddress, request.amountUsd, PAYMENT_CHAIN_ID)
  }

  const status = request ? getPaymentRequestStatus(request, now ?? 0) : "pending"
  const countdown = request && now > 0 ? getPaymentRequestCountdown(request.expiresAt, now) : null
  const isSending = submitted && (txStatus === "pending" || txStatus === "pending_on_chain")
  const showTxError = submitted && txStatus === "error" && txError

  if (loading) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-10 flex items-center justify-center">
        <Spinner className="size-6" />
      </div>
    )
  }

  if (!request || status === "expired") {
    return (
      <div className="mx-auto max-w-2xl px-4 py-10 flex flex-col gap-4 items-center text-center">
        <p className="text-lg font-semibold">
          {status === "expired" ? "Este cobro expiró" : "Este cobro no está disponible"}
        </p>
        <p className="text-sm text-muted-foreground">Solicita un nuevo QR al comercio.</p>
        <Button variant="outline" onClick={() => router.push("/dashboard/home")}>
          Volver al inicio
        </Button>
      </div>
    )
  }

  if (status === "paid") {
    return (
      <div className="mx-auto max-w-sm px-4 py-10 flex flex-col items-center gap-4 text-center">
        <CheckCircle size={64} weight="fill" className="text-green-500" />
        <p className="text-2xl font-semibold">Pago confirmado</p>
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
        <Button className="w-full rounded-xl" onClick={() => { resetTx(); router.push("/dashboard/home") }}>
          Volver al inicio
        </Button>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-sm px-4 py-10 flex flex-col gap-6">
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => router.back()} className="text-muted-foreground hover:text-foreground">
          <ArrowLeft size={18} />
        </button>
        <h1 className="text-lg font-semibold">Confirmar pago</h1>
      </div>

      <div className="rounded-2xl border bg-card p-5 flex flex-col gap-4">
        <div className="text-center">
          <p className="text-3xl font-bold">${request.amountUsd}</p>
          <p className="text-muted-foreground mt-1">{request.tokenSymbol} · Polygon</p>
        </div>

        <div className="rounded-xl border bg-secondary/20 px-4 py-3 flex flex-col gap-1">
          <p className="text-xs text-muted-foreground">Para</p>
          <p className="font-mono text-sm">{truncateAddress(request.merchantWalletAddress)}</p>
        </div>

        <div className="rounded-xl border bg-secondary/20 px-4 py-3 flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Estado</span>
          <span className="font-medium text-foreground">
            {status === "confirming"
              ? `${request.confirmations}/${request.requiredConfirmations} confirmaciones`
              : countdown
              ? `Expira en ${countdown.label}`
              : "Pendiente"}
          </span>
        </div>

        {submitted && txHash && status === "pending" && (
          <div className="rounded-xl border border-primary/20 bg-primary/5 px-4 py-3 text-sm text-primary">
            <p className="font-medium">Transacción enviada. Esperando detección del backend.</p>
            <a
              href={getTxUrl(txHash, PAYMENT_CHAIN_ID)}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-block text-xs underline"
            >
              {truncateHash(txHash)}
            </a>
          </div>
        )}

        {status === "confirming" && (
          <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-sm text-amber-700">
            Pago detectado. Esperando confirmaciones en Polygon.
          </div>
        )}

        {showTxError && (
          <p className="text-xs text-destructive text-center">{txError}</p>
        )}

        {status === "pending" && (!submitted || txStatus === "error") && (
          <Button
            className="w-full rounded-xl"
            size="lg"
            onClick={handlePay}
            disabled={isSending}
          >
            {isSending ? (
              <>
                <Spinner className="mr-2 size-4" />
                Enviando...
              </>
            ) : (
              `Pagar ${request.amountUsd} ${request.tokenSymbol}`
            )}
          </Button>
        )}

        {isSending && (
          <p className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <Spinner className="size-4" />
            Enviando transacción...
          </p>
        )}
      </div>
    </div>
  )
}
