import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  const hasToken = request.cookies.has("token")

  if (pathname === "/") {
    return NextResponse.redirect(new URL(hasToken ? "/dashboard" : "/onboarding", request.url))
  }
  // Legacy /login — redirect to onboarding
  if (pathname === "/login") {
    return NextResponse.redirect(new URL(hasToken ? "/dashboard" : "/onboarding", request.url))
  }
  if (pathname.startsWith("/dashboard") && !hasToken) {
    return NextResponse.redirect(new URL("/onboarding", request.url))
  }

  const nonce = Buffer.from(crypto.randomUUID()).toString("base64")

  // Relax CSP in development mode for hot-reload
  const isDev = process.env.NODE_ENV === "development"
  
  const csp = isDev
    ? [
        `default-src 'self'`,
        `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' 'unsafe-eval'`, // 'unsafe-eval' needed for Next.js dev
        `style-src 'self' 'unsafe-inline'`,
        `img-src 'self' data: https://assets.coingecko.com https://coin-images.coingecko.com https://static.coingecko.com`,
        `connect-src 'self' https://*.alchemy.com https://rpc.ankr.com https://ethereum.publicnode.com https://arb1.arbitrum.io https://mainnet.base.org https://mainnet.optimism.io https://polygon-rpc.com ws://localhost:* http://localhost:*`, // WebSocket for HMR
        `object-src 'none'`,
        `base-uri 'self'`,
        `frame-ancestors 'none'`,
      ].join("; ")
    : [
        `default-src 'self'`,
        `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,
        `style-src 'self' 'unsafe-inline'`,
        `img-src 'self' data: https://assets.coingecko.com https://coin-images.coingecko.com https://static.coingecko.com`,
        `connect-src 'self' https://*.alchemy.com https://rpc.ankr.com https://ethereum.publicnode.com https://arb1.arbitrum.io https://mainnet.base.org https://mainnet.optimism.io https://polygon-rpc.com`,
        `object-src 'none'`,
        `base-uri 'self'`,
        `frame-ancestors 'none'`,
      ].join("; ")

  const requestHeaders = new Headers(request.headers)
  requestHeaders.set("x-nonce", nonce)

  const response = NextResponse.next({
    request: { headers: requestHeaders },
  })

  response.headers.set("Content-Security-Policy", csp)
  response.headers.set("X-Frame-Options", "DENY")
  response.headers.set("X-Content-Type-Options", "nosniff")

  return response
}

export const config = {
  matcher: [
    {
      source: "/((?!_next/static|_next/image|favicon.ico).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
}
