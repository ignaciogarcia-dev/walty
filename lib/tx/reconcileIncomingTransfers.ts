import { eq, and } from "drizzle-orm"
import { parseAbiItem } from "viem"
import { db } from "@/server/db"
import { tokenScanCursors, transactions, addresses } from "@/server/db/schema"
import { getPublicClient } from "@/lib/rpc/getPublicClient"
import { getTokensByChain } from "@/lib/tokens/tokenRegistry"
import { PAYMENT_CHAIN_ID, PAYMENT_ALLOWED_TOKENS } from "@/lib/payments/config"

// Alchemy Free tier: max 10 blocks per getLogs request
const BLOCK_WINDOW = 10

const TRANSFER_EVENT = parseAbiItem(
  "event Transfer(address indexed from, address indexed to, uint256 value)",
)

function formatTokenAmount(raw: bigint, decimals: number): string {
  const divisor = BigInt(10 ** decimals)
  const whole = raw / divisor
  const frac = raw % divisor
  if (frac === 0n) return whole.toString()
  return `${whole}.${frac.toString().padStart(decimals, "0").replace(/0+$/, "")}`
}

type TokenResult = {
  token: string
  newTxs: number
  fromBlock: number
  toBlock: number
}

type ReconcileResult = {
  tokens: TokenResult[]
  totalNewTxs: number
}

export async function reconcileIncomingTransfers(): Promise<ReconcileResult> {
  const client = getPublicClient(PAYMENT_CHAIN_ID)

  // 1 shared getBlockNumber() call for all tokens
  const safeBlock = Number(await client.getBlockNumber()) - 1

  // Load all known wallet addresses → userId map
  const allAddresses = await db.select({ address: addresses.address, userId: addresses.userId }).from(addresses)
  const addressToUserId = new Map<string, number>()
  for (const row of allAddresses) {
    addressToUserId.set(row.address.toLowerCase(), row.userId)
  }

  if (addressToUserId.size === 0) {
    return { tokens: [], totalNewTxs: 0 }
  }

  // Only scan USDC and USDT on Polygon (as per plan)
  const supportedTokens = getTokensByChain(PAYMENT_CHAIN_ID).filter(
    (t) => t.type === "erc20" && t.address && (PAYMENT_ALLOWED_TOKENS as readonly string[]).includes(t.symbol),
  )

  const results: TokenResult[] = []
  let totalNewTxs = 0

  for (const tokenDef of supportedTokens) {
    if (!tokenDef.address) continue
    const tokenAddress = tokenDef.address.toLowerCase()

    // Read cursor for this token
    const [cursor] = await db
      .select({ lastBlock: tokenScanCursors.lastBlock })
      .from(tokenScanCursors)
      .where(
        and(
          eq(tokenScanCursors.tokenAddress, tokenAddress),
          eq(tokenScanCursors.chainId, PAYMENT_CHAIN_ID),
        ),
      )

    const fromBlock = cursor ? cursor.lastBlock + 1 : Math.max(0, safeBlock - BLOCK_WINDOW)

    if (fromBlock > safeBlock) {
      results.push({ token: tokenDef.symbol, newTxs: 0, fromBlock, toBlock: safeBlock })
      continue
    }

    let newTxs = 0

    for (let from = fromBlock; from <= safeBlock; from += BLOCK_WINDOW) {
      const to = Math.min(from + BLOCK_WINDOW - 1, safeBlock)
      // getLogs with NO `to` filter — fetch all transfers in this range, filter in memory
      const logs = await client.getLogs({
        address: tokenDef.address,
        event: TRANSFER_EVENT,
        fromBlock: BigInt(from),
        toBlock: BigInt(to),
      })

      for (const log of logs) {
        if (!log.transactionHash || !log.args.to || log.args.value === undefined) continue
        if (log.args.value === 0n) continue  // skip zero-value spam/dust transfers

        const toAddr = log.args.to.toLowerCase()
        const userId = addressToUserId.get(toAddr)
        if (!userId) continue  // not a wallet we know about

        const value = formatTokenAmount(log.args.value, tokenDef.decimals)
        const logIdx = Number(log.logIndex ?? 0)

        // Conflict resolution invariant:
        //   type=null (cobro) is immutable once written — DO NOTHING here.
        //   type='receive' is temporary and gets overwritten by the payment
        //   reconciler via ON CONFLICT DO UPDATE SET type=null.
        //
        //   Winner | Runner-up              | Result
        //   receive | payment reconciler    | null  ✓
        //   null    | reconcileIncoming     | null  ✓  (DO NOTHING)
        //   receive | nobody                | receive ✓
        //   null    | nobody                | null  ✓
        const inserted = await db
          .insert(transactions)
          .values({
            userId,
            hash: log.transactionHash,
            logIndex: logIdx,
            type: "receive",
            chainId: PAYMENT_CHAIN_ID,
            chainType: "EVM",
            fromAddress: log.args.from ? log.args.from.toLowerCase() : "",
            toAddress: toAddr,
            tokenAddress,
            tokenSymbol: tokenDef.symbol,
            value,
            status: "confirmed",
            blockNumber: log.blockNumber?.toString() ?? null,
          })
          .onConflictDoNothing()
          .returning({ id: transactions.id })

        if (inserted.length > 0) newTxs++
      }
    }

    // Upsert cursor
    await db
      .insert(tokenScanCursors)
      .values({ tokenAddress, chainId: PAYMENT_CHAIN_ID, lastBlock: safeBlock })
      .onConflictDoUpdate({
        target: [tokenScanCursors.tokenAddress, tokenScanCursors.chainId],
        set: { lastBlock: safeBlock, updatedAt: new Date() },
      })

    results.push({ token: tokenDef.symbol, newTxs, fromBlock, toBlock: safeBlock })
    totalNewTxs += newTxs
  }

  return { tokens: results, totalNewTxs }
}
