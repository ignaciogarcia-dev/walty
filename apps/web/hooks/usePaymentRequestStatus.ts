import { useEffect, useState } from "react"
import type { PaymentRequestEvent } from "@walty/shared/payments/events"
import { getNamespaceSocket } from "@/lib/ws/socketClient"

export type PaymentRequestStatus = {
  status: "pending" | "detected" | "confirming" | "paid" | "expired" | "cancelled"
  confirmations?: number
  requiredConfirmations?: number
  txHash?: string
  amount?: string
}

/**
 * Subscribes to live status updates for a payment request via the
 * /payment-requests socket.io namespace. Returns the latest snapshot;
 * `null` until at least one event arrives or the subscription is
 * disabled.
 */
export function usePaymentRequestStatus(
  requestId: string | null | undefined,
): PaymentRequestStatus | null {
  const [status, setStatus] = useState<PaymentRequestStatus | null>(null)

  useEffect(() => {
    if (!requestId) return
    const socket = getNamespaceSocket("/payment-requests")

    const handle = (event: PaymentRequestEvent) => {
      if (event.requestId !== requestId) return
      switch (event.type) {
        case "detected":
          setStatus({ status: "detected", txHash: event.txHash })
          return
        case "confirming":
          setStatus({
            status: "confirming",
            confirmations: event.confirmations,
            requiredConfirmations: event.requiredConfirmations,
          })
          return
        case "paid":
          setStatus({
            status: "paid",
            txHash: event.txHash,
            amount: event.amount,
          })
          return
        case "expired":
          setStatus({ status: "expired" })
          return
        case "cancelled":
          setStatus({ status: "cancelled" })
          return
      }
    }

    socket.on("request:detected", handle)
    socket.on("request:confirming", handle)
    socket.on("request:paid", handle)
    socket.on("request:expired", handle)
    socket.on("request:cancelled", handle)
    socket.emit("subscribe", requestId)

    return () => {
      socket.emit("unsubscribe", requestId)
      socket.off("request:detected", handle)
      socket.off("request:confirming", handle)
      socket.off("request:paid", handle)
      socket.off("request:expired", handle)
      socket.off("request:cancelled", handle)
    }
  }, [requestId])

  return status
}
