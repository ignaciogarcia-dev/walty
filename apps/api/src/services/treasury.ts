import { and, eq } from "drizzle-orm"
import { db, businessTreasuries } from "@walty/db"
import { deploySafe, predictSafeAddress } from "../lib/safe.js"
import { env } from "../config/env.js"

export type BusinessTreasury = typeof businessTreasuries.$inferSelect

export async function getTreasury(
  userId: number,
  chainId = env.safeChainId,
): Promise<BusinessTreasury | null> {
  const row = await db.query.businessTreasuries.findFirst({
    where: and(
      eq(businessTreasuries.userId, userId),
      eq(businessTreasuries.chainId, chainId),
    ),
  })
  return row ?? null
}

export async function ensureTreasury(
  userId: number,
  ownerAddress: string,
): Promise<BusinessTreasury> {
  const existing = await getTreasury(userId)
  if (existing?.status === "deployed") return existing

  if (!env.safeDeployerPrivateKey) {
    throw new Error("safe-deployer-not-configured")
  }

  const chainId = env.safeChainId
  const saltNonce = `walty-${userId}`
  const predicted = await predictSafeAddress({ ownerAddress, chainId, saltNonce })

  // Claim the (userId, chainId) slot. If a concurrent request already created
  // a row, this is a no-op and we proceed to (idempotently) deploy + update.
  // Known limitation: true simultaneous deploys may both call deploySafe; the
  // second hits an already-deployed CREATE2 address and reverts, which Fix 2
  // turns into a thrown error for that one request, while the DB stays consistent.
  await db
    .insert(businessTreasuries)
    .values({ userId, chainId, safeAddress: predicted, status: "pending" })
    .onConflictDoNothing()

  const { safeAddress, txHash } = await deploySafe({
    ownerAddress,
    chainId,
    saltNonce,
    deployerPrivateKey: env.safeDeployerPrivateKey,
  })

  const [updated] = await db
    .update(businessTreasuries)
    .set({ status: "deployed", deployTxHash: txHash, safeAddress })
    .where(
      and(
        eq(businessTreasuries.userId, userId),
        eq(businessTreasuries.chainId, chainId),
      ),
    )
    .returning()
  return updated
}
