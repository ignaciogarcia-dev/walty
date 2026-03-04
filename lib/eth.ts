import { createPublicClient } from "viem"
import { mainnet } from "viem/chains"
import { getTransport } from "@/lib/rpc"

export const publicClient = createPublicClient({
  chain: mainnet,
  transport: getTransport(),
})

export async function getBalance(address: `0x${string}`) {
  const balance = await publicClient.getBalance({ address })

  return balance
}