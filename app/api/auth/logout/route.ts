import { NextResponse } from "next/server"

export async function POST() {
  return new Response(JSON.stringify({ ok: true }), {
    headers: {
      "Content-Type": "application/json",
      "Set-Cookie": `token=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0`,
    },
  })
}
