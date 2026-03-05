import { normalize } from "viem/ens"
import { publicClient } from "@/lib/eth"

export async function resolveEns(name: string): Promise<`0x${string}` | null> {
  if (!name.includes(".")) return null

  try {
    const normalized = normalize(name)
    const address = await publicClient.getEnsAddress({ name: normalized })
    return address ?? null
  } catch {
    return null
  }
}
