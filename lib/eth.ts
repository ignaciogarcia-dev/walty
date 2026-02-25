import { createPublicClient, http } from "viem"
import { mainnet } from "viem/chains"

export const client = createPublicClient({
  chain: mainnet,
  transport: http(process.env.NEXT_PUBLIC_RPC_URL),
})

export async function getBalance(address: `0x${string}`) {
  const balance = await client.getBalance({ address })

  return balance
}