import { and, eq } from "drizzle-orm"
import { db, businessTreasuries } from "@walty/db"
import { deploySafe, getAdminAddress, predictSafeAddress } from "../lib/safe.js"
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
  ownerAddress: string, // informational in stratum (a) — the on-chain owner is the admin EOA until the MPC swap
): Promise<BusinessTreasury> {
  const existing = await getTreasury(userId)
  if (existing?.status === "deployed") return existing

  if (!env.safeDeployerPrivateKey) {
    throw new Error("safe-deployer-not-configured")
  }

  // In stratum (a) the Safe is owned by the server admin EOA so the server can
  // sign enableModule / Roles setup without browser interaction. ownerAddress
  // (the user's real wallet) will replace this once the MPC ownership swap lands.
  const owner = getAdminAddress()

  const chainId = env.safeChainId
  // saltNonce must be a numeric string: the Safe Protocol Kit runs BigInt(saltNonce)
  // internally, so a non-numeric salt (e.g. `walty-${userId}`) throws at deploy time.
  const saltNonce = String(userId)
  const predicted = await predictSafeAddress({ ownerAddress: owner, chainId, saltNonce })

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
    ownerAddress: owner,
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
