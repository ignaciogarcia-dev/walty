import { createWalletClient, http, fallback } from "viem"
import { mnemonicToAccount } from "viem/accounts"
import { getViemChain } from "./viemChains"
import { getAlchemyUrls } from "@/lib/providers/rpc/alchemy"
import { getAnkrUrls } from "@/lib/providers/rpc/ankr"
import { getPublicUrls } from "@/lib/providers/rpc/public"

export function getWalletClient(
  mnemonic: string,
  chainId: number,
  addressIndex = 0,
) {
  const account = mnemonicToAccount(mnemonic, { addressIndex })

  const rpcUrls = [
    ...getAlchemyUrls(chainId),
    ...getAnkrUrls(chainId),
    ...getPublicUrls(chainId),
  ]

  return createWalletClient({
    account,
    chain: getViemChain(chainId),
    transport: fallback(
      rpcUrls.map((url) => http(url, { timeout: 10_000 })),
      { retryCount: 2 }
    ),
  })
}
