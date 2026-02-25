import { NextResponse } from "next/server"
import { db } from "@/server/db"
import { addresses } from "@/server/db/schema"

export async function GET() {
  const result = await db.select().from(addresses)

  return NextResponse.json({ addresses: result })
}