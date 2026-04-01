import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
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
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "assets.coingecko.com" },
      { protocol: "https", hostname: "coin-images.coingecko.com" },
      { protocol: "https", hostname: "static.coingecko.com" },
    ],
  },
};

export default nextConfig;
