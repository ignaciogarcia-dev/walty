import { NextRequest, NextResponse } from "next/server"
import { and, eq } from "drizzle-orm"
import { db } from "@/server/db"
import { walletBackups, addresses } from "@/server/db/schema"
import { requireAuth } from "@/lib/auth"

export async function GET(req: NextRequest) {
  try {
    const { userId } = requireAuth(req)

    const backup = await db.query.walletBackups.findFirst({
      where: eq(walletBackups.userId, userId),
    })

    if (!backup) {
      return NextResponse.json({ backup: null })
    }

    return NextResponse.json({
      backup: {
        ciphertext: backup.ciphertext,
        iv: backup.iv,
        salt: backup.salt,
        version: backup.version,
        walletAddress: backup.walletAddress,
      },
    })
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const { userId } = requireAuth(req)
    const { ciphertext, iv, salt, walletAddress, version } = await req.json()

    if (!ciphertext || !iv || !salt || !walletAddress || !version) {
      return NextResponse.json({ error: "Missing fields" }, { status: 400 })
    }

    // Verify the wallet address belongs to this user
    const addr = await db.query.addresses.findFirst({
      where: and(
        eq(addresses.userId, userId),
        eq(addresses.address, walletAddress),
      ),
    })

    if (!addr) {
      return NextResponse.json({ error: "Address not linked to account" }, { status: 403 })
    }

    // Upsert: replace any existing backup for this user
    await db.delete(walletBackups).where(eq(walletBackups.userId, userId))
    await db.insert(walletBackups).values({
      userId,
      walletAddress,
      ciphertext,
      iv,
      salt,
      version,
    })

    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
}
