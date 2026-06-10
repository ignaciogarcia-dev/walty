"use client"

import { useEffect, useMemo, useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { formatUnits } from "viem"
import type { PaymentRequestView } from "@walty/shared/payments/types"
import {
  getPaymentRequestCountdown,
  getPaymentRequestStatus,
} from "@walty/shared/payments/types"
import { usePaymentRequestStatus } from "@/hooks/usePaymentRequestStatus"
import { useTranslation } from "@/hooks/useTranslation"
import { unwrap } from "@/lib/api/unwrap"
import { getAbsolutePaymentUrl } from "@/lib/payments/paymentLinks"
import { validateCollectForm } from "@/lib/payments/CollectModalValidation"
import { copyToClipboard } from "@/utils/copyToClipboard"

export type Step = "amount" | "qr" | "confirmed"
export type RefundState = "idle" | "confirming" | "sending" | "done" | "error"

const TOKEN = "USDC"

export interface UseCollectPaymentParams {
  open: boolean
  onOpenChange: (open: boolean) => void
  merchantWalletAddress: string | null
  activeRequest?: PaymentRequestView | null
  onRequestChange?: (request: PaymentRequestView | null) => void
}

// Owns all CollectModal state, polling and handlers so the component is just
// layout. Behavior is unchanged from the previous inline implementation.
export function useCollectPayment({
  open,
  onOpenChange,
  merchantWalletAddress,
  activeRequest = null,
  onRequestChange,
}: UseCollectPaymentParams) {
  const { t } = useTranslation()
  const [step, setStep] = useState<Step>("amount")
  const [amount, setAmount] = useState("")
  const token = TOKEN
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
  const pollableStatus =
    request?.status === "pending" || request?.status === "confirming"
  const queryClient = useQueryClient()

  // Subscribe to live status events. On each transition we refetch the full
  // detail row once (the WS payload only carries status/txHash, not the
  // surplus / received-amount fields the UI needs).
  const detailQueryKey = useMemo(
    () => ["payment-request-detail", requestId] as const,
    [requestId],
  )
  const liveStatus = usePaymentRequestStatus(
    requestId && pollableStatus ? requestId : null,
  )

  const { data: detail } = useQuery({
    queryKey: detailQueryKey,
    queryFn: async () => {
      const res = await fetch(`/api/business/payment-requests/${requestId}`)
      if (!res.ok) return null
      return unwrap<PaymentRequestView>(await res.json())
    },
    enabled: !!requestId && pollableStatus,
    staleTime: 0,
    gcTime: 0,
  })

  useEffect(() => {
    if (!liveStatus || !requestId) return
    queryClient.invalidateQueries({ queryKey: detailQueryKey })
  }, [liveStatus, requestId, queryClient, detailQueryKey])

  useEffect(() => {
    if (!detail) return
    setRequest(detail)
    onRequestChange?.(detail)
    if (detail.status === "paid") setStep("confirmed")
  }, [detail, onRequestChange])

  const requestStatus = request
    ? getPaymentRequestStatus(request, now ?? 0)
    : "pending"
  const countdown =
    request && now > 0
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
        body: JSON.stringify({
          amountUsd: amount,
          token,
          merchantWalletAddress,
          isSplitPayment,
        }),
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

  const amountValid =
    amount !== "" && !Number.isNaN(Number(amount)) && Number(amount) > 0

  return {
    step,
    amount,
    isSplitPayment,
    request,
    creating,
    error,
    copiedAddress,
    copiedLink,
    refundState,
    refundError,
    requestStatus,
    countdown,
    amountValid,
    setIsSplitPayment,
    setRefundState,
    handleAmountChange,
    handleCreateRequest,
    handleRefundSurplus,
    handleCopyAddress,
    handleCopyLink,
    resetLocalState,
    handleClose,
  }
}
