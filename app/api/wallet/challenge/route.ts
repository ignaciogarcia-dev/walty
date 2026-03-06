import crypto from "crypto"
import { NextRequest, NextResponse } from "next/server"
import { requireAuth } from "@/lib/auth"

export async function GET(req: NextRequest) {
  try {
    const { userId } = requireAuth(req)

    const pepper = process.env.SERVER_PEPPER
    if (!pepper) {
      return NextResponse.json({ error: "Server misconfigured" }, { status: 500 })
    }

    const challenge = crypto
      .createHmac("sha256", pepper)
      .update(userId.toString())
      .digest("hex")

    return NextResponse.json({ challenge })
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
}
