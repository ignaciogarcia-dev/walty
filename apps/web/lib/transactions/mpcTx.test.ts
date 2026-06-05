// The load-bearing crypto test for the MPC signing path: prove that the hash we
// derive from an UnsignedTx, signed by a key over that hash (standing in for the
// MPC ceremony's {r,s,yParity}), re-assembles into a raw tx that recovers the
// signer's address. If this holds, an MPC signature over signHashForTx produces
// a valid, broadcastable, correctly-attributed Ethereum transaction.

import { describe, it, expect } from "vitest"
import { privateKeyToAccount, sign } from "viem/accounts"
import {
  parseTransaction,
  recoverAddress,
  recoverTransactionAddress,
  getAddress,
} from "viem"
import { signHashForTx, assembleSignedTx } from "./mpcTx"
import type { UnsignedTx } from "@/lib/signing/types"

// Well-known Anvil/Hardhat account #0 — deterministic, not a secret in use.
const PK = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"
const account = privateKeyToAccount(PK)

const tx: UnsignedTx = {
  // ERC-20 transfer calldata to a token contract is typical; content is opaque to the proof.
  to: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359", // USDC.e on Polygon
  data: "0xa9059cbb00000000000000000000000070997970c51812dc3a010c7d01b50e0d17dc79c800000000000000000000000000000000000000000000000000000000000f4240",
  value: 0n,
  chainId: 137,
  nonce: 7,
  gas: 80_000n,
  maxFeePerGas: 50_000_000_000n,
  maxPriorityFeePerGas: 2_000_000_000n,
}

describe("mpcTx", () => {
  it("signHashForTx + assembleSignedTx recover the signer address", async () => {
    const hash = signHashForTx(tx)

    // Stand-in for the MPC ceremony: a real signature over the SAME 32-byte hash.
    const sig = await sign({ hash, privateKey: PK })
    expect(sig.yParity === 0 || sig.yParity === 1).toBe(true)

    const ethSig = { r: sig.r, s: sig.s, yParity: sig.yParity as 0 | 1 }

    // recover straight from hash + signature
    const recovered = await recoverAddress({ hash, signature: ethSig })
    expect(recovered).toBe(account.address)

    // end-to-end: the assembled raw tx attributes to the signer
    const raw = assembleSignedTx(tx, ethSig)
    const fromRaw = await recoverTransactionAddress({
      serializedTransaction: raw as `0x02${string}`,
    })
    expect(fromRaw).toBe(account.address)

    // and the broadcastable raw round-trips to the original fields
    const parsed = parseTransaction(raw)
    expect(parsed.type).toBe("eip1559")
    expect(parsed.nonce).toBe(7)
    expect(parsed.chainId).toBe(137)
    expect(getAddress(parsed.to!)).toBe(getAddress(tx.to))
    expect(parsed.data).toBe(tx.data)
  })

  it("produces a different hash when a field changes (tamper-evidence)", () => {
    const h1 = signHashForTx(tx)
    const h2 = signHashForTx({ ...tx, nonce: tx.nonce + 1 })
    expect(h1).not.toBe(h2)
  })
})
