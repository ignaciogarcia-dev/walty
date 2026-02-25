import { NextRequest, NextResponse } from "next/server"
import { eq } from "drizzle-orm"
import { db } from "@/server/db"
import { addresses } from "@/server/db/schema"
import { requireAuth } from "@/lib/auth"

export async function GET(req: NextRequest) {
  try {
    const { userId } = requireAuth(req)
    const result = await db
      .select()
      .from(addresses)
      .where(eq(addresses.userId, String(userId)))
    return NextResponse.json({ addresses: result })
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
}
