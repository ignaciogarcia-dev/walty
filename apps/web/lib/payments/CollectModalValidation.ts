export interface CollectFormContext {
  amountUsd: string
  tokenSymbol: string
  isSplitPayment: boolean
  requiredConfirmations: number
}

export type CollectError =
  | { type: "invalid-amount"; message: string }
  | { type: "invalid-token"; message: string }
  | { type: "valid" }

export function validateCollectForm(
  context: CollectFormContext
): CollectError {
  if (!context.amountUsd || parseFloat(context.amountUsd) <= 0) {
    return { type: "invalid-amount", message: "Amount must be > 0" }
  }

  if (!context.tokenSymbol) {
    return { type: "invalid-token", message: "Select a token" }
  }

  return { type: "valid" }
}
