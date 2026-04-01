import { erc20Abi } from "viem"
import { getPublicClient } from "@/lib/rpc/getPublicClient"
import { PAYMENT_CHAIN_ID, getPaymentTokenDefinition } from "@/lib/payments/config"

const PAYMENT_TOKENS = ["USDC", "USDT"] as const

export async function getOperatorTokenBalances(
  walletAddress: string
): Promise<Record<string, bigint>> {
  const client = getPublicClient(PAYMENT_CHAIN_ID)
  const balances: Record<string, bigint> = {}

  for (const symbol of PAYMENT_TOKENS) {
    const tokenDef = getPaymentTokenDefinition(symbol)
    if (!tokenDef?.address) continue
    try {
      const balance = await client.readContract({
        address: tokenDef.address as `0x${string}`,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [walletAddress as `0x${string}`],
      })
      balances[symbol] = balance
    } catch {
      balances[symbol] = 0n
    }
  }

  return balances
}

export async function operatorHasBalance(walletAddress: string): Promise<boolean> {
  const balances = await getOperatorTokenBalances(walletAddress)
  return Object.values(balances).some((b) => b > 0n)
}

export async function getOperatorSingleTokenBalance(
  walletAddress: string,
  symbol: string,
): Promise<bigint> {
  const balances = await getOperatorTokenBalances(walletAddress)
  return balances[symbol] ?? 0n
}
