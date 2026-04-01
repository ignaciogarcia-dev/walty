/**
 * Pure state machine for refund workflow
 * No I/O, no side effects, fully testable
 */

export type RefundStatus =
  | "pending"
  | "approved"
  | "approved_pending_signature"
  | "rejected"
  | "executed"

export interface RefundState {
  id: string
  status: RefundStatus
  requestedBy: string
  approvedBy: string | null
  txHash: string | null
}

export type RefundAction =
  | { type: "approve"; approver: string }
  | { type: "reject"; reason: string }
  | { type: "sign"; txHash?: string }
  | { type: "execute" }
  | { type: "reset" }

export interface StateMachineDecision {
  allowed: boolean
  nextStatus?: RefundStatus
  message?: string
}

/**
 * Decide if an action is allowed in current state
 */
export function canTransition(
  currentStatus: RefundStatus,
  action: RefundAction
): StateMachineDecision {
  // pending → can approve or reject
  if (currentStatus === "pending") {
    if (action.type === "approve") {
      return {
        allowed: true,
        nextStatus: "approved",
        message: "Refund approved",
      }
    }
    if (action.type === "reject") {
      return {
        allowed: true,
        nextStatus: "rejected",
        message: "Refund rejected",
      }
    }
  }

  // approved → must sign before execute
  if (currentStatus === "approved") {
    if (action.type === "sign") {
      return {
        allowed: true,
        nextStatus: "approved_pending_signature",
        message: "Awaiting execution",
      }
    }
  }

  // approved_pending_signature → can execute
  if (currentStatus === "approved_pending_signature") {
    if (action.type === "execute") {
      return {
        allowed: true,
        nextStatus: "executed",
        message: "Refund executed",
      }
    }
  }

  // Terminal states - no transitions allowed
  if (currentStatus === "executed" || currentStatus === "rejected") {
    return {
      allowed: false,
      message: `Cannot change ${currentStatus} refund`,
    }
  }

  // Default: disallow
  return {
    allowed: false,
    message: "Invalid state transition",
  }
}
