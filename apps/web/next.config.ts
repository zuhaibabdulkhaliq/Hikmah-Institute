import type { NextConfig } from "next";
const config: NextConfig = {
  transpilePackages: ["@hikmah/api-client", "@hikmah/domain"],
  poweredByHeader: false,
  async rewrites() {
    const api = process.env.API_INTERNAL_URL ?? "http://127.0.0.1:3001";
    return [
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
