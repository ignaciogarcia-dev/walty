import { NextRequest, NextResponse } from "next/server"
import { requireAuth } from "@/lib/auth"
import { db } from "@/server/db"
import { users } from "@/server/db/schema"
import { eq } from "drizzle-orm"

export async function GET(req: NextRequest) {
  try {
    const auth = requireAuth(req)
    const user = await db.query.users.findFirst({
      where: eq(users.id, auth.userId),
      columns: { id: true, email: true, userType: true },
    })
    if (!user) return NextResponse.json({ error: "not found" }, { status: 404 })
    return NextResponse.json({ user: { userId: user.id, email: user.email, userType: user.userType } })
  } catch {
    return NextResponse.json({ error: "invalid token" }, { status: 401 })
  }
}
