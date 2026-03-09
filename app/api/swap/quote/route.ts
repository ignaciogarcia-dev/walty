import { NextRequest, NextResponse } from "next/server"
import { requireAuth } from "@/lib/auth"
import { getBestQuote } from "@/lib/providers/swap/swapRouter"

export async function GET(req: NextRequest) {
  try {
    requireAuth(req)

    const { searchParams } = new URL(req.url)
    const sellToken = searchParams.get("sellToken")
    const buyToken = searchParams.get("buyToken")
    const sellAmount = searchParams.get("sellAmount")
    const takerAddress = searchParams.get("takerAddress")
    const chainId = Number(searchParams.get("chainId") ?? "1")

    if (!sellToken || !buyToken || !sellAmount || !takerAddress) {
      return NextResponse.json({ error: "Missing params" }, { status: 400 })
    }

    const quote = await getBestQuote({
      sellToken,
      buyToken,
      sellAmount,
      takerAddress,
      chainId,
    })

    return NextResponse.json(quote)
  } catch (err) {
    if (err instanceof Error && err.message.includes("Unauthorized")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Quote failed" },
      { status: 500 }
    )
  }
}
