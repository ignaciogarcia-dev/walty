/**
 * Pure validation for SendForm
 * No I/O, no React, fully testable
 */

export interface SendFormValidationContext {
  recipient: string
  amount: string
  tokenSymbol: string
  tokenDecimals: number
  userBalance: bigint
  selectedChainId: number
}

export type ValidationError =
  | { type: "invalid-recipient"; message: string }
  | { type: "invalid-amount"; message: string }
  | { type: "insufficient-balance"; message: string }
  | { type: "invalid-token"; message: string }
  | { type: "valid" }

export function validateSendForm(
  context: SendFormValidationContext
): ValidationError {
  // 1. Validar recipient
  if (!context.recipient) {
    return { type: "invalid-recipient", message: "Recipient required" }
  }

  const isAddress = /^0x[a-fA-F0-9]{40}$/.test(context.recipient)
  const isUsername = /^@[a-zA-Z0-9_]{3,}$/.test(context.recipient)

  if (!isAddress && !isUsername) {
    return {
      type: "invalid-recipient",
      message: "Invalid address or username",
    }
  }

  // 2. Validar amount
  if (!context.amount || parseFloat(context.amount) <= 0) {
    return { type: "invalid-amount", message: "Amount must be > 0" }
  }

  // 3. Validar balance
  const amountBig = BigInt(
    Math.floor(parseFloat(context.amount) * 10 ** context.tokenDecimals)
  )

  if (amountBig > context.userBalance) {
    return { type: "insufficient-balance", message: "Not enough balance" }
  }

  // 4. Validar token
  if (!context.tokenSymbol || !context.selectedChainId) {
    return { type: "invalid-token", message: "Invalid token selection" }
  }

  return { type: "valid" }
}

export function isValidAddress(address: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(address)
}

export function isValidUsername(username: string): boolean {
  return /^@[a-zA-Z0-9_]{3,}$/.test(username)
}

export function parseAmountToBigInt(
  amount: string,
  decimals: number
): bigint {
  return BigInt(Math.floor(parseFloat(amount) * 10 ** decimals))
}
