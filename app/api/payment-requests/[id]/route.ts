import { NextRequest, NextResponse } from "next/server"
import { db } from "@/server/db"
import { paymentRequests } from "@/server/db/schema"
import { eq } from "drizzle-orm"
import { toPaymentRequestView } from "@/lib/payments/paymentRequests"

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const request = await db.query.paymentRequests.findFirst({
    where: eq(paymentRequests.id, id),
  })

  if (!request) {
    return NextResponse.json({ error: "not found" }, { status: 404 })
  }

  return NextResponse.json(toPaymentRequestView(request))
}
