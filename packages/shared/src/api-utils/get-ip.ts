type FetchLikeHeaders = { get(name: string): string | null };
type NodeLikeHeaders = Record<string, string | string[] | undefined>;
type HeadersHolder = { headers: FetchLikeHeaders | NodeLikeHeaders };

function readHeader(req: HeadersHolder, name: string): string | null {
  const h = req.headers;
  if (typeof (h as FetchLikeHeaders).get === "function") {
    return (h as FetchLikeHeaders).get(name);
  }
  const lower = name.toLowerCase();
  const value = (h as NodeLikeHeaders)[lower];
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

/**
 * Client IP for rate limiting / audit. Prefer the first address in
 * `x-forwarded-for` (original client when behind a trusted proxy).
 * Configure your proxy to strip client-supplied spoofed headers.
 *
 * Accepts both Web `Request`/`NextRequest` (Headers.get) and Node/Express
 * `IncomingMessage` (plain header dictionary).
 */
export function getIp(req: HeadersHolder): string {
  const forwarded = readHeader(req, "x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  const realIp = readHeader(req, "x-real-ip")?.trim();
  if (realIp) return realIp;
  return "unknown";
}
