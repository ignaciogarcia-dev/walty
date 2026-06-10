// signIntentMpc orchestrates the MPC signing path: fetch/retry the intent, build
// the unsigned tx, run a device+server ceremony over its hash, verify the
// signature recovers the signing address, then upload the raw tx. These tests
// pin the orchestration and its safety checks. The ceremony itself is faked, but
// the signature is REAL (signed over the actual hash the code derives) so the
// recoverAddress guard is genuinely exercised; only the network (RPC in prepareTx
// and the WS ceremony transport) is mocked.

import { describe, it, expect, vi, beforeEach } from "vitest"
import { sign } from "viem/accounts"
import { privateKeyToAccount } from "viem/accounts"
import type { UnsignedTx } from "@/lib/signing/types"
import type { TxIntent } from "@walty/shared/tx-intents/types"

const PK = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"
const account = privateKeyToAccount(PK)
const FROM = account.address

// A different key, for the "signature recovers a different address" test.
const OTHER_PK = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d"

const UNSIGNED: UnsignedTx = {
  to: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359",
  data: "0xa9059cbb00000000000000000000000070997970c51812dc3a010c7d01b50e0d17dc79c800000000000000000000000000000000000000000000000000000000000f4240",
  value: 0n,
  chainId: 137,
  nonce: 7,
  gas: 80_000n,
  maxFeePerGas: 50_000_000_000n,
  maxPriorityFeePerGas: 2_000_000_000n,
}

vi.mock("@/lib/tx-intents/client", () => ({
  getTxIntent: vi.fn(),
  retryFailedTxIntent: vi.fn(),
  signTxIntent: vi.fn(),
}))
vi.mock("./prepare", () => ({ prepareTx: vi.fn() }))
vi.mock("@/lib/mpc/getMpcClient", () => ({ getMpcClient: vi.fn() }))

import {
  getTxIntent,
  retryFailedTxIntent,
  signTxIntent,
} from "@/lib/tx-intents/client"
import { prepareTx } from "./prepare"
import { getMpcClient } from "@/lib/mpc/getMpcClient"
import { signIntentMpc } from "./signIntentMpc"

function makeIntent(over: Partial<TxIntent> = {}): TxIntent {
  return {
    id: "intent-1",
    userId: 1,
    type: "transfer",
    status: "pending",
    signedRaw: null,
    txHash: null,
    createdAt: "2026-01-01T00:00:00Z",
    expiresAt: "2026-01-01T01:00:00Z",
    payload: {
      to: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
      amount: "1.0",
      chainId: 137,
      token: { symbol: "MATIC", address: null, type: "native", decimals: 18 },
      from: FROM,
    },
    ...over,
  }
}

// withDeviceShare wrapper: hands the callback a share + meta, like the real one.
function makeSecurity(metaAddress = FROM) {
  return {
    withDeviceShare: <T>(fn: (s: { shareBytes: Uint8Array; meta: { keyId: string; pubkey: string; address: string } }) => Promise<T>) =>
      fn({
        shareBytes: new Uint8Array([1, 2, 3]),
        meta: { keyId: "key-1", pubkey: "0x04", address: metaAddress },
      }),
  } as never
}

// Fake MpcClient whose runSign produces a REAL signature over the hash it's given.
function makeClient(signWithPk: `0x${string}` | null = PK) {
  const connect = vi.fn(async () => {})
  const close = vi.fn(async () => {})
  const runSign = vi.fn(async (_keyId: string, _share: Uint8Array, signHash: `0x${string}`) => {
    if (signWithPk === null) return { serverSignature: undefined }
    const sig = await sign({ hash: signHash, privateKey: signWithPk })
    return { serverSignature: { r: sig.r, s: sig.s, yParity: sig.yParity as 0 | 1 } }
  })
  return { connect, close, runSign }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(prepareTx).mockResolvedValue(UNSIGNED)
  vi.mocked(getTxIntent).mockResolvedValue(makeIntent())
  vi.mocked(signTxIntent).mockResolvedValue(undefined as never)
})

describe("signIntentMpc", () => {
  it("signs, verifies the signature, and uploads the raw tx", async () => {
    const client = makeClient()
    vi.mocked(getMpcClient).mockReturnValue(client as never)

    const res = await signIntentMpc("intent-1", makeSecurity())

    expect(client.connect).toHaveBeenCalledOnce()
    expect(client.runSign).toHaveBeenCalledOnce()
    expect(client.close).toHaveBeenCalledOnce()
    expect(vi.mocked(signTxIntent)).toHaveBeenCalledOnce()
    const [, raw] = vi.mocked(signTxIntent).mock.calls[0]
    expect(raw).toMatch(/^0x02/) // assembled EIP-1559 raw tx
    expect(res.payload.from).toBe(FROM)
  })

  it("retries a failed intent before signing", async () => {
    vi.mocked(getTxIntent).mockResolvedValue(makeIntent({ status: "failed" }))
    vi.mocked(retryFailedTxIntent).mockResolvedValue(makeIntent({ status: "pending" }))
    vi.mocked(getMpcClient).mockReturnValue(makeClient() as never)

    await signIntentMpc("intent-1", makeSecurity())
    expect(vi.mocked(retryFailedTxIntent)).toHaveBeenCalledWith("intent-1")
  })

  it("rejects when the device share address does not match the intent's from (owner)", async () => {
    vi.mocked(getMpcClient).mockReturnValue(makeClient() as never)
    await expect(
      signIntentMpc("intent-1", makeSecurity("0x0000000000000000000000000000000000000001")),
    ).rejects.toThrow(/does not match/)
  })

  it("rejects when the ceremony returns no signature", async () => {
    const client = makeClient(null)
    vi.mocked(getMpcClient).mockReturnValue(client as never)
    await expect(signIntentMpc("intent-1", makeSecurity())).rejects.toThrow(/no signature/)
    expect(client.close).toHaveBeenCalledOnce() // still cleaned up
  })

  it("rejects when the signature recovers a different address", async () => {
    const client = makeClient(OTHER_PK)
    vi.mocked(getMpcClient).mockReturnValue(client as never)
    await expect(signIntentMpc("intent-1", makeSecurity())).rejects.toThrow(/does not recover/)
    expect(client.close).toHaveBeenCalledOnce()
  })

  it("closes the client even when the ceremony throws", async () => {
    const client = makeClient()
    client.runSign.mockRejectedValueOnce(new Error("ceremony exploded"))
    vi.mocked(getMpcClient).mockReturnValue(client as never)

    await expect(signIntentMpc("intent-1", makeSecurity())).rejects.toThrow(/ceremony exploded/)
    expect(client.close).toHaveBeenCalledOnce()
    expect(vi.mocked(signTxIntent)).not.toHaveBeenCalled()
  })
})
