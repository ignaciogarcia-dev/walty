import { createPublicClient, http, fallback, type PublicClient } from "viem"
import { getViemChain } from "./viemChains"
import { getAlchemyUrls } from "@/lib/providers/rpc/alchemy"
import { getAnkrUrls } from "@/lib/providers/rpc/ankr"

const clients = new Map<number, PublicClient>()

export function getPublicClient(chainId: number): PublicClient {
  if (clients.has(chainId)) return clients.get(chainId)!

  const rpcUrls = [
    ...getAlchemyUrls(chainId),
    ...getAnkrUrls(chainId),
  ]

  const client = createPublicClient({
    chain: getViemChain(chainId),
    transport: fallback(
      rpcUrls.map((url) => http(url, { timeout: 10_000 })),
      { retryCount: 2 }
    ),
  })

  clients.set(chainId, client)
  return client
}
