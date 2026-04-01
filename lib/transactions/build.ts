import { parseUnits, encodeFunctionData, erc20Abi } from "viem"
import type { Token } from "@/lib/tokens/tokenRegistry"

/** Base tx fields — pure, deterministic, no network calls. */
export type BaseTx = {
  to: `0x${string}`
  data?: `0x${string}`
  value: bigint
  chainId: number
}

/**
 * Constructs the base transaction payload (to, value, data) from token params.
 * Pure function — no RPC, no gas, no balance checks.
 */
export function buildBaseTx(params: {
  token: Token
  to: string
  amount: string
  chainId: number
}): BaseTx {
  const { token, to, amount, chainId } = params
  const isErc20 = token.type === "erc20" && token.address
  const tokenAmount = parseUnits(amount, token.decimals)

  return {
    to: isErc20
      ? (token.address as `0x${string}`)
      : (to as `0x${string}`),
    value: isErc20 ? 0n : tokenAmount,
    data: isErc20
      ? encodeFunctionData({
          abi: erc20Abi,
          functionName: "transfer",
          args: [to as `0x${string}`, tokenAmount],
        })
      : undefined,
    chainId,
  }
}
