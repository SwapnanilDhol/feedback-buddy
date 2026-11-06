import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Every page is private, per-request data behind a session: plain dynamic
  // rendering is the right model here, not the static-shell cache.
  cacheComponents: false,
  images: {
    remotePatterns: [{ protocol: "https", hostname: "*.mzstatic.com" }],
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
