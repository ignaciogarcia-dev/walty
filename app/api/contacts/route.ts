import { NextRequest, NextResponse } from "next/server"
import { eq, and } from "drizzle-orm"
import { db } from "@/server/db"
import { contacts } from "@/server/db/schema"
import { requireAuth } from "@/lib/auth"

// GET /api/contacts — list caller's contacts
export async function GET(req: NextRequest) {
  try {
    const { userId } = requireAuth(req)
    const rows = await db
      .select()
      .from(contacts)
      .where(eq(contacts.userId, userId))
    return NextResponse.json(rows)
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
}

// POST /api/contacts — add a contact
export async function POST(req: NextRequest) {
  try {
    const { userId } = requireAuth(req)
    const { name, address } = await req.json()

    if (!name || !address) {
      return NextResponse.json({ error: "Missing fields" }, { status: 400 })
    }

    const [row] = await db
      .insert(contacts)
      .values({ userId, name, address })
      .returning()

    return NextResponse.json(row)
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
}

// DELETE /api/contacts — remove a contact (id in body)
export async function DELETE(req: NextRequest) {
  try {
    const { userId } = requireAuth(req)
    const { id } = await req.json()

    if (!id) {
      return NextResponse.json({ error: "Missing id" }, { status: 400 })
    }

    await db
      .delete(contacts)
      .where(and(eq(contacts.id, id), eq(contacts.userId, userId)))

    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
}
