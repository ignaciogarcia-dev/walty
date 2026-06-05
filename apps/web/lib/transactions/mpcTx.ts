// EIP-1559 serialization for the MPC signing path: the engine signs a 32-byte
// hash and returns {r,s,yParity}, so we own deriving the hash and re-assembling
// the signed raw tx (the mnemonic path delegated both to viem's walletClient).

import {
  serializeTransaction,
  keccak256,
  type TransactionSerializableEIP1559,
} from "viem"
import type { UnsignedTx } from "@/lib/signing/types"

export interface EthSig {
  r: `0x${string}`
  s: `0x${string}`
  yParity: 0 | 1
}

/** Map our UnsignedTx to viem's EIP-1559 serializable shape. */
export function toSerializable(tx: UnsignedTx): TransactionSerializableEIP1559 {
  return {
    type: "eip1559",
    chainId: tx.chainId,
    nonce: tx.nonce,
    to: tx.to,
    value: tx.value,
    data: tx.data,
    gas: tx.gas,
    maxFeePerGas: tx.maxFeePerGas,
    maxPriorityFeePerGas: tx.maxPriorityFeePerGas,
  }
}

/** The 32-byte hash the MPC ceremony signs: keccak256 of the unsigned tx. */
export function signHashForTx(tx: UnsignedTx): `0x${string}` {
  return keccak256(serializeTransaction(toSerializable(tx)))
}

/** Re-assemble the broadcastable raw tx from the unsigned tx + the signature. */
export function assembleSignedTx(tx: UnsignedTx, sig: EthSig): `0x${string}` {
  return serializeTransaction(toSerializable(tx), {
    r: sig.r,
    s: sig.s,
    yParity: sig.yParity,
  })
}
