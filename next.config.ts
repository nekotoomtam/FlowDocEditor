import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["wordcut", "linebreak"],
  typescript: {
    ignoreBuildErrors: process.env.FLOWDOC_REVIEW_BUILD_SKIP_NEXT_TYPECHECK === "1",
  },
};

export default nextConfig;
