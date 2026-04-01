import { NextResponse } from "next/server"

// This endpoint has been replaced by the backend reconciler at
// /api/internal/tx/scan-incoming, which scans all wallets in a single
// getLogs call per token instead of one call per wallet per user.
export function POST() {
  return NextResponse.json(
    { error: "This endpoint is no longer available. Incoming transfers are reconciled server-side." },
    { status: 410 },
  )
}
