import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  outputFileTracingIncludes: {
    '/api/assistant': ['./data/rag/corpus.json', './data/rag/index.json'],
  },
};

export default nextConfig;
