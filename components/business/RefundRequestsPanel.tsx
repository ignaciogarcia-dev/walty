"use client"

import { useEffect, useRef, useState } from "react"
import { useWalletContext } from "@/components/wallet/context"
import { useUnlockFlow } from "@/hooks/useUnlockFlow"
import { Button } from "@/components/ui/button"
import { useTranslation } from "@/hooks/useTranslation"

type RefundRequest = {
  id: string
  paymentRequestId: string
  requestedBy: { id: number; email: string | null; username: string | null }
  amountToken: string
  amountUsd: string
  tokenSymbol: string
  destinationAddress: string
  reason: string
  status: "pending" | "approved_pending_signature" | "rejected" | "executed"
  txHash: string | null
  txIntentId: string | null
  createdAt: string
  reviewedAt: string | null
}

export function RefundRequestsPanel() {
  const { t } = useTranslation()
  const { signAndBroadcastIntent, txHash, txStatus, txError } = useWalletContext()
  const { ensureUnlocked, unlockDialog } = useUnlockFlow()
  const [refunds, setRefunds] = useState<RefundRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const executingRefundId = useRef<string | null>(null)

  async function loadRefunds() {
    try {
      const res = await fetch("/api/business/refund-requests?status=pending")
      if (!res.ok) return
      const { data: { refundRequests } } = await res.json()
      setRefunds(refundRequests)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadRefunds()
  }, [])

  const markingRef = useRef(false)

  // When a tx completes (confirmed or error) after an execute, mark it
  useEffect(() => {
    const refundId = executingRefundId.current
    if (!refundId) return
    if (txStatus === "confirmed" && txHash) {
      executingRefundId.current = null
      markExecuted(refundId, txHash)
    } else if (txStatus === "error") {
      executingRefundId.current = null
      setActionLoading(null)
      if (txError) setError(txError)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [txStatus, txHash, txError])

  async function markExecuted(refundId: string, hash: string) {
    if (markingRef.current) return
    markingRef.current = true
    setActionLoading(refundId + "execute")
    setError(null)
    try {
      for (let attempt = 0; attempt < 5; attempt++) {
        if (attempt > 0) await new Promise((r) => setTimeout(r, 2_000 * Math.pow(2, attempt - 1)))
        try {
          const res = await fetch(`/api/business/refund-requests/${refundId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "mark_executed", txHash: hash }),
          })
          if (res.ok) {
            loadRefunds()
            return
          }
          if (attempt === 4) {
            const data = await res.json().catch(() => ({}))
            setError(data.error ?? t("error"))
          }
        } catch {
          if (attempt === 4) setError(t("error"))
        }
      }
    } finally {
      markingRef.current = false
      setActionLoading(null)
    }
  }

  async function handleAction(id: string, action: "approve" | "reject") {
    setActionLoading(id + action)
    setError(null)
    try {
      const res = await fetch(`/api/business/refund-requests/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      })
      if (!res.ok) {
        const data = await res.json()
        setError(data.error ?? t("error"))
        return
      }
      await loadRefunds()
    } finally {
      setActionLoading(null)
    }
  }

  async function handleExecute(refund: RefundRequest) {
    if (!refund.txIntentId || markingRef.current) {
      if (!refund.txIntentId) setError(t("error"))
      return
    }

    setActionLoading(refund.id + "execute")
    setError(null)

    // Check if the intent was already broadcast/confirmed (e.g. previous mark_executed failed)
    try {
      const intentRes = await fetch(`/api/tx-intents/${refund.txIntentId}`)
      if (intentRes.ok) {
        const { data: intent } = await intentRes.json()
        if ((intent.status === "confirmed" || intent.status === "broadcasted") && intent.txHash) {
          await markExecuted(refund.id, intent.txHash)
          return
        }
      }
    } catch {
      // Fall through to normal sign flow
    }

    const unlocked = await ensureUnlocked()
    if (!unlocked) {
      setActionLoading(null)
      return
    }

    executingRefundId.current = refund.id
    await signAndBroadcastIntent(refund.txIntentId)
  }

  if (loading || refunds.length === 0) {
    return <>{unlockDialog}</>
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-5 flex flex-col gap-4">
      <h3 className="font-semibold text-sm">{t("pending-refund-requests")}</h3>
      {error && <p className="text-xs text-destructive">{error}</p>}
      <div className="flex flex-col gap-4">
        {refunds.map((refund) => {
          const requester = refund.requestedBy.username ?? refund.requestedBy.email ?? t("operator")
          const isApproved = refund.status === "approved_pending_signature"
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
                <div><span className="font-medium">{t("requested-by")}</span> {requester}</div>
                <div className="truncate"><span className="font-medium">{t("destination-label")}</span> {refund.destinationAddress}</div>
                <div><span className="font-medium">{t("reason-label")}</span> {refund.reason}</div>
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
                      {actionLoading === refund.id + "approve" ? t("approving") : t("approve")}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleAction(refund.id, "reject")}
                      disabled={!!actionLoading}
                      className="flex-1 text-destructive border-destructive/30 hover:bg-destructive/10"
                    >
                      {actionLoading === refund.id + "reject" ? t("rejecting") : t("reject")}
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
                    {actionLoading === refund.id + "execute" ? t("executing") : t("execute-refund")}
                  </Button>
                )}
              </div>
            </div>
          )
        })}
      </div>
      {unlockDialog}
    </div>
  )
}
