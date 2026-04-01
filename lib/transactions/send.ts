import { getAdapter } from "@/lib/chainAdapters/adapterRegistry"
import type { SignedTx } from "@/lib/signing/types"

/** Broadcast an already-signed transaction to the network. */
export function broadcastSignedTx(
  signed: SignedTx,
  chainId: number
): Promise<string> {
  return getAdapter(chainId).broadcastTransaction(signed.raw)
}
