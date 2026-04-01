import type { NextRequest } from "next/server";

/**
 * Client IP for rate limiting / audit. Prefer the first address in
 * `x-forwarded-for` (original client when behind a trusted proxy).
 * Configure your proxy to strip client-supplied spoofed headers.
 */
export function getIp(req: NextRequest): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  const realIp = req.headers.get("x-real-ip")?.trim();
  if (realIp) return realIp;
  return "unknown";
}
