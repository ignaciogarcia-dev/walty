import { NextResponse } from "next/server"

/** Liveness probe — no auth, no external deps. */
export const dynamic = "force-dynamic"

export function GET() {
  return NextResponse.json(
    { status: "ok" },
    { headers: { "Cache-Control": "no-store" } },
  )
}
