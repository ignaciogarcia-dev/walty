// signIntent is the local-key signing path (owner master key or HD-derived
// operator key). Its safety net is two address checks: the unlocked wallet must
// match the intent's `from`, and the derived account must match it too. These
// tests pin those guards, the owner/operator index handling, the failed-intent
// retry, and that the signed raw tx is uploaded. Network (RPC in prepareTx) and
// key derivation are mocked; the orchestration logic is real.

import { describe, it, expect, vi, beforeEach } from "vitest"
import type { UnsignedTx } from "@/lib/signing/types"
import type { TxIntent } from "@walty/shared/tx-intents/types"
import type { WalletSecurityManager } from "@/lib/wallet/WalletSecurityManager"

// Anvil/Hardhat accounts #0 and #1 — deterministic addresses (this file mocks
// viem/accounts, so we use the literals rather than deriving them).
const FROM = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"
const OTHER = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8"

const UNSIGNED: UnsignedTx = {
  to: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359",
  value: 1_000_000n,
  chainId: 137,
  nonce: 3,
  gas: 21_000n,
  maxFeePerGas: 50_000_000_000n,
  maxPriorityFeePerGas: 2_000_000_000n,
}

const SIGNED_RAW = "0x02deadbeef" as const

vi.mock("@/lib/tx-intents/client", () => ({
  getTxIntent: vi.fn(),
  retryFailedTxIntent: vi.fn(),
  signTxIntent: vi.fn(),
}))
vi.mock("./prepare", () => ({ prepareTx: vi.fn() }))
vi.mock("@/lib/rpc/getWalletClient", () => ({ getWalletClient: vi.fn() }))
vi.mock("@/lib/signing/signer-registry", () => ({ getSigner: vi.fn() }))
vi.mock("viem/accounts", () => ({ mnemonicToAccount: vi.fn() }))

import {
  getTxIntent,
  retryFailedTxIntent,
  signTxIntent,
} from "@/lib/tx-intents/client"
import { prepareTx } from "./prepare"
import { getWalletClient } from "@/lib/rpc/getWalletClient"
import { getSigner } from "@/lib/signing/signer-registry"
import { mnemonicToAccount } from "viem/accounts"
import { signIntent } from "./signIntent"

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
      to: OTHER,
      amount: "1.0",
      chainId: 137,
      token: { symbol: "MATIC", address: null, type: "native", decimals: 18 },
      from: FROM,
    },
    ...over,
  }
}

// withUnlockedSeed just runs the callback with a mnemonic string.
const security = {
  withUnlockedSeed: <T>(fn: (m: string) => Promise<T>) => fn("test test test"),
} as unknown as WalletSecurityManager

const signTransaction = vi.fn(async () => ({ raw: SIGNED_RAW }))

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(prepareTx).mockResolvedValue(UNSIGNED)
  vi.mocked(getTxIntent).mockResolvedValue(makeIntent())
  vi.mocked(signTxIntent).mockResolvedValue(undefined as never)
  vi.mocked(getWalletClient).mockReturnValue({} as never)
  vi.mocked(getSigner).mockReturnValue({ type: "web", signTransaction } as never)
  vi.mocked(mnemonicToAccount).mockReturnValue({ address: FROM } as never)
})

describe("signIntent", () => {
  it("signs as owner and uploads the raw tx", async () => {
    const res = await signIntent("intent-1", security, FROM)
    expect(signTransaction).toHaveBeenCalledWith(UNSIGNED)
    expect(vi.mocked(signTxIntent)).toHaveBeenCalledWith("intent-1", SIGNED_RAW)
    expect(res.payload.from).toBe(FROM)
  })

  it("derives the operator key at the given index", async () => {
    await signIntent("intent-1", security, OTHER, 5)
    expect(vi.mocked(getWalletClient)).toHaveBeenCalledWith("test test test", 137, 5)
    expect(vi.mocked(mnemonicToAccount)).toHaveBeenCalledWith("test test test", {
      addressIndex: 5,
    })
  })

  it("rejects early when the owner wallet does not match the intent's from", async () => {
    // derivationIndex undefined => owner path => ownerAddress must equal from
    await expect(signIntent("intent-1", security, OTHER)).rejects.toThrow(
      /does not match/,
    )
    expect(vi.mocked(signTxIntent)).not.toHaveBeenCalled()
  })

  it("rejects when the derived account does not match the intent's from", async () => {
    vi.mocked(mnemonicToAccount).mockReturnValue({ address: OTHER } as never)
    await expect(signIntent("intent-1", security, FROM)).rejects.toThrow(/does not match/)
    expect(vi.mocked(signTxIntent)).not.toHaveBeenCalled()
  })

  it("retries a failed intent before signing", async () => {
    vi.mocked(getTxIntent).mockResolvedValue(makeIntent({ status: "failed" }))
    vi.mocked(retryFailedTxIntent).mockResolvedValue(makeIntent({ status: "pending" }))
    await signIntent("intent-1", security, FROM)
    expect(vi.mocked(retryFailedTxIntent)).toHaveBeenCalledWith("intent-1")
    expect(vi.mocked(signTxIntent)).toHaveBeenCalledWith("intent-1", SIGNED_RAW)
  })
})
