import { randomBytes } from "crypto"
import { NextRequest, NextResponse } from "next/server"
import { db } from "@/server/db"
import { walletNonces } from "@/server/db/schema"
import { requireAuth } from "@/lib/auth"

export async function POST(req: NextRequest) {
  try {
    const { userId } = requireAuth(req)

    const nonce = randomBytes(16).toString("hex")

    await db.insert(walletNonces).values({
      userId: Number(userId),
      nonce,
      expiresAt: new Date(Date.now() + 5 * 60 * 1000),
    })

    return NextResponse.json({ nonce })
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
}
