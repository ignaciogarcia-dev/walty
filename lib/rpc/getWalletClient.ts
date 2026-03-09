import { createWalletClient, http, fallback } from "viem"
import { mnemonicToAccount } from "viem/accounts"
import { getViemChain } from "./viemChains"
import { getAlchemyUrls } from "@/lib/providers/rpc/alchemy"
import { getAnkrUrls } from "@/lib/providers/rpc/ankr"

export function getWalletClient(mnemonic: string, chainId: number) {
  const account = mnemonicToAccount(mnemonic)

  const rpcUrls = [
    ...getAlchemyUrls(chainId),
    ...getAnkrUrls(chainId),
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
