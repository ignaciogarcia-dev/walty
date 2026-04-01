import { type Hex } from "viem"
import { getPublicClient } from "@/lib/rpc/getPublicClient"

export type VerifyTxExpected = {
  from?: string
  to?: string
  value?: bigint
  /** For ERC-20 transfers: token contract address */
  tokenAddress?: string
  chainId: number
}

export type VerifiedTx = {
  hash: Hex
  from: string
  to: string
  value: string
  blockNumber: string
  gasUsed: string
  status: "confirmed" | "failed"
}

/**
 * Fetches a transaction and its receipt from the chain and validates it
 * against the expected parameters.
 *
 * Throws descriptive errors when the tx is not found or doesn't match.
 */
export async function verifyTransaction(
  hash: Hex,
  expected: VerifyTxExpected,
): Promise<VerifiedTx> {
  const client = getPublicClient(expected.chainId)

  const [receipt, tx] = await Promise.all([
    client.getTransactionReceipt({ hash }),
    client.getTransaction({ hash }),
  ])

  // Validate sender
  if (expected.from && tx.from.toLowerCase() !== expected.from.toLowerCase()) {
    throw new TxVerificationError("TX_INVALID_FROM", `Expected from ${expected.from}, got ${tx.from}`)
  }

  if (expected.tokenAddress) {
    // ERC-20 transfer: the on-chain tx.to is the token contract
    if (tx.to?.toLowerCase() !== expected.tokenAddress.toLowerCase()) {
      throw new TxVerificationError("TX_INVALID_TOKEN_CONTRACT", `Expected token contract ${expected.tokenAddress}, got ${tx.to}`)
    }

    // Decode Transfer logs to validate recipient and amount
    const transferLogs = receipt.logs.filter(
      (log) =>
        log.address.toLowerCase() === expected.tokenAddress!.toLowerCase() &&
        log.topics[0] === "0xddf252ad1be2c89b69c2b068fc378daa0952ba7163c2910d1d62502b1805e836", // Transfer(address,address,uint256)
    )

    if (transferLogs.length === 0) {
      throw new TxVerificationError("TX_NO_TRANSFER_LOG", "No ERC-20 Transfer event found")
    }

    // Check that at least one Transfer log matches the expected recipient
    if (expected.to) {
      const toTopic = `0x${expected.to.toLowerCase().slice(2).padStart(64, "0")}`
      const matchingLog = transferLogs.find((log) => log.topics[2]?.toLowerCase() === toTopic)
      if (!matchingLog) {
        throw new TxVerificationError("TX_INVALID_TO", `No Transfer event to ${expected.to}`)
      }

      // Validate amount if expected
      if (expected.value !== undefined && matchingLog.data) {
        const transferredAmount = BigInt(matchingLog.data)
        if (transferredAmount !== expected.value) {
          throw new TxVerificationError("TX_INVALID_VALUE", `Expected value ${expected.value}, got ${transferredAmount}`)
        }
      }
    }
  } else {
    // Native transfer: validate recipient and value directly
    if (expected.to && tx.to?.toLowerCase() !== expected.to.toLowerCase()) {
      throw new TxVerificationError("TX_INVALID_TO", `Expected to ${expected.to}, got ${tx.to}`)
    }

    if (expected.value !== undefined && tx.value !== expected.value) {
      throw new TxVerificationError("TX_INVALID_VALUE", `Expected value ${expected.value}, got ${tx.value}`)
    }
  }

  return {
    hash,
    from: tx.from,
    to: (tx.to ?? "") as string,
    value: tx.value.toString(),
    blockNumber: receipt.blockNumber.toString(),
    gasUsed: receipt.gasUsed.toString(),
    status: receipt.status === "success" ? "confirmed" : "failed",
  }
}

export class TxVerificationError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message)
    this.name = "TxVerificationError"
  }
}
