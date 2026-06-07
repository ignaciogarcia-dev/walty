import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Builds the connect-src additions for the API origin the MPC socket dials.
 * Returns ` <http-origin> <ws-origin>` (leading space) so it appends cleanly to
 * a connect-src list, or "" when the base URL is unset/unparseable (same-origin
 * deploy — 'self' already covers it). socket.io upgrades http→ws on the same
 * origin, so both schemes must be allowed.
 */
function mpcSocketConnectSrc(apiBaseUrl: string | undefined): string {
  if (!apiBaseUrl) return "";
  try {
    const { protocol, host } = new URL(apiBaseUrl);
    const wsScheme = protocol === "https:" ? "wss:" : "ws:";
    return ` ${protocol}//${host} ${wsScheme}//${host}`;
  } catch {
    console.error("[proxy] NEXT_PUBLIC_API_BASE_URL is not a valid URL:", apiBaseUrl);
    return "";
  }
}

function buildCsp(nonce: string, isDev: boolean, apiConnectSrc: string): string {
  return isDev
    ? [
        `default-src 'self'`,
        `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' 'unsafe-eval' 'wasm-unsafe-eval'`,
        `style-src 'self' 'unsafe-inline'`,
        `img-src 'self' data: https://assets.coingecko.com https://coin-images.coingecko.com https://static.coingecko.com`,
        `connect-src 'self' https://*.alchemy.com https://rpc.ankr.com https://ethereum.publicnode.com https://polygon-bor.publicnode.com https://arb1.arbitrum.io https://mainnet.base.org https://mainnet.optimism.io https://prod.spline.design ws://localhost:* http://localhost:* ws://127.0.0.1:* http://127.0.0.1:*${apiConnectSrc}`,
        `object-src 'none'`,
        `base-uri 'self'`,
        `frame-ancestors 'none'`,
      ].join("; ")
    : [
        `default-src 'self'`,
        `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' 'wasm-unsafe-eval'`,
        `style-src 'self' 'unsafe-inline'`,
        `img-src 'self' data: https://assets.coingecko.com https://coin-images.coingecko.com https://static.coingecko.com`,
        `connect-src 'self' https://*.alchemy.com https://rpc.ankr.com https://ethereum.publicnode.com https://polygon-bor.publicnode.com https://arb1.arbitrum.io https://mainnet.base.org https://mainnet.optimism.io https://prod.spline.design${apiConnectSrc}`,
        `object-src 'none'`,
        `base-uri 'self'`,
        `frame-ancestors 'none'`,
        `upgrade-insecure-requests`,
      ].join("; ");
}

function applySecurityHeaders(response: NextResponse, csp: string): void {
  response.headers.set("Content-Security-Policy", csp);
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("X-Content-Type-Options", "nosniff");
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hasToken = request.cookies.has("token");

  // Relax CSP in development mode for hot-reload
  const isDev = process.env.NODE_ENV === "development";

  // The MPC client opens a socket.io connection DIRECTLY to the API origin
  // (NEXT_PUBLIC_API_BASE_URL), not through the /api rewrite — so that origin,
  // including its ws(s):// scheme, must be in connect-src or the browser blocks
  // the DKG/signing socket. When unset, the API is same-origin ('self' covers it).
  const apiConnectSrc = mpcSocketConnectSrc(process.env.NEXT_PUBLIC_API_BASE_URL);

  // /, /pay/* and /join/* are public — allow access without redirect but still
  // apply CSP so payment pages and invite links are protected against XSS.
  if (
    pathname === "/" ||
    pathname.startsWith("/pay/") ||
    pathname.startsWith("/join/")
  ) {
    const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set("x-nonce", nonce);
    const response = NextResponse.next({ request: { headers: requestHeaders } });
    applySecurityHeaders(response, buildCsp(nonce, isDev, apiConnectSrc));
    return response;
  }

  // Legacy /login URL — keep compatibility without a dedicated page.
  if (pathname === "/login") {
    return NextResponse.redirect(
      new URL(hasToken ? "/dashboard" : "/onboarding/login", request.url),
    );
  }
  if (pathname.startsWith("/dashboard") && !hasToken) {
    return NextResponse.redirect(new URL("/onboarding", request.url));
  }

  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);

  const response = NextResponse.next({
    request: { headers: requestHeaders },
  });

  applySecurityHeaders(response, buildCsp(nonce, isDev, apiConnectSrc));

  return response;
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
};
