import { NextRequest, NextResponse } from "next/server"
import { requireAuth } from "@/lib/auth"
import { getPortfolio } from "@/lib/portfolio/portfolio-engine"

export async function GET(req: NextRequest) {
  try {
    const { userId } = requireAuth(req)
    const address = req.nextUrl.searchParams.get("address")
    if (!address) {
      return NextResponse.json({ error: "Missing address" }, { status: 400 })
    }

    const { positions, totalUsd } = await getPortfolio(address)

    // Strip balanceRaw (bigint) — not JSON-serializable and unused in UI
    const serialized = positions.map(({ balanceRaw: _raw, ...rest }) => rest)

    return NextResponse.json({ positions: serialized, totalUsd, userId })
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
}
