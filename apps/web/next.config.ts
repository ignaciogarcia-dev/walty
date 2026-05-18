import type { NextConfig } from "next";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";

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
        destination: `${API_BASE_URL}/:path*`,
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
