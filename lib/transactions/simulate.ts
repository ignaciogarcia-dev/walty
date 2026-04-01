import { getAdapter } from "@/lib/chainAdapters/adapterRegistry"
import type { SimulateTxRequest, SimulationResult } from "@/lib/chainAdapters/types"

export async function simulateTransaction(
  params: SimulateTxRequest
): Promise<SimulationResult> {
  return getAdapter(params.chainId).simulateTransaction(params)
}
