import { NextRequest, NextResponse } from "next/server"
import bcrypt from "bcrypt"
import jwt from "jsonwebtoken"
import { eq } from "drizzle-orm"
import { db } from "@/server/db"
import { users } from "@/server/db/schema"
import { rateLimit } from "@/lib/rate-limit"

export async function POST(req: NextRequest) {
  try {
    rateLimit(req.headers.get("x-forwarded-for") ?? "unknown")
  } catch {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 })
  }

  const { email, password } = await req.json()
  const cleanEmail = email?.trim()

  if (!cleanEmail?.includes("@") || !password || password.length < 8) {
    return NextResponse.json({ error: "invalid-email-or-password" }, { status: 400 })
  }

  const existingUser = await db.query.users.findFirst({
    where: eq(users.email, cleanEmail),
  })

  if (existingUser) {
    return NextResponse.json({ error: "email-already-in-use" }, { status: 409 })
  }

  const hash = await bcrypt.hash(password, 10)

  let inserted
  try {
    inserted = await db.insert(users).values({ email: cleanEmail, passwordHash: hash }).returning()
  } catch (error: unknown) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "23505") {
      return NextResponse.json({ error: "email-already-in-use" }, { status: 409 })
    }

    return NextResponse.json({ error: "unexpected-error" }, { status: 500 })
  }

  const token = jwt.sign(
    { userId: inserted[0].id },
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
