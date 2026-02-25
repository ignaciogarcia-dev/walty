import { NextResponse } from "next/server"
import bcrypt from "bcrypt"
import jwt from "jsonwebtoken"
import { db } from "@/server/db"
import { users } from "@/server/db/schema"
import { eq } from "drizzle-orm"

export async function POST(req: Request) {
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

  return NextResponse.json({ token })
}