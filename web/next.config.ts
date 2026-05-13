import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@home/shared"],
  async rewrites() {
    // En prod: BACKEND_URL = http://home_assistant:3000 (red Docker interna).
    // En dev:  por defecto al backend local en 3000.
    const backend = process.env.BACKEND_URL ?? "http://localhost:3000";
    return [
      { source: "/api/:path*", destination: `${backend}/api/:path*` },
    ];
  },
};

export default nextConfig;
