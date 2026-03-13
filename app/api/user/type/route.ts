import { NextRequest, NextResponse } from "next/server"
import jwt from "jsonwebtoken"
import { requireAuth } from "@/lib/auth"
import { db } from "@/server/db"
import { users } from "@/server/db/schema"
import { eq } from "drizzle-orm"

export async function PATCH(req: NextRequest) {
  try {
    const auth = requireAuth(req)
    const { userType } = await req.json()

    if (userType !== "person" && userType !== "business") {
      return NextResponse.json({ error: "invalid userType" }, { status: 400 })
    }

    await db.update(users).set({ userType }).where(eq(users.id, auth.userId))
    
    // Re-issue JWT with new userType to keep it in sync
    const token = jwt.sign(
      { userId: auth.userId, userType },
      process.env.JWT_SECRET!,
      { expiresIn: "7d" }
    )

    return new Response(JSON.stringify({ ok: true, userType }), {
      headers: {
        "Content-Type": "application/json",
        "Set-Cookie": `token=${token}; HttpOnly; Secure; SameSite=Strict; Path=/`,
      },
    })
  } catch {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }
}
