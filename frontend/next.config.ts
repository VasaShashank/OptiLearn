import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Linting runs as its own CI step (npm run lint)
  eslint: {
    ignoreDuringBuilds: true,
  },
  // The Docker image ships only the minimal standalone server; local `next start` keeps the default
  output: process.env.NEXT_OUTPUT_STANDALONE === "1" ? "standalone" : undefined,
};

export default nextConfig;
