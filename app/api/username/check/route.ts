import { NextRequest, NextResponse } from "next/server"
import { eq } from "drizzle-orm"
import { db } from "@/server/db"
import { userProfiles } from "@/server/db/schema"
import { requireAuth } from "@/lib/auth"

export async function GET(req: NextRequest) {
  try {
    requireAuth(req)
    const username = req.nextUrl.searchParams.get("username")?.trim().toLowerCase()

    if (!username || username.length < 3 || username.length > 20 || !/^[a-z0-9_]+$/.test(username)) {
      return NextResponse.json({ available: false, error: "Invalid username" })
    }

    const existing = await db.query.userProfiles.findFirst({
      where: eq(userProfiles.username, username),
    })

    return NextResponse.json({ available: !existing })
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
}
