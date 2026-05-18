import { createPublicClient, http, fallback, type PublicClient } from "viem"
import { getViemChain } from "./viemChains"
import { getAlchemyUrls } from "@/lib/providers/rpc/alchemy"
import { getAnkrUrls } from "@/lib/providers/rpc/ankr"
import { getPublicUrls } from "@/lib/providers/rpc/public"

const clients = new Map<number, PublicClient>()

export function getPublicClient(chainId: number): PublicClient {
  if (clients.has(chainId)) return clients.get(chainId)!

  const rpcUrls = [
    ...getAlchemyUrls(chainId),
    ...getAnkrUrls(chainId),
    ...getPublicUrls(chainId),
  ]

  const client = createPublicClient({
    chain: getViemChain(chainId),
    transport: fallback(
      rpcUrls.map((url) => http(url, { timeout: 10_000 })),
      { rank: false, retryCount: 2 }
    ),
  })

  clients.set(chainId, client)
  return client
}
