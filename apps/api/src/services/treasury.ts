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
  if (existing) return existing

  const chainId = env.safeChainId
  const saltNonce = `walty-${userId}`
  const safeAddress = await predictSafeAddress({ ownerAddress, chainId, saltNonce })

  const [row] = await db
    .insert(businessTreasuries)
    .values({ userId, chainId, safeAddress, status: "pending" })
    .returning()

  const { txHash } = await deploySafe({
    ownerAddress, chainId, saltNonce,
    deployerPrivateKey: env.safeDeployerPrivateKey,
  })

  const [updated] = await db
    .update(businessTreasuries)
    .set({ status: "deployed", deployTxHash: txHash })
    .where(eq(businessTreasuries.id, row.id))
    .returning()
  return updated
}
