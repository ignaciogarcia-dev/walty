import { NextRequest, NextResponse } from "next/server"
import bcrypt from "bcrypt"
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

  const hash = await bcrypt.hash(password, 10)

  await db.insert(users).values({
    email,
    passwordHash: hash,
  })

  return NextResponse.json({ ok: true })
}