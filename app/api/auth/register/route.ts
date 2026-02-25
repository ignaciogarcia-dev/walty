import { NextResponse } from "next/server"
import bcrypt from "bcrypt"
import { db } from "@/server/db"
import { users } from "@/server/db/schema"

export async function POST(req: Request) {
  const { email, password } = await req.json()

  const hash = await bcrypt.hash(password, 10)

  await db.insert(users).values({
    email,
    passwordHash: hash,
  })

  return NextResponse.json({ ok: true })
}