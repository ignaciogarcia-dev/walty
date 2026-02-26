import { NextRequest, NextResponse } from "next/server"
import bcrypt from "bcrypt"
import jwt from "jsonwebtoken"
import { db } from "@/server/db"
import { users } from "@/server/db/schema"
import { eq } from "drizzle-orm"
import { rateLimit } from "@/lib/rate-limit"

export async function POST(req: NextRequest) {
  try {
    rateLimit(req.headers.get("x-forwarded-for") ?? "unknown")
  } catch {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 })
  }

  const { email, password } = await req.json()

  const user = await db.query.users.findFirst({
    where: eq(users.email, email),
  })

  if (!user) {
    return NextResponse.json({ error: "invalid credentials" }, { status: 401 })
  }

  const valid = await bcrypt.compare(password, user.passwordHash)

  if (!valid) {
    return NextResponse.json({ error: "invalid credentials" }, { status: 401 })
  }

  const token = jwt.sign(
    { userId: user.id },
    process.env.JWT_SECRET!,
    { expiresIn: "7d" }
  )

  return new Response(JSON.stringify({ ok: true }), {
    headers: {
      "Content-Type": "application/json",
      "Set-Cookie": `token=${token}; HttpOnly; Secure; SameSite=Strict; Path=/`,
    },
  })
}
