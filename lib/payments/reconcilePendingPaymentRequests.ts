import { and, asc, eq, inArray, sql } from "drizzle-orm"
import { parseAbiItem, formatUnits } from "viem"
import { getPublicClient } from "@/lib/rpc/getPublicClient"
import { db } from "@/server/db"
import { paymentRequests, splitPaymentContributions, transactions } from "@/server/db/schema"
import { normalizePaymentRequest } from "@/lib/payments/paymentRequests"

const TRANSFER_EVENT = parseAbiItem(
  "event Transfer(address indexed from, address indexed to, uint256 value)"
)

type ReconcileOptions = {
  limit?: number
  id?: string
}

type ReconcileResult = {
  processed: number
  confirming: number
  detected: number
  paid: number
  expired: number
}

export async function reconcilePendingPaymentRequests(
  options: ReconcileOptions = {}
): Promise<ReconcileResult> {
  const limit = options.limit ?? 100
  const result: ReconcileResult = {
    processed: 0,
    confirming: 0,
    detected: 0,
    paid: 0,
    expired: 0,
  }

  const statusFilter = inArray(paymentRequests.status, ["pending", "confirming"])
  const whereClause = options.id
    ? and(statusFilter, eq(paymentRequests.id, options.id))
    : statusFilter

  const rows = await db
    .select()
    .from(paymentRequests)
    .where(whereClause)
    .orderBy(asc(paymentRequests.createdAt))
    .limit(limit)

  for (const row of rows) {
    result.processed += 1
    const request = normalizePaymentRequest(row)
    const client = getPublicClient(request.chainId)
    const currentBlock = await client.getBlockNumber()
    const now = new Date()

    // Handle confirming status (only for non-split payments)
    if (request.status === "confirming" && !request.isSplitPayment) {
      if (!request.txHash) continue

      const receipt = await client
        .getTransactionReceipt({ hash: request.txHash as `0x${string}` })
        .catch(() => null)

      if (!receipt?.blockNumber || receipt.status !== "success") continue

      const confirmations = Number(currentBlock - receipt.blockNumber + 1n)
      const nextStatus = confirmations >= request.requiredConfirmations ? "paid" : "confirming"
      const shouldUpdate = confirmations !== request.confirmations || nextStatus === "paid"

      if (!shouldUpdate) continue

      await db
        .update(paymentRequests)
        .set({
          confirmations,
          status: nextStatus,
          paidAt: nextStatus === "paid" ? now : row.paidAt,
          updatedAt: now,
        })
        .where(eq(paymentRequests.id, request.id))

      if (nextStatus === "paid") {
        result.paid += 1
      } else {
        result.confirming += 1
      }

      continue
    }

    const SAFE_BLOCK_OFFSET = 20n
    const scanFromBlock =
      BigInt(request.lastScannedBlock) > SAFE_BLOCK_OFFSET
        ? BigInt(request.lastScannedBlock) - SAFE_BLOCK_OFFSET
        : 0n
    let matched = false

    // Handle split payments differently
    if (request.isSplitPayment) {
      if (scanFromBlock <= currentBlock) {
        const logs = await client.getLogs({
          address: request.tokenAddress,
          event: TRANSFER_EVENT,
          args: { to: request.merchantWalletAddress as `0x${string}` },
          fromBlock: scanFromBlock,
          toBlock: currentBlock,
        })

        for (const log of logs) {
          if (!log.transactionHash || !log.blockNumber || !log.args.value) continue

          const block = await client.getBlock({ blockNumber: log.blockNumber })
          const blockTimestampMs = Number(block.timestamp) * 1000
          if (blockTimestampMs > request.expiresAt.getTime()) continue

          // Check if this contribution already exists
          const existingContribution = await db.query.splitPaymentContributions.findFirst({
            where: eq(splitPaymentContributions.txHash, log.transactionHash),
          })

          if (existingContribution) continue

          // Check if this tx is already claimed by a non-split payment
          const claimedRequest = await db.query.paymentRequests.findFirst({
            where: and(
              eq(paymentRequests.txHash, log.transactionHash),
              inArray(paymentRequests.status, ["confirming", "paid"])
            ),
          })

          if (claimedRequest) continue

          const transferAmountToken = log.args.value.toString()
          const transferAmountUsd = formatUnits(BigInt(transferAmountToken), request.tokenDecimals)

          const currentTotalPaidToken = BigInt(request.totalPaidToken ?? "0")
          const newTotalPaidToken = (currentTotalPaidToken + BigInt(transferAmountToken)).toString()
          const confirmations = Number(currentBlock - log.blockNumber + 1n)
          const contributionStatus = confirmations >= request.requiredConfirmations ? "confirmed" : "confirming"

          try {
            // Create contribution
            await db.insert(splitPaymentContributions).values({
              paymentRequestId: request.id,
              txHash: log.transactionHash,
              payerAddress: log.args.from ? String(log.args.from) : "",
              amountToken: transferAmountToken,
              amountUsd: transferAmountUsd,
              tokenSymbol: request.tokenSymbol,
              confirmations,
              status: contributionStatus,
              blockNumber: log.blockNumber.toString(),
              detectedAt: now,
              confirmedAt: contributionStatus === "confirmed" ? now : null,
            })

            // Update payment request totals using SQL arithmetic to avoid
            // lost-update race when two reconciler instances run concurrently.
            const amountTokenBigInt = BigInt(request.amountToken)
            const newTotalBigInt = BigInt(newTotalPaidToken)
            const isFullyPaid = newTotalBigInt >= amountTokenBigInt

            await db
              .update(paymentRequests)
              .set({
                totalPaidToken: sql`${paymentRequests.totalPaidToken}::bigint + ${BigInt(transferAmountToken)}`,
                totalPaidUsd: sql`(${paymentRequests.totalPaidUsd}::numeric + ${parseFloat(transferAmountUsd)})::text`,
                status: isFullyPaid ? "paid" : "pending",
                paidAt: isFullyPaid ? now : null,
                lastScannedBlock: currentBlock.toString(),
                updatedAt: now,
              })
              .where(eq(paymentRequests.id, request.id))

            await db.insert(transactions).values({
              userId: request.merchantId,
              hash: log.transactionHash,
              logIndex: Number(log.logIndex ?? 0),
              chainId: request.chainId,
              chainType: "EVM",
              fromAddress: log.args.from ? String(log.args.from) : "",
              toAddress: request.merchantWalletAddress,
              tokenAddress: request.tokenAddress,
              tokenSymbol: request.tokenSymbol,
              value: transferAmountUsd,
              status: contributionStatus === "confirmed" ? "confirmed" : "pending",
              blockNumber: log.blockNumber.toString(),
            }).onConflictDoUpdate({
              target: [transactions.hash, transactions.logIndex],
              set: { type: null },
            })

            matched = true
            result.detected += 1
            if (isFullyPaid) {
              result.paid += 1
            }
          } catch (error) {
            if (
              typeof error === "object" &&
              error !== null &&
              "code" in error &&
              error.code === "23505"
            ) {
              continue
            }
            throw error
          }
        }

        // Update confirming contributions
        const confirmingContributions = await db
          .select()
          .from(splitPaymentContributions)
          .where(
            and(
              eq(splitPaymentContributions.paymentRequestId, request.id),
              eq(splitPaymentContributions.status, "confirming")
            )
          )

        for (const contribution of confirmingContributions) {
          const receipt = await client
            .getTransactionReceipt({ hash: contribution.txHash as `0x${string}` })
            .catch(() => null)

          if (!receipt?.blockNumber || receipt.status !== "success") continue

          const confirmations = Number(currentBlock - receipt.blockNumber + 1n)
          if (confirmations >= request.requiredConfirmations) {
            await db
              .update(splitPaymentContributions)
              .set({
                status: "confirmed",
                confirmations,
                confirmedAt: now,
              })
              .where(eq(splitPaymentContributions.id, contribution.id))
          } else {
            await db
              .update(splitPaymentContributions)
              .set({
                confirmations,
              })
              .where(eq(splitPaymentContributions.id, contribution.id))
          }
        }
      }
    } else {
      // Original logic for non-split payments
      if (scanFromBlock <= currentBlock) {
        const logs = await client.getLogs({
          address: request.tokenAddress,
          event: TRANSFER_EVENT,
          args: { to: request.merchantWalletAddress as `0x${string}` },
          fromBlock: scanFromBlock,
          toBlock: currentBlock,
        })

        for (const log of logs) {
          if (!log.transactionHash || !log.blockNumber || !log.args.value) continue
          // Accept any positive transfer — exact/overpaid/underpaid handled below
          if (log.args.value === 0n) continue

          const claimedRequest = await db.query.paymentRequests.findFirst({
            where: and(
              eq(paymentRequests.txHash, log.transactionHash),
              inArray(paymentRequests.status, ["confirming", "paid"])
            ),
          })

          if (claimedRequest) continue

          const block = await client.getBlock({ blockNumber: log.blockNumber })
          const blockTimestampMs = Number(block.timestamp) * 1000
          if (blockTimestampMs > request.expiresAt.getTime()) continue

          const confirmations = Number(currentBlock - log.blockNumber + 1n)
          const nextStatus = confirmations >= request.requiredConfirmations ? "paid" : "confirming"

          const receivedBigInt = log.args.value
          const expectedBigInt = BigInt(request.amountToken)
          const discrepancy =
            receivedBigInt === expectedBigInt
              ? "exact"
              : receivedBigInt > expectedBigInt
                ? "overpaid"
                : "underpaid"
          const receivedAmountToken = receivedBigInt.toString()
          const receivedAmountUsd = formatUnits(receivedBigInt, request.tokenDecimals)

          try {
            const updated = await db
              .update(paymentRequests)
              .set({
                status: nextStatus,
                txHash: log.transactionHash,
                txBlockNumber: log.blockNumber.toString(),
                payerAddress: log.args.from ? String(log.args.from) : null,
                confirmations,
                detectedAt: now,
                paidAt: nextStatus === "paid" ? now : null,
                lastScannedBlock: currentBlock.toString(),
                receivedAmountToken,
                receivedAmountUsd,
                paymentDiscrepancy: discrepancy,
                updatedAt: now,
              })
              .where(and(eq(paymentRequests.id, request.id), eq(paymentRequests.status, "pending")))
              .returning({ id: paymentRequests.id })

            // Another reconciler instance already claimed this request
            if (updated.length === 0) continue

            await db.insert(transactions).values({
              userId: request.merchantId,
              hash: log.transactionHash,
              logIndex: Number(log.logIndex ?? 0),
              chainId: request.chainId,
              chainType: "EVM",
              fromAddress: log.args.from ? String(log.args.from) : "",
              toAddress: request.merchantWalletAddress,
              tokenAddress: request.tokenAddress,
              tokenSymbol: request.tokenSymbol,
              value: receivedAmountUsd,
              status: nextStatus === "paid" ? "confirmed" : "pending",
              blockNumber: log.blockNumber.toString(),
            }).onConflictDoUpdate({
              target: [transactions.hash, transactions.logIndex],
              set: { type: null },
            })
          } catch (error) {
            if (
              typeof error === "object" &&
              error !== null &&
              "code" in error &&
              error.code === "23505"
            ) {
              continue
            }
            throw error
          }

          matched = true
          result.detected += 1
          if (nextStatus === "paid") {
            result.paid += 1
          } else {
            result.confirming += 1
          }
          break
        }
      }
    }

    if (matched) continue

    if (now > request.expiresAt) {
      await db
        .update(paymentRequests)
        .set({
          status: "expired",
          lastScannedBlock: currentBlock.toString(),
          updatedAt: now,
        })
        .where(eq(paymentRequests.id, request.id))

      result.expired += 1
      continue
    }

    if (request.lastScannedBlock !== currentBlock.toString()) {
      await db
        .update(paymentRequests)
        .set({
          lastScannedBlock: currentBlock.toString(),
          updatedAt: now,
        })
        .where(eq(paymentRequests.id, request.id))
    }
  }

  return result
}
