import { NextRequest, NextResponse } from "next/server"
import { env } from "@/lib/env"
import { PAYMENT_RECONCILE_HEADER } from "@/lib/payments/config"
import { reconcilePendingPaymentRequests } from "@/lib/payments/reconcilePendingPaymentRequests"

export async function POST(req: NextRequest) {
  const providedSecret = req.headers.get(PAYMENT_RECONCILE_HEADER)

  if (providedSecret !== env.PAYMENTS_RECONCILE_SECRET) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  try {
    const result = await reconcilePendingPaymentRequests()
    return NextResponse.json({ ok: true, ...result })
  } catch (error) {
    const message = error instanceof Error ? error.message : "unexpected error"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
