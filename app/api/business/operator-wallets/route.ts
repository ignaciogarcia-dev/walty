import { NextRequest } from "next/server"
import { and, eq, isNotNull } from "drizzle-orm"
import { formatUnits } from "viem"
import { db } from "@/server/db"
import { businessMembers, userProfiles, users } from "@/server/db/schema"
import { getOperatorTokenBalances } from "@/lib/business/operatorBalance"
import { withBusinessAuth, ok } from "@/lib/api"
import { Permission } from "@/lib/permissions"

export const GET = withBusinessAuth(Permission.MEMBER_LIST, async (_req: NextRequest, { business }) => {
  const rows = await db
    .select({
      id: businessMembers.id,
      status: businessMembers.status,
      walletAddress: businessMembers.walletAddress,
      derivationIndex: businessMembers.derivationIndex,
      userId: businessMembers.userId,
      inviteEmail: businessMembers.inviteEmail,
      userEmail: users.email,
      username: userProfiles.username,
    })
    .from(businessMembers)
    .leftJoin(users, eq(businessMembers.userId, users.id))
    .leftJoin(userProfiles, eq(businessMembers.userId, userProfiles.userId))
    .where(
      and(
        eq(businessMembers.businessId, business.businessId),
        isNotNull(businessMembers.walletAddress),
      ),
    )
    .orderBy(businessMembers.derivationIndex)

  const wallets = await Promise.all(
    rows.map(async (row) => {
      const displayName =
        row.username ?? row.userEmail ?? row.inviteEmail ?? `Cajero #${row.derivationIndex}`

      let balances = { USDC: "0.00", USDT: "0.00" }

      try {
        const raw = await getOperatorTokenBalances(row.walletAddress!)
        const USDC_DECIMALS = 6
        const USDT_DECIMALS = 6
        balances = {
          USDC: formatUnits(raw.USDC ?? 0n, USDC_DECIMALS),
          USDT: formatUnits(raw.USDT ?? 0n, USDT_DECIMALS),
        }
      } catch {
        // If RPC fails for one wallet, show 0 — don't block the whole list
      }

      return {
        memberId: row.id,
        displayName,
        walletAddress: row.walletAddress!,
        derivationIndex: row.derivationIndex!,
        status: row.status,
        balances,
      }
    }),
  )

  return ok({ wallets })
})
