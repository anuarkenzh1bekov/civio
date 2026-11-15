import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // A self-contained server for the container image (Cloud Run).
  output: "standalone",
  serverExternalPackages: ["@google-cloud/firestore"],
  outputFileTracingIncludes: {
    '/api/assistant': ['./data/rag/corpus.json', './data/rag/index.json'],
  },
  images: { qualities: [75, 90] },
  experimental: { optimizePackageImports: ["@astryxdesign/core"] },
};

export default nextConfig;
