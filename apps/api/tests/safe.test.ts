import { describe, expect, it, vi } from "vitest"

vi.mock("viem/actions", () => ({
  waitForTransactionReceipt: vi.fn(async () => ({ status: "success" })),
}))

vi.mock("@safe-global/protocol-kit", () => ({
  default: {
    init: vi.fn(async () => ({
      getAddress: vi.fn(async () => "0xSafe"),
      createSafeDeploymentTransaction: vi.fn(async () => ({
        to: "0xFactory", value: "0", data: "0xdead",
      })),
      getSafeProvider: vi.fn(() => ({
        getExternalSigner: vi.fn(async () => ({
          sendTransaction: vi.fn(async () => "0xhash"),
        })),
      })),
    })),
  },
}))

import { predictSafeAddress, deploySafe } from "../src/lib/safe.js"

describe("safe wrapper", () => {
  it("predicts a Safe address for an owner without deploying", async () => {
    const addr = await predictSafeAddress({ ownerAddress: "0xOwner", chainId: 80002, saltNonce: "1" })
    expect(addr).toBe("0xSafe")
  })
  it("deploys and returns address + tx hash", async () => {
    const res = await deploySafe({ ownerAddress: "0xOwner", chainId: 80002, saltNonce: "1", deployerPrivateKey: "0xabc" })
    expect(res).toEqual({ safeAddress: "0xSafe", txHash: "0xhash" })
  })
})
