import { formatUnits } from "viem"
import { publicClient, getBalance } from "@/lib/eth"
import type { Token } from "@/lib/tokens"

const erc20Abi = [
  {
    inputs: [{ name: "account", type: "address" }],
    name: "balanceOf",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
] as const

export async function getAllTokenBalances(
  address: `0x${string}`,
  tokens: Token[]
): Promise<Map<string, bigint>> {
  const result = new Map<string, bigint>()

  const ethToken = tokens.find((t) => t.address === null)
  const erc20Tokens = tokens.filter((t) => t.address !== null)

  const contracts = erc20Tokens.map((token) => ({
    address: token.address as `0x${string}`,
    abi: erc20Abi,
    functionName: "balanceOf" as const,
    args: [address] as const,
  }))

  const [ethBalance, multicallResults] = await Promise.all([
    ethToken ? getBalance(address) : Promise.resolve(null),
    contracts.length > 0
      ? publicClient.multicall({ contracts, allowFailure: true })
      : Promise.resolve([] as Array<{ status: "success"; result: bigint } | { status: "failure"; error: Error }>),
  ])

  if (ethToken && ethBalance !== null) {
    result.set(ethToken.symbol, ethBalance)
  }

  erc20Tokens.forEach((token, i) => {
    const res = multicallResults[i]
    if (res && res.status === "success") {
      result.set(token.symbol, res.result as bigint)
    } else {
      result.set(token.symbol, 0n)
    }
  })

  return result
}

export function formatTokenBalance(balance: bigint, token: Token): string {
  const formatted = formatUnits(balance, token.decimals)
  const num = parseFloat(formatted)
  if (num === 0) return "0"
  if (num < 0.000001) return "<0.000001"
  if (num < 0.001) return num.toFixed(6)
  if (num < 1) return num.toFixed(4)
  if (num < 1000) return num.toFixed(4)
  return num.toLocaleString("en-US", { maximumFractionDigits: 2 })
}
