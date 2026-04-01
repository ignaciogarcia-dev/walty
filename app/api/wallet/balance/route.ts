import { NextRequest } from "next/server"
import { isAddress, encodeFunctionData, decodeFunctionResult } from "viem"
import { withErrorHandling, withAuth, ok, ValidationError } from "@/lib/api"
import { getPublicClient } from "@/lib/rpc/getPublicClient"
import { rateLimitByUser } from "@/lib/rate-limit"

const ERC20_ABI = [
  {
    inputs: [{ name: "account", type: "address" }],
    name: "balanceOf",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
] as const

export const GET = withErrorHandling(
  withAuth(async (req: NextRequest, { auth }) => {
    await rateLimitByUser(auth.userId, 20, 60_000)

    const { searchParams } = new URL(req.url)
    const address = searchParams.get("address")
    const tokenAddress = searchParams.get("tokenAddress")
    const chainId = Number(searchParams.get("chainId") ?? 137)

    if (!address || !isAddress(address))
      throw new ValidationError("Invalid address")
    if (!tokenAddress || !isAddress(tokenAddress))
      throw new ValidationError("Invalid tokenAddress")

    const client = getPublicClient(chainId)

    const data = encodeFunctionData({
      abi: ERC20_ABI,
      functionName: "balanceOf",
      args: [address as `0x${string}`],
    })

    const result = await client.call({
      to: tokenAddress as `0x${string}`,
      data,
    })

    if (!result.data) throw new ValidationError("Empty response from contract")

    const balance = decodeFunctionResult({
      abi: ERC20_ABI,
      functionName: "balanceOf",
      data: result.data,
    })

    return ok({ balance: balance.toString(), chainId })
  }),
)
