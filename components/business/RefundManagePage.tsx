"use client"

import { useEffect, useRef, useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { Check, Warning, XCircle } from "@phosphor-icons/react"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { useWalletContext } from "@/components/wallet/context"
import { useUnlockFlow } from "@/hooks/useUnlockFlow"
import { useTranslation } from "@/hooks/useTranslation"
import { cn } from "@/utils/style"
import { ExplorerLink } from "../wallet/ExplorerLink"
import { markRefundExecuted } from "@/lib/business/refundRequests"
import { canTransition, type RefundStatus } from "@/lib/business/RefundStateMachine"

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

type StatusFilter = "pending" | "all"

function truncateAddress(addr: string) {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`
}

export function RefundManagePage() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const { signAndBroadcastIntent, txHash, txStatus, txError } = useWalletContext()
  const { ensureUnlocked, unlockDialog } = useUnlockFlow()
  const [filter, setFilter] = useState<StatusFilter>("pending")
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const executingRefundId = useRef<string | null>(null)
  const markingRef = useRef(false)
  const refundQueryKey = ["refund-requests", filter] as const

  const { data: refunds = [], isLoading: loading } = useQuery({
    queryKey: refundQueryKey,
    queryFn: async () => {
      const res = await fetch(`/api/business/refund-requests?status=${filter}`)
      if (!res.ok) throw new Error("Failed to load refunds")
      const {
        data: { refundRequests },
      } = await res.json()
      return refundRequests as RefundRequest[]
    },
    staleTime: 30_000,
  })

  function invalidateRefunds() {
    queryClient.invalidateQueries({ queryKey: ["refund-requests"] })
  }

  // Watch tx result after signing a refund
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
      await markRefundExecuted(refundId, hash)
      invalidateRefunds()
    } catch (err) {
      setError(err instanceof Error ? err.message : t("error"))
    } finally {
      markingRef.current = false
      setActionLoading(null)
    }
  }

  async function handleApprove(refund: RefundRequest) {
    // Map current status to RefundStatus for state machine
    const refundStatus: RefundStatus = refund.status === "pending" ? "pending" : refund.status === "approved_pending_signature" ? "approved_pending_signature" : refund.status === "rejected" ? "rejected" : "executed"

    const decision = canTransition(refundStatus, {
      type: "approve",
      approver: "owner",
    })

    if (!decision.allowed) {
      setError(decision.message ?? t("error"))
      return
    }

    setActionLoading(refund.id + "approve")
    setError(null)
    try {
      const res = await fetch(`/api/business/refund-requests/${refund.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "approve" }),
      })
      if (!res.ok) {
        const data = await res.json()
        setError(data.error ?? t("error"))
        return
      }
      invalidateRefunds()
    } finally {
      setActionLoading(null)
    }
  }

  async function handleReject(id: string) {
    setActionLoading(id + "reject")
    setError(null)
    try {
      const res = await fetch(`/api/business/refund-requests/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reject" }),
      })
      if (!res.ok) {
        const data = await res.json()
        setError(data.error ?? t("error"))
        return
      }
      invalidateRefunds()
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

    // Parent controls the entire flow: unlock → sign
    const unlocked = await ensureUnlocked()
    if (!unlocked) {
      setActionLoading(null)
      return
    }

    executingRefundId.current = refund.id
    await signAndBroadcastIntent(refund.txIntentId)
  }

  function statusBadge(status: RefundRequest["status"]) {
    switch (status) {
      case "pending":
        return <span className="rounded-full bg-amber-500/10 px-2.5 py-0.5 text-xs font-medium text-amber-600">{t("refund-status-pending")}</span>
      case "approved_pending_signature":
        return <span className="rounded-full bg-blue-500/10 px-2.5 py-0.5 text-xs font-medium text-blue-600">{t("refund-status-approved")}</span>
      case "rejected":
        return <span className="rounded-full bg-destructive/10 px-2.5 py-0.5 text-xs font-medium text-destructive">{t("refund-status-rejected")}</span>
      case "executed":
        return <span className="rounded-full bg-green-500/10 px-2.5 py-0.5 text-xs font-medium text-green-600">{t("refund-status-executed")}</span>
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-10 flex flex-col gap-6">

      <h2 className="text-lg font-semibold">{t("refunds-tab-title")}</h2>

      {/* Filter tabs */}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setFilter("pending")}
          className={cn(
            "rounded-xl px-3 py-1.5 text-sm font-medium transition-colors",
            filter === "pending"
              ? "bg-primary text-primary-foreground"
              : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
          )}
        >
          {t("refund-status-pending")}
        </button>
        <button
          type="button"
          onClick={() => setFilter("all")}
          className={cn(
            "rounded-xl px-3 py-1.5 text-sm font-medium transition-colors",
            filter === "all"
              ? "bg-primary text-primary-foreground"
              : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
          )}
        >
          {t("all")}
        </button>
      </div>

      {error && <p className="text-xs text-destructive">{error}</p>}

      {loading && (
        <div className="flex items-center justify-center py-8">
          <Spinner className="size-6" />
        </div>
      )}

      {!loading && refunds.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-8">
          {t("no-refund-requests")}
        </p>
      )}

      {!loading && refunds.length > 0 && (
        <div className="flex flex-col gap-4">
          {refunds.map((refund) => {
            const requester = refund.requestedBy.username ?? refund.requestedBy.email ?? t("operator")
            const date = new Date(refund.createdAt).toLocaleDateString("es-AR")

            return (
              <div key={refund.id} className="rounded-2xl border border-border bg-card p-5 flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">
                    ${refund.amountUsd} {refund.tokenSymbol}
                  </span>
                  <div className="flex items-center gap-2">
                    {statusBadge(refund.status)}
                    <span className="text-xs text-muted-foreground">{date}</span>
                  </div>
                </div>

                <div className="text-xs text-muted-foreground flex flex-col gap-0.5">
                  <div><span className="font-medium">{t("requested-by")}</span> {requester}</div>
                  <div className="truncate"><span className="font-medium">{t("destination-label")}</span> {truncateAddress(refund.destinationAddress)}</div>
                  <div><span className="font-medium">{t("reason-label")}</span> {refund.reason}</div>
                  {refund.txHash &&
                    <div className="flex items-center gap-1">
                      <span className="font-medium">Tx:</span>
                      <ExplorerLink
                        hash={refund.txHash} chainId={137} />
                    </div>
                  }
                </div>

                {/* Action buttons */}
                {refund.status === "pending" && (
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={() => handleApprove(refund)}
                      disabled={!!actionLoading}
                      className="flex-1"
                    >
                      {actionLoading === refund.id + "approve" ? (
                        <><Spinner className="mr-2 size-3" />{t("approving")}</>
                      ) : (
                        <><Check className="mr-1 size-3" />{t("approve")}</>
                      )}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleReject(refund.id)}
                      disabled={!!actionLoading}
                      className="flex-1 text-destructive border-destructive/30 hover:bg-destructive/10"
                    >
                      {actionLoading === refund.id + "reject" ? (
                        <><Spinner className="mr-2 size-3" />{t("rejecting")}</>
                      ) : (
                        <><XCircle className="mr-1 size-3" />{t("reject")}</>
                      )}
                    </Button>
                  </div>
                )}

                {refund.status === "approved_pending_signature" && (
                  <Button
                    size="sm"
                    onClick={() => handleExecute(refund)}
                    disabled={!!actionLoading}
                    className="w-full"
                  >
                    {actionLoading === refund.id + "execute" ? (
                      <><Spinner className="mr-2 size-3" />{t("signing-refund")}</>
                    ) : (
                      <><Warning className="mr-1 size-3" />{t("sign-refund")}</>
                    )}
                  </Button>
                )}
              </div>
            )
          })}
        </div>
      )}

      {unlockDialog}
    </div>
  )
}
