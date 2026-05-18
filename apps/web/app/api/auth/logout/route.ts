import { clearTokenCookie } from "@walty/shared/auth/cookie"

export async function POST() {
  return new Response(JSON.stringify({ ok: true }), {
    headers: {
      "Content-Type": "application/json",
      "Set-Cookie": clearTokenCookie(),
    },
  })
}
