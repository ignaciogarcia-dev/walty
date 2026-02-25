import { NextResponse } from "next/server"
import { db } from "@/server/db"
import { users } from "@/server/db/schema"

export async function GET() {
  const result = await db.select().from(users)

  return NextResponse.json({
    users: result,
  })
}