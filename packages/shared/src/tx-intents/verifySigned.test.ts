import { describe, expect, it } from "vitest"
import { encodeFunctionData, erc20Abi, parseUnits } from "viem"
import {
  generatePrivateKey,
  privateKeyToAccount,
  signTransaction,
} from "viem/accounts"
import type { TxIntentPayload } from "./types"
import {
  SignedTxMismatchError,
  assertSignedRawMatchesPayload,
} from "./verifySigned"

const USDC_ADDR = "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174" as `0x${string}`

function makeEoa() {
  const pk = generatePrivateKey()
  return { pk, account: privateKeyToAccount(pk) }
}

async function signNative(opts: {
  pk: `0x${string}`
  to: `0x${string}`
  value: bigint
  chainId: number
}) {
  return signTransaction({
    privateKey: opts.pk,
    transaction: {
      type: "eip1559",
      chainId: opts.chainId,
      to: opts.to,
      value: opts.value,
      gas: 21_000n,
      maxFeePerGas: 1_000_000_000n,
      maxPriorityFeePerGas: 1_000_000_000n,
      nonce: 0,
    },
  })
}

async function signErc20(opts: {
  pk: `0x${string}`
  token: `0x${string}`
  recipient: `0x${string}`
  amount: bigint
  chainId: number
}) {
  const data = encodeFunctionData({
    abi: erc20Abi,
    functionName: "transfer",
    args: [opts.recipient, opts.amount],
  })
  return signTransaction({
    privateKey: opts.pk,
    transaction: {
      type: "eip1559",
      chainId: opts.chainId,
      to: opts.token,
      data,
      value: 0n,
      gas: 100_000n,
      maxFeePerGas: 1_000_000_000n,
      maxPriorityFeePerGas: 1_000_000_000n,
      nonce: 0,
    },
  })
}

describe("assertSignedRawMatchesPayload — native", () => {
  it("accepts a matching native transfer", async () => {
    const { pk, account } = makeEoa()
    const to = makeEoa().account.address
    const raw = await signNative({ pk, to, value: 10n ** 16n, chainId: 137 })
    const payload: TxIntentPayload = {
      to,
      amount: "0.01",
      chainId: 137,
      token: { symbol: "MATIC", address: null, type: "native", decimals: 18 },
      from: account.address,
    }
    await expect(
      assertSignedRawMatchesPayload(raw, payload),
    ).resolves.toBeUndefined()
  })

  it("rejects when signer != payload.from", async () => {
    const { pk } = makeEoa()
    const to = makeEoa().account.address
    const raw = await signNative({ pk, to, value: 10n ** 16n, chainId: 137 })
    const payload: TxIntentPayload = {
      to,
      amount: "0.01",
      chainId: 137,
      token: { symbol: "MATIC", address: null, type: "native", decimals: 18 },
      from: makeEoa().account.address, // different
    }
    await expect(
      assertSignedRawMatchesPayload(raw, payload),
    ).rejects.toThrow(SignedTxMismatchError)
  })

  it("rejects when chainId differs", async () => {
    const { pk, account } = makeEoa()
    const to = makeEoa().account.address
    const raw = await signNative({ pk, to, value: 10n ** 16n, chainId: 1 })
    const payload: TxIntentPayload = {
      to,
      amount: "0.01",
      chainId: 137,
      token: { symbol: "MATIC", address: null, type: "native", decimals: 18 },
      from: account.address,
    }
    await expect(
      assertSignedRawMatchesPayload(raw, payload),
    ).rejects.toThrow(SignedTxMismatchError)
  })

  it("rejects when value mismatches", async () => {
    const { pk, account } = makeEoa()
    const to = makeEoa().account.address
    const raw = await signNative({ pk, to, value: 1n, chainId: 137 })
    const payload: TxIntentPayload = {
      to,
      amount: "0.01",
      chainId: 137,
      token: { symbol: "MATIC", address: null, type: "native", decimals: 18 },
      from: account.address,
    }
    await expect(
      assertSignedRawMatchesPayload(raw, payload),
    ).rejects.toThrow(SignedTxMismatchError)
  })
})

describe("assertSignedRawMatchesPayload — ERC-20", () => {
  it("accepts a matching erc20.transfer", async () => {
    const { pk, account } = makeEoa()
    const recipient = makeEoa().account.address
    const raw = await signErc20({
      pk,
      token: USDC_ADDR,
      recipient,
      amount: parseUnits("12.5", 6),
      chainId: 137,
    })
    const payload: TxIntentPayload = {
      to: recipient,
      amount: "12.5",
      chainId: 137,
      token: { symbol: "USDC", address: USDC_ADDR, type: "erc20", decimals: 6 },
      from: account.address,
    }
    await expect(
      assertSignedRawMatchesPayload(raw, payload),
    ).resolves.toBeUndefined()
  })

  it("rejects when recipient differs (the classic substitution attack)", async () => {
    const { pk, account } = makeEoa()
    const attackerRecipient = makeEoa().account.address
    const raw = await signErc20({
      pk,
      token: USDC_ADDR,
      recipient: attackerRecipient,
      amount: parseUnits("12.5", 6),
      chainId: 137,
    })
    const payload: TxIntentPayload = {
      to: makeEoa().account.address, // user-authorized destination
      amount: "12.5",
      chainId: 137,
      token: { symbol: "USDC", address: USDC_ADDR, type: "erc20", decimals: 6 },
      from: account.address,
    }
    await expect(
      assertSignedRawMatchesPayload(raw, payload),
    ).rejects.toThrow(SignedTxMismatchError)
  })

  it("rejects when amount differs", async () => {
    const { pk, account } = makeEoa()
    const recipient = makeEoa().account.address
    const raw = await signErc20({
      pk,
      token: USDC_ADDR,
      recipient,
      amount: parseUnits("999", 6),
      chainId: 137,
    })
    const payload: TxIntentPayload = {
      to: recipient,
      amount: "12.5",
      chainId: 137,
      token: { symbol: "USDC", address: USDC_ADDR, type: "erc20", decimals: 6 },
      from: account.address,
    }
    await expect(
      assertSignedRawMatchesPayload(raw, payload),
    ).rejects.toThrow(SignedTxMismatchError)
  })

  it("rejects when calldata is not transfer()", async () => {
    const { pk, account } = makeEoa()
    const otherAbi = [
      {
        type: "function" as const,
        name: "approve",
        stateMutability: "nonpayable" as const,
        inputs: [
          { name: "spender", type: "address" },
          { name: "amount", type: "uint256" },
        ],
        outputs: [{ name: "", type: "bool" }],
      },
    ]
    const data = encodeFunctionData({
      abi: otherAbi,
      functionName: "approve",
      args: [makeEoa().account.address, parseUnits("12.5", 6)],
    })
    const raw = await signTransaction({
      privateKey: pk,
      transaction: {
        type: "eip1559",
        chainId: 137,
        to: USDC_ADDR,
        data,
        value: 0n,
        gas: 100_000n,
        maxFeePerGas: 1_000_000_000n,
        maxPriorityFeePerGas: 1_000_000_000n,
        nonce: 0,
      },
    })
    const payload: TxIntentPayload = {
      to: makeEoa().account.address,
      amount: "12.5",
      chainId: 137,
      token: { symbol: "USDC", address: USDC_ADDR, type: "erc20", decimals: 6 },
      from: account.address,
    }
    await expect(
      assertSignedRawMatchesPayload(raw, payload),
    ).rejects.toThrow(SignedTxMismatchError)
  })

  it("rejects when contract address differs (wrong token)", async () => {
    const { pk, account } = makeEoa()
    const recipient = makeEoa().account.address
    const otherToken = makeEoa().account.address
    const raw = await signErc20({
      pk,
      token: otherToken,
      recipient,
      amount: parseUnits("12.5", 6),
      chainId: 137,
    })
    const payload: TxIntentPayload = {
      to: recipient,
      amount: "12.5",
      chainId: 137,
      token: { symbol: "USDC", address: USDC_ADDR, type: "erc20", decimals: 6 },
      from: account.address,
    }
    await expect(
      assertSignedRawMatchesPayload(raw, payload),
    ).rejects.toThrow(SignedTxMismatchError)
  })
})

describe("assertSignedRawMatchesPayload — bad input", () => {
  it("rejects malformed bytes", async () => {
    const payload: TxIntentPayload = {
      to: "0x" + "1".repeat(40),
      amount: "1",
      chainId: 137,
      token: { symbol: "MATIC", address: null, type: "native", decimals: 18 },
      from: "0x" + "2".repeat(40),
    }
    await expect(
      assertSignedRawMatchesPayload("0xdeadbeef" as `0x${string}`, payload),
    ).rejects.toThrow(SignedTxMismatchError)
  })
})

describe("assertSignedRawMatchesPayload — extra surface", () => {
  it("rejects native tx with calldata", async () => {
    const { pk, account } = makeEoa()
    const to = makeEoa().account.address
    const raw = await signTransaction({
      privateKey: pk,
      transaction: {
        type: "eip1559",
        chainId: 137,
        to,
        value: 10n ** 16n,
        data: "0xdeadbeef",
        gas: 100_000n,
        maxFeePerGas: 1_000_000_000n,
        maxPriorityFeePerGas: 1_000_000_000n,
        nonce: 0,
      },
    })
    const payload: TxIntentPayload = {
      to,
      amount: "0.01",
      chainId: 137,
      token: { symbol: "MATIC", address: null, type: "native", decimals: 18 },
      from: account.address,
    }
    await expect(
      assertSignedRawMatchesPayload(raw, payload),
    ).rejects.toMatchObject({ code: "SIGNED_TX_UNEXPECTED_DATA" })
  })

  it("rejects ERC-20 tx with non-zero native value", async () => {
    const { pk, account } = makeEoa()
    const recipient = makeEoa().account.address
    const data = encodeFunctionData({
      abi: erc20Abi,
      functionName: "transfer",
      args: [recipient, parseUnits("1", 6)],
    })
    const raw = await signTransaction({
      privateKey: pk,
      transaction: {
        type: "eip1559",
        chainId: 137,
        to: USDC_ADDR,
        data,
        value: 10n,
        gas: 100_000n,
        maxFeePerGas: 1_000_000_000n,
        maxPriorityFeePerGas: 1_000_000_000n,
        nonce: 0,
      },
    })
    const payload: TxIntentPayload = {
      to: recipient,
      amount: "1",
      chainId: 137,
      token: { symbol: "USDC", address: USDC_ADDR, type: "erc20", decimals: 6 },
      from: account.address,
    }
    await expect(
      assertSignedRawMatchesPayload(raw, payload),
    ).rejects.toMatchObject({ code: "SIGNED_TX_UNEXPECTED_VALUE" })
  })

  it("rejects legacy transactions", async () => {
    const { pk, account } = makeEoa()
    const to = makeEoa().account.address
    const raw = await signTransaction({
      privateKey: pk,
      transaction: {
        type: "legacy",
        chainId: 137,
        to,
        value: 10n ** 16n,
        gas: 21_000n,
        gasPrice: 1_000_000_000n,
        nonce: 0,
      },
    })
    const payload: TxIntentPayload = {
      to,
      amount: "0.01",
      chainId: 137,
      token: { symbol: "MATIC", address: null, type: "native", decimals: 18 },
      from: account.address,
    }
    await expect(
      assertSignedRawMatchesPayload(raw, payload),
    ).rejects.toMatchObject({ code: "SIGNED_TX_UNSUPPORTED_TYPE" })
  })

  it("rejects EIP-2930 access-list transactions", async () => {
    const { pk, account } = makeEoa()
    const to = makeEoa().account.address
    const raw = await signTransaction({
      privateKey: pk,
      transaction: {
        type: "eip2930",
        chainId: 137,
        to,
        value: 10n ** 16n,
        gas: 21_000n,
        gasPrice: 1_000_000_000n,
        accessList: [],
        nonce: 0,
      },
    })
    const payload: TxIntentPayload = {
      to,
      amount: "0.01",
      chainId: 137,
      token: { symbol: "MATIC", address: null, type: "native", decimals: 18 },
      from: account.address,
    }
    await expect(
      assertSignedRawMatchesPayload(raw, payload),
    ).rejects.toMatchObject({ code: "SIGNED_TX_UNSUPPORTED_TYPE" })
  })

  it("rejects inflated maxFeePerGas (fee griefing)", async () => {
    const { pk, account } = makeEoa()
    const to = makeEoa().account.address
    const raw = await signTransaction({
      privateKey: pk,
      transaction: {
        type: "eip1559",
        chainId: 137,
        to,
        value: 10n ** 16n,
        gas: 21_000n,
        maxFeePerGas: 10_000_000_000_000n, // 10000 gwei — past the cap
        maxPriorityFeePerGas: 1_000_000_000n,
        nonce: 0,
      },
    })
    const payload: TxIntentPayload = {
      to,
      amount: "0.01",
      chainId: 137,
      token: { symbol: "MATIC", address: null, type: "native", decimals: 18 },
      from: account.address,
    }
    await expect(
      assertSignedRawMatchesPayload(raw, payload),
    ).rejects.toMatchObject({ code: "SIGNED_TX_FEE_TOO_HIGH" })
  })

  it("rejects inflated gas limit", async () => {
    const { pk, account } = makeEoa()
    const to = makeEoa().account.address
    const raw = await signTransaction({
      privateKey: pk,
      transaction: {
        type: "eip1559",
        chainId: 137,
        to,
        value: 10n ** 16n,
        gas: 30_000_000n, // past the cap
        maxFeePerGas: 1_000_000_000n,
        maxPriorityFeePerGas: 1_000_000_000n,
        nonce: 0,
      },
    })
    const payload: TxIntentPayload = {
      to,
      amount: "0.01",
      chainId: 137,
      token: { symbol: "MATIC", address: null, type: "native", decimals: 18 },
      from: account.address,
    }
    await expect(
      assertSignedRawMatchesPayload(raw, payload),
    ).rejects.toMatchObject({ code: "SIGNED_TX_GAS_TOO_HIGH" })
  })
})

