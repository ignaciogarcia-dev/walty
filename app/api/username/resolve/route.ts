import { NextRequest, NextResponse } from "next/server"
import { eq } from "drizzle-orm"
import { db } from "@/server/db"
import { userProfiles, addresses } from "@/server/db/schema"
import { requireAuth } from "@/lib/auth"

export async function GET(req: NextRequest) {
  try {
    requireAuth(req)
    const username = req.nextUrl.searchParams.get("username")?.trim().toLowerCase()

    if (!username || username.length < 3 || username.length > 20 || !/^[a-z0-9_]+$/.test(username)) {
      return NextResponse.json({ error: "Invalid username" }, { status: 400 })
    }

    const profile = await db.query.userProfiles.findFirst({
      where: eq(userProfiles.username, username),
    })

    if (!profile) {
      return NextResponse.json({ error: "Username not found" }, { status: 404 })
    }

    const addr = await db.query.addresses.findFirst({
      where: eq(addresses.userId, profile.userId),
    })

    if (!addr) {
      return NextResponse.json({ error: "No wallet linked to this user" }, { status: 404 })
    }

    return NextResponse.json({ address: addr.address })
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
}
