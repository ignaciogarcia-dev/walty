import {
  decodeFunctionData,
  erc20Abi,
  parseTransaction,
  parseUnits,
  recoverTransactionAddress,
  type TransactionSerialized,
} from "viem"
import type { TxIntentPayload } from "./types"

export class SignedTxMismatchError extends Error {
  readonly code: string
  constructor(code: string, message: string) {
    super(message)
    this.code = code
    this.name = "SignedTxMismatchError"
  }
}

const TRANSFER_SELECTOR = "0xa9059cbb"

// Fee envelope. Polygon spikes rarely exceed 500 gwei base fee; 1000 gwei
// is a generous ceiling that still blocks the "burn the wallet's native
// balance" exfiltration vector. Gas is capped at 500k — far above what a
// transfer or erc20.transfer needs (~21k / ~65k).
const MAX_FEE_PER_GAS = 1_000_000_000_000n // 1000 gwei
const MAX_PRIORITY_FEE_PER_GAS = 100_000_000_000n // 100 gwei
const MAX_GAS = 500_000n

function eq(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false
  return a.toLowerCase() === b.toLowerCase()
}

/**
 * Decodes a signed raw tx and asserts that its on-chain effects match
 * the intent payload exactly: chainId, sender (recovered from signature),
 * destination, asset and amount. Throws SignedTxMismatchError on any
 * deviation — the server must never broadcast a tx that doesn't do what
 * the user authorized.
 */
export async function assertSignedRawMatchesPayload(
  signedRaw: `0x${string}`,
  payload: TxIntentPayload,
): Promise<void> {
  let parsed
  try {
    parsed = parseTransaction(signedRaw)
  } catch {
    throw new SignedTxMismatchError("SIGNED_TX_PARSE", "Cannot decode signed transaction")
  }

  // Wallet code only emits EIP-1559. Anything else (legacy, 2930, 4844 blob,
  // 7702 delegation) is by definition not what the UI authorized and could
  // change semantics drastically — 7702 in particular delegates the EOA to
  // a contract regardless of the apparent transfer fields.
  if (parsed.type !== "eip1559") {
    throw new SignedTxMismatchError(
      "SIGNED_TX_UNSUPPORTED_TYPE",
      `Signed tx type ${parsed.type ?? "unknown"} is not allowed`,
    )
  }

  if (parsed.chainId !== payload.chainId) {
    throw new SignedTxMismatchError(
      "SIGNED_TX_CHAIN_MISMATCH",
      `Signed tx chainId ${parsed.chainId} != payload chainId ${payload.chainId}`,
    )
  }

  // Bound the fee envelope so a compromised client cannot drain the wallet's
  // native balance via inflated gas price / gas limit.
  if ((parsed.gas ?? 0n) > MAX_GAS) {
    throw new SignedTxMismatchError(
      "SIGNED_TX_GAS_TOO_HIGH",
      `Signed tx gas ${parsed.gas} exceeds cap ${MAX_GAS}`,
    )
  }
  if ((parsed.maxFeePerGas ?? 0n) > MAX_FEE_PER_GAS) {
    throw new SignedTxMismatchError(
      "SIGNED_TX_FEE_TOO_HIGH",
      `Signed tx maxFeePerGas ${parsed.maxFeePerGas} exceeds cap ${MAX_FEE_PER_GAS}`,
    )
  }
  if ((parsed.maxPriorityFeePerGas ?? 0n) > MAX_PRIORITY_FEE_PER_GAS) {
    throw new SignedTxMismatchError(
      "SIGNED_TX_TIP_TOO_HIGH",
      `Signed tx maxPriorityFeePerGas ${parsed.maxPriorityFeePerGas} exceeds cap ${MAX_PRIORITY_FEE_PER_GAS}`,
    )
  }

  let signer: string
  try {
    signer = await recoverTransactionAddress({
      serializedTransaction: signedRaw as TransactionSerialized,
    })
  } catch {
    throw new SignedTxMismatchError(
      "SIGNED_TX_SIGNER",
      "Cannot recover signer from signed transaction",
    )
  }
  if (!eq(signer, payload.from)) {
    throw new SignedTxMismatchError(
      "SIGNED_TX_FROM_MISMATCH",
      `Signed tx signed by ${signer}, expected ${payload.from}`,
    )
  }

  if (payload.token.type === "native") {
    if (!eq(parsed.to, payload.to)) {
      throw new SignedTxMismatchError(
        "SIGNED_TX_TO_MISMATCH",
        `Signed tx to ${parsed.to} != payload to ${payload.to}`,
      )
    }
    const expectedValue = parseUnits(payload.amount, payload.token.decimals)
    if ((parsed.value ?? 0n) !== expectedValue) {
      throw new SignedTxMismatchError(
        "SIGNED_TX_VALUE_MISMATCH",
        `Signed tx value ${parsed.value ?? 0n} != payload amount ${expectedValue}`,
      )
    }
    // Native transfers should never carry calldata.
    if (parsed.data && parsed.data !== "0x") {
      throw new SignedTxMismatchError(
        "SIGNED_TX_UNEXPECTED_DATA",
        "Native transfer must not carry calldata",
      )
    }
    return
  }

  // ERC-20: tx.to must be the token contract; calldata must be a transfer()
  // call whose decoded args match (recipient, amount); no native value.
  if (!payload.token.address) {
    throw new SignedTxMismatchError(
      "SIGNED_TX_TOKEN_ADDRESS",
      "ERC-20 payload missing token address",
    )
  }
  if (!eq(parsed.to, payload.token.address)) {
    throw new SignedTxMismatchError(
      "SIGNED_TX_TOKEN_CONTRACT_MISMATCH",
      `Signed tx to ${parsed.to} is not token contract ${payload.token.address}`,
    )
  }
  if (parsed.value && parsed.value !== 0n) {
    throw new SignedTxMismatchError(
      "SIGNED_TX_UNEXPECTED_VALUE",
      "ERC-20 transfer must not carry native value",
    )
  }
  if (!parsed.data || !parsed.data.toLowerCase().startsWith(TRANSFER_SELECTOR)) {
    throw new SignedTxMismatchError(
      "SIGNED_TX_NOT_TRANSFER",
      "ERC-20 calldata is not an erc20.transfer() call",
    )
  }
  let decoded
  try {
    decoded = decodeFunctionData({ abi: erc20Abi, data: parsed.data })
  } catch {
    throw new SignedTxMismatchError(
      "SIGNED_TX_BAD_CALLDATA",
      "ERC-20 calldata could not be decoded",
    )
  }
  if (decoded.functionName !== "transfer") {
    throw new SignedTxMismatchError(
      "SIGNED_TX_NOT_TRANSFER",
      `Signed tx calls ${decoded.functionName}, expected transfer`,
    )
  }
  const [recipient, amount] = decoded.args as [string, bigint]
  if (!eq(recipient, payload.to)) {
    throw new SignedTxMismatchError(
      "SIGNED_TX_TO_MISMATCH",
      `Signed tx transfers to ${recipient}, expected ${payload.to}`,
    )
  }
  const expectedAmount = parseUnits(payload.amount, payload.token.decimals)
  if (amount !== expectedAmount) {
    throw new SignedTxMismatchError(
      "SIGNED_TX_AMOUNT_MISMATCH",
      `Signed tx transfers ${amount}, expected ${expectedAmount}`,
    )
  }
}
