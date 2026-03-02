import { NextRequest, NextResponse } from "next/server"
import bcrypt from "bcrypt"
import jwt from "jsonwebtoken"
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

  if (!email?.includes("@") || !password || password.length < 8) {
    return NextResponse.json({ error: "Email inválido o password menor a 8 caracteres" }, { status: 400 })
  }

  const hash = await bcrypt.hash(password, 10)

  let inserted
  try {
    inserted = await db.insert(users).values({ email, passwordHash: hash }).returning()
  } catch {
    return NextResponse.json({ error: "Email already in use" }, { status: 409 })
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
