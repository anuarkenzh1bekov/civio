import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  images: { qualities: [75, 90] },
  experimental: { optimizePackageImports: ["@astryxdesign/core"] },
};

export default nextConfig;
