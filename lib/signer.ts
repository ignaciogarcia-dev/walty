import { mnemonicToAccount } from "viem/accounts"
import { createWalletClient, http } from "viem"
import { mainnet } from "viem/chains"

export function getWalletClient(mnemonic: string) {
  const account = mnemonicToAccount(mnemonic)

  return createWalletClient({
    account,
    chain: mainnet,
    transport: http(process.env.NEXT_PUBLIC_RPC_URL),
  })
}
