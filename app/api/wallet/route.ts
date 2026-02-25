import { NextResponse } from "next/server"
import jwt from "jsonwebtoken"
import { db } from "@/server/db"
import { addresses } from "@/server/db/schema"

export async function POST(req: Request) {
  const auth = req.headers.get("authorization")

  if (!auth) {
    return NextResponse.json({ error: "no token" }, { status: 401 })
  }

  const token = auth.split(" ")[1]

  const { userId } = jwt.verify(token, process.env.JWT_SECRET!) as any

  const { address } = await req.json()

  await db.insert(addresses).values({
    userId: String(userId),
    address,
  })

  return NextResponse.json({ ok: true })
}