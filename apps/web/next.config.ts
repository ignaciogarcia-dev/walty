import type { NextConfig } from "next";

// Destination for the server-side /api/* rewrite. This runs inside the web
// server (Node), so it wants a server-reachable address — the Docker service
// name (http://api:4000), not the browser-facing public URL. Falls back to the
// public URL (single-origin setups) and then localhost for plain local dev.
const API_REWRITE_URL =
  process.env.API_INTERNAL_URL ??
  process.env.NEXT_PUBLIC_API_BASE_URL ??
  "http://localhost:4000";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  transpilePackages: ["@walty/db", "@walty/shared"],
  // /dashboard → /dashboard/home via redirect so we don't render a page at the
  // segment root (avoids React 19 dev performance.measure edge cases).
  async redirects() {
    return [
      {
        source: "/dashboard",
        destination: "/dashboard/home",
        permanent: false,
      },
    ];
  },
  // All /api/* traffic is served by apps/api (Express). The Next.js route
  // tree no longer ships handlers; the rewrite keeps the existing fetch
  // call sites unchanged.
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${API_REWRITE_URL}/:path*`,
      },
    ];
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "assets.coingecko.com" },
      { protocol: "https", hostname: "coin-images.coingecko.com" },
      { protocol: "https", hostname: "static.coingecko.com" },
    ],
  },
};

export default nextConfig;
