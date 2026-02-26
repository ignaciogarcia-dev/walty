import { NextRequest, NextResponse } from "next/server"
import { requireAuth } from "@/lib/auth"

export async function GET(req: NextRequest) {
  try {
    const user = requireAuth(req)
    return NextResponse.json({ user })
  } catch {
    return NextResponse.json({ error: "invalid token" }, { status: 401 })
  }
}