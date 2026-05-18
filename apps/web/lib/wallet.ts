import { generateMnemonic, mnemonicToAccount, english } from "viem/accounts"

export function createWallet() {
    const mnemonic = generateMnemonic(english, 256)
    const account = mnemonicToAccount(mnemonic)
  
    return {
      mnemonic,
      address: account.address,
    }
  }