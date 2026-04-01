import { NextRequest } from "next/server"
import { getPortfolio } from "@/lib/portfolio/portfolio-engine"
import { withErrorHandling, withAuth, ok, ValidationError } from "@/lib/api"
import { rateLimitByUser } from "@/lib/rate-limit"

export const GET = withErrorHandling(withAuth(async (req: NextRequest, { auth }) => {
  await rateLimitByUser(auth.userId, 10, 60_000)

  const address = req.nextUrl.searchParams.get("address")
  if (!address) throw new ValidationError("Missing address")

  const { positions, totalUsd } = await getPortfolio(address)

  // Strip balanceRaw (bigint) — not JSON-serializable and unused in UI
  const serialized = positions.map(({ balanceRaw: _raw, ...rest }) => rest)

  return ok({ positions: serialized, totalUsd, userId: auth.userId })
}))
