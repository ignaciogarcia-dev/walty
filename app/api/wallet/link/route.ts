import { NextRequest, NextResponse } from "next/server"
import { and, eq } from "drizzle-orm"
import { verifyMessage } from "viem"
import { db } from "@/server/db"
import { walletNonces, addresses } from "@/server/db/schema"
import { requireAuth } from "@/lib/auth"

export async function POST(req: NextRequest) {
  try {
    const { userId } = requireAuth(req)
    const { address, signature, nonce } = await req.json()

    const record = await db.query.walletNonces.findFirst({
      where: and(
        eq(walletNonces.nonce, nonce),
        eq(walletNonces.userId, userId),
      ),
    })

    if (!record || record.expiresAt < new Date()) {
      return NextResponse.json({ error: "Invalid nonce" }, { status: 400 })
    }

    const message = `Link wallet ${address} nonce ${nonce}`

    const valid = await verifyMessage({ address, message, signature })

    if (!valid) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 403 })
    }

    await db.delete(walletNonces).where(eq(walletNonces.id, record.id))

    await db.insert(addresses).values({ userId, address })

    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
}
