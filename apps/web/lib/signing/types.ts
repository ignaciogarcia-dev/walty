export type UnsignedTx = {
  to: `0x${string}`
  data?: `0x${string}`
  value: bigint
  chainId: number
  /** Pending tx count for `from` (see prepareTx). */
  nonce: number
  gas: bigint
  maxFeePerGas: bigint
  maxPriorityFeePerGas: bigint
}

export type SignedTx = {
  raw: `0x${string}`
}

export type SignerType = "web" | "external"

export interface Signer {
  readonly type: SignerType
  signTransaction(tx: UnsignedTx): Promise<SignedTx>
}
