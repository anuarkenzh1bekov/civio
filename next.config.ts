import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  outputFileTracingIncludes: {
    '/api/assistant': ['./data/rag/corpus.json', './data/rag/index.json'],
  },
  images: { qualities: [75, 90] },
  experimental: { optimizePackageImports: ["@astryxdesign/core"] },
};

export default nextConfig;
