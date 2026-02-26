import { mnemonicToAccount } from "viem/accounts"
import { createWalletClient } from "viem"
import { sepolia } from "viem/chains"
import { getTransport } from "@/lib/rpc"

export function getWalletClient(mnemonic: string) {
  const account = mnemonicToAccount(mnemonic)

  return createWalletClient({
    account,
    chain: sepolia,
    transport: getTransport(),
  })
}
