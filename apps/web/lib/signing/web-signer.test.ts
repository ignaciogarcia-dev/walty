// WebSigner is a thin adapter over a viem WalletClient: its job is to map an
// UnsignedTx onto walletClient.signTransaction with the right fields and an
// eip1559 type. This test pins that mapping with a fake WalletClient that
// captures the request. (The cryptographic round-trip — that a signature over
// these bytes recovers the signer — is proven in mpcTx.test.ts.)

import { describe, it, expect } from "vitest"
import { polygon } from "viem/chains"
import { WebSigner } from "./web-signer"
import type { UnsignedTx } from "./types"

const tx: UnsignedTx = {
  to: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359",
  data: "0xa9059cbb00000000000000000000000070997970c51812dc3a010c7d01b50e0d17dc79c800000000000000000000000000000000000000000000000000000000000f4240",
  value: 0n,
  chainId: 137,
  nonce: 7,
  gas: 80_000n,
  maxFeePerGas: 50_000_000_000n,
  maxPriorityFeePerGas: 2_000_000_000n,
}

function makeWalletClient() {
  const requests: Record<string, unknown>[] = []
  const walletClient = {
    chain: polygon,
    async signTransaction(req: Record<string, unknown>) {
      requests.push(req)
      return "0x02signedraw" as `0x02${string}`
    },
  }
  return { walletClient, requests }
}

describe("WebSigner", () => {
  it("reports type 'web'", () => {
    const { walletClient } = makeWalletClient()
    expect(new WebSigner(walletClient as never).type).toBe("web")
  })

  it("maps the UnsignedTx onto an eip1559 signTransaction request", async () => {
    const { walletClient, requests } = makeWalletClient()
    const signer = new WebSigner(walletClient as never)

    const out = await signer.signTransaction(tx)

    expect(out).toEqual({ raw: "0x02signedraw" })
    expect(requests).toHaveLength(1)
    expect(requests[0]).toMatchObject({
      to: tx.to,
      data: tx.data,
      value: 0n,
      nonce: 7,
      gas: tx.gas,
      maxFeePerGas: tx.maxFeePerGas,
      maxPriorityFeePerGas: tx.maxPriorityFeePerGas,
      chain: polygon,
      type: "eip1559",
    })
  })

  it("forwards the chain from the wallet client", async () => {
    const { walletClient, requests } = makeWalletClient()
    await new WebSigner(walletClient as never).signTransaction(tx)
    expect((requests[0] as { chain: unknown }).chain).toBe(polygon)
  })
})
