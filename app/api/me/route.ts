import { NextResponse } from "next/server"
import jwt from "jsonwebtoken"

export async function GET(req: Request) {
  const auth = req.headers.get("authorization")

  if (!auth) {
    return NextResponse.json({ error: "no token" }, { status: 401 })
  }

  const token = auth.split(" ")[1]

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET!)

    return NextResponse.json({ user: decoded })
  } catch {
    return NextResponse.json({ error: "invalid token" }, { status: 401 })
  }
}