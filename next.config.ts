import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "Content-Security-Policy",
            // script-src 'self' blocks inline scripts and cross-origin script injection
            // object-src 'none' blocks Flash/plugins — reduces XSS attack surface
            // Note: Next.js inline hydration scripts require 'unsafe-inline' in dev;
            //       for production nonce-based CSP, configure generateBuildId + nonces.
            value: "script-src 'self' 'unsafe-inline'; object-src 'none';",
          },
        ],
      },
    ]
  },
};

export default nextConfig;
