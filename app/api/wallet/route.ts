import { NextRequest, NextResponse } from "next/server"
import { verifyMessage } from "viem"
import { db } from "@/server/db"
import { addresses } from "@/server/db/schema"
import { requireAuth } from "@/lib/auth"

export async function POST(req: NextRequest) {
  try {
    const { userId } = requireAuth(req)
    const { address, signature } = await req.json()

    const message = `Link wallet ${address} to user ${userId}`
    const valid = await verifyMessage({ address, message, signature })

    if (!valid) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 403 })
    }

    await db.insert(addresses).values({
      userId: String(userId),
      address,
    })

    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
}
