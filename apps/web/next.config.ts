import type { NextConfig } from "next";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
const config: NextConfig = {
  env: {
    NEXT_PUBLIC_HIKMAH_HAS_LOGO: existsSync(
      resolve(process.cwd(), "public/hikmah_logo.png"),
    )
      ? "true"
      : "false",
  },
  transpilePackages: [
    "@hikmah/api-client",
    "@hikmah/domain",
    "@hikmah/ui-tokens",
  ],
  poweredByHeader: false,
  async rewrites() {
    const api = process.env.API_INTERNAL_URL ?? "http://127.0.0.1:3001";
    return [
      { source: "/health", destination: `${api}/health` },
      { source: "/v1/:path*", destination: `${api}/v1/:path*` },
      { source: "/api/auth/:path*", destination: `${api}/api/auth/:path*` },
    ];
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Cache-Control", value: "private, no-store" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "same-origin" },
        ],
      },
    ];
  },
};
export default config;
