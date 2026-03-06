import { NextRequest, NextResponse } from "next/server"
import { eq } from "drizzle-orm"
import { db } from "@/server/db"
import { userProfiles } from "@/server/db/schema"
import { requireAuth } from "@/lib/auth"

export async function POST(req: NextRequest) {
  try {
    const { userId } = requireAuth(req)
    const { username } = await req.json()
    const clean = username?.trim().toLowerCase()

    if (!clean || clean.length < 3 || clean.length > 20 || !/^[a-z0-9_]+$/.test(clean)) {
      return NextResponse.json({ error: "Invalid username" }, { status: 400 })
    }

    // Check availability and insert in one operation
    const existing = await db.query.userProfiles.findFirst({
      where: eq(userProfiles.username, clean),
    })
    if (existing) {
      return NextResponse.json({ error: "Username taken" }, { status: 409 })
    }

    await db.insert(userProfiles).values({ userId, username: clean })
    return NextResponse.json({ ok: true, username: clean })
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
}

export async function GET(req: NextRequest) {
  try {
    const { userId } = requireAuth(req)
    const profile = await db.query.userProfiles.findFirst({
      where: eq(userProfiles.userId, userId),
    })
    return NextResponse.json({ username: profile?.username ?? null })
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
}
