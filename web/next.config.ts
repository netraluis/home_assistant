import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // El paquete @home/shared se distribuye como TypeScript sin compilar.
  transpilePackages: ["@home/shared"],
};

export default nextConfig;
