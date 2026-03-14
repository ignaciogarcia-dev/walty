"use client"

import { useEffect, useRef, useState } from "react"
import { useWalletContext } from "@/components/wallet/context"
import { getTokensByChain } from "@/lib/tokens/tokenRegistry"
import { PAYMENT_CHAIN_ID } from "@/lib/payments/config"
import { Button } from "@/components/ui/button"

type RefundRequest = {
  id: string
  paymentRequestId: string
  requestedBy: { id: number; email: string | null; username: string | null }
  amountToken: string
  amountUsd: string
  tokenSymbol: string
  destinationAddress: string
  reason: string
  status: "pending" | "approved" | "rejected" | "executed"
  txHash: string | null
  createdAt: string
  reviewedAt: string | null
}

export function RefundRequestsPanel() {
  const { sendToken, txHash, txStatus } = useWalletContext()
  const [refunds, setRefunds] = useState<RefundRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const executingRefundId = useRef<string | null>(null)

  async function loadRefunds() {
    try {
      const res = await fetch("/api/business/refund-requests?status=pending")
      if (!res.ok) return
      const data = await res.json()
      setRefunds(data.refundRequests)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadRefunds()
  }, [])

  // When a tx completes (confirmed or error) after an execute, mark it
  useEffect(() => {
    const refundId = executingRefundId.current
    if (!refundId) return
    if (txStatus === "confirmed" && txHash) {
      executingRefundId.current = null
      fetch(`/api/business/refund-requests/${refundId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "mark_executed", txHash }),
      }).then(() => loadRefunds())
      setActionLoading(null)
    } else if (txStatus === "error") {
      executingRefundId.current = null
      setActionLoading(null)
    }
  }, [txStatus, txHash])

  async function handleAction(id: string, action: "approve" | "reject") {
    setActionLoading(id + action)
    try {
      const res = await fetch(`/api/business/refund-requests/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      })
      if (!res.ok) {
        const data = await res.json()
        alert(data.error ?? "Error")
        return
      }
      await loadRefunds()
    } finally {
      setActionLoading(null)
    }
  }

  async function handleExecute(refund: RefundRequest) {
    const tokens = getTokensByChain(PAYMENT_CHAIN_ID)
    const token = tokens.find((t) => t.symbol === refund.tokenSymbol)
    if (!token) {
      alert("Token no encontrado")
      return
    }

    // Convert amountToken (raw smallest unit) to decimal string
    const decimals = token.decimals
    const raw = BigInt(refund.amountToken)
    const divisor = BigInt(10 ** decimals)
    const whole = raw / divisor
    const frac = raw % divisor
    const fracStr = frac.toString().padStart(decimals, "0").replace(/0+$/, "")
    const amountDecimal = fracStr ? `${whole}.${fracStr}` : `${whole}`

    executingRefundId.current = refund.id
    setActionLoading(refund.id + "execute")
    // sendToken is async but doesn't return hash; result is delivered via txHash/txStatus effect
    await sendToken(token, refund.destinationAddress, amountDecimal, PAYMENT_CHAIN_ID)
  }

  if (loading) {
    return <div className="text-sm text-muted-foreground text-center py-4">Cargando solicitudes...</div>
  }

  if (refunds.length === 0) {
    return null
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-5 flex flex-col gap-4">
      <h3 className="font-semibold text-sm">Solicitudes de reembolso pendientes</h3>
      <div className="flex flex-col gap-4">
        {refunds.map((refund) => {
          const requester = refund.requestedBy.username ?? refund.requestedBy.email ?? "Operador"
          const isApproved = refund.status === "approved"
          const date = new Date(refund.createdAt).toLocaleDateString("es-AR")

          return (
            <div key={refund.id} className="rounded-xl border border-border p-4 flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">
                  ${refund.amountUsd} {refund.tokenSymbol}
                </span>
                <span className="text-xs text-muted-foreground">{date}</span>
              </div>
              <div className="text-xs text-muted-foreground flex flex-col gap-0.5">
                <div><span className="font-medium">Solicitado por:</span> {requester}</div>
                <div className="truncate"><span className="font-medium">Destino:</span> {refund.destinationAddress}</div>
                <div><span className="font-medium">Motivo:</span> {refund.reason}</div>
              </div>
              <div className="flex gap-2">
                {refund.status === "pending" && (
                  <>
                    <Button
                      size="sm"
                      onClick={() => handleAction(refund.id, "approve")}
                      disabled={!!actionLoading}
                      className="flex-1"
                    >
                      {actionLoading === refund.id + "approve" ? "Aprobando..." : "Aprobar"}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleAction(refund.id, "reject")}
                      disabled={!!actionLoading}
                      className="flex-1 text-destructive border-destructive/30 hover:bg-destructive/10"
                    >
                      {actionLoading === refund.id + "reject" ? "Rechazando..." : "Rechazar"}
                    </Button>
                  </>
                )}
                {isApproved && (
                  <Button
                    size="sm"
                    onClick={() => handleExecute(refund)}
                    disabled={!!actionLoading}
                    className="flex-1"
                  >
                    {actionLoading === refund.id + "execute" ? "Ejecutando..." : "Ejecutar reembolso"}
                  </Button>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
