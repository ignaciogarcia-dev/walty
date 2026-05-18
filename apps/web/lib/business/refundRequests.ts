/**
 * Client-side helpers for refund request operations.
 * Lives in lib/ so the retry logic is testable and reusable
 * without touching UI components.
 */

/**
 * Mark a refund request as executed on the server.
 * Retries up to maxAttempts times with exponential backoff —
 * the RPC node may not have indexed the tx yet when this is called.
 */
export async function markRefundExecuted(
  refundId: string,
  txHash: string,
  maxAttempts = 5,
): Promise<void> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (attempt > 0) {
      await new Promise((r) =>
        setTimeout(r, 2_000 * Math.pow(2, attempt - 1)),
      )
    }
    try {
      const res = await fetch(`/api/business/refund-requests/${refundId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "mark_executed", txHash }),
      })
      if (res.ok) return
      if (attempt === maxAttempts - 1) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error ?? "Error marking refund as executed")
      }
    } catch (err) {
      if (attempt === maxAttempts - 1) throw err
    }
  }
}
