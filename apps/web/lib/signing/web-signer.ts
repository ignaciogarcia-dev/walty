import type { Account, Chain, Transport, WalletClient } from "viem"
import type { Signer, UnsignedTx, SignedTx } from "./types"

/** A WalletClient that has an account attached (required for signing). */
type AccountWalletClient = WalletClient<Transport, Chain, Account>

/**
 * Browser-side signer backed by a viem WalletClient.
 * Knows nothing about mnemonics, PINs, or key derivation —
 * the caller is responsible for constructing the WalletClient.
 */
export class WebSigner implements Signer {
  readonly type = "web" as const
  private readonly walletClient: AccountWalletClient

  constructor(walletClient: AccountWalletClient) {
    this.walletClient = walletClient
  }

  async signTransaction(tx: UnsignedTx): Promise<SignedTx> {
    const raw = await this.walletClient.signTransaction({
      to: tx.to,
      data: tx.data,
      value: tx.value,
      nonce: tx.nonce,
      gas: tx.gas,
      maxFeePerGas: tx.maxFeePerGas,
      maxPriorityFeePerGas: tx.maxPriorityFeePerGas,
      chain: this.walletClient.chain,
      type: "eip1559",
    })

    return { raw }
  }
}
