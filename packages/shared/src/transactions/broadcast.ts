import { getPublicClient } from "../rpc/getPublicClient"

/**
 * Broadcasts an already-signed raw transaction. No wallet/mnemonic involved:
 * the signing happens client-side, the server just relays the bytes to RPC.
 */
export async function broadcastRawTx(
  raw: `0x${string}`,
  chainId: number,
): Promise<string> {
  const client = getPublicClient(chainId)
  return client.sendRawTransaction({ serializedTransaction: raw })
}
