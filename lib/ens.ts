import { normalize } from "viem/ens"
import { getPublicClient } from "@/lib/rpc/getPublicClient"

export async function resolveEns(name: string): Promise<`0x${string}` | null> {
  if (!name.includes(".")) return null

  try {
    const normalized = normalize(name)
    const publicClient = getPublicClient(1) // ENS is on Ethereum mainnet
    const address = await publicClient.getEnsAddress({ name: normalized })
    return address ?? null
  } catch {
    return null
  }
}
