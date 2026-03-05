import { NextRequest, NextResponse } from "next/server"
import { requireAuth } from "@/lib/auth"
import { getPrice } from "@/lib/0x"

export async function GET(req: NextRequest) {
  try {
    requireAuth(req)

    const { searchParams } = new URL(req.url)
    const sellToken = searchParams.get("sellToken")
    const buyToken = searchParams.get("buyToken")
    const sellAmount = searchParams.get("sellAmount")
    const chainId = Number(searchParams.get("chainId") ?? "1")

    if (!sellToken || !buyToken || !sellAmount) {
      return NextResponse.json({ error: "Missing params" }, { status: 400 })
    }

    // "ETH" string is handled by toZeroxToken inside getPrice
    const price = await getPrice({ sellToken, buyToken, sellAmount, chainId })
    return NextResponse.json(price)
  } catch (err) {
    if (err instanceof Error && err.message.includes("Unauthorized")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Price failed" },
      { status: 500 }
    )
  }
}
