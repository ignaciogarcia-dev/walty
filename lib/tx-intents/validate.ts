import { isAddress, parseUnits } from "viem"
import { getTokensByChain } from "@/lib/tokens/tokenRegistry"
import type { TxIntentPayload } from "./types"

/** Validates a tx-intent payload server-side. Throws on invalid input. */
export function validateAndNormalizePayload(payload: TxIntentPayload): void {
  if (!payload.to || !isAddress(payload.to)) {
    throw new Error("Invalid destination address")
  }

  if (!payload.from || !isAddress(payload.from)) {
    throw new Error("Invalid sender address")
  }

  if (!payload.amount || typeof payload.amount !== "string") {
    throw new Error("Amount is required and must be a non-empty string")
  }

  if (!payload.chainId || typeof payload.chainId !== "number") {
    throw new Error("Invalid chainId")
  }

  if (!payload.token?.symbol || !["native", "erc20"].includes(payload.token.type)) {
    throw new Error("Invalid token")
  }

  // Verify the token exists in our registry for this chain
  const tokens = getTokensByChain(payload.chainId)
  const match = tokens.find(
    (t) =>
      t.symbol === payload.token.symbol &&
      t.type === payload.token.type
  )
  if (!match) {
    throw new Error(`Token ${payload.token.symbol} not supported on chain ${payload.chainId}`)
  }

  // Ensure client-supplied token metadata (address/decimals) matches the registry
  const registryAddress = match.address   // `0x${string}` | null
  const registryDecimals = match.decimals // number (always present on Token)

  // Validate and/or normalize token.address for ERC20 tokens
  if (payload.token.type === "erc20") {
    if (payload.token.address) {
      // Reject invalid or mismatched addresses
      if (!isAddress(payload.token.address)) {
        throw new Error("Invalid token address")
      }
      if (registryAddress && payload.token.address.toLowerCase() !== registryAddress.toLowerCase()) {
        throw new Error("Token address does not match registry")
      }
    }

    // If the client did not provide an address but the registry has one, use the canonical value
    if (!payload.token.address && registryAddress) {
      payload.token.address = registryAddress
    }
  }

  // Validate and/or normalize token.decimals
  if (payload.token.decimals !== undefined && Number(payload.token.decimals) !== registryDecimals) {
    throw new Error("Token decimals do not match registry")
  }
  if (payload.token.decimals === undefined) {
    payload.token.decimals = registryDecimals
  }

  // Validate amount using parseUnits with the canonical decimals so that
  // precision loss, scientific notation and excess decimal places are all
  // rejected consistently – matching the actual on-chain parsing path.
  let parsedAmount: bigint
  try {
    parsedAmount = parseUnits(payload.amount, registryDecimals)
  } catch {
    throw new Error("Amount format is invalid or has too many decimal places")
  }
  if (parsedAmount <= 0n) {
    throw new Error("Amount must be positive")
  }
}
