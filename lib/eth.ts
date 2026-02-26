import { createPublicClient } from "viem"
import { sepolia } from "viem/chains"
import { getTransport } from "@/lib/rpc"

export const publicClient = createPublicClient({
  chain: sepolia,
  transport: getTransport(),
})

export async function getBalance(address: `0x${string}`) {
  const balance = await publicClient.getBalance({ address })

  return balance
}