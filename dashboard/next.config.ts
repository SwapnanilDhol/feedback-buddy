import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Every page is private, per-request data behind a session: plain dynamic
  // rendering is the right model here, not the static-shell cache.
  cacheComponents: false,
  experimental: {
    // Keep visited dynamic pages in the client router cache so Back/Forward
    // and recent links restore instantly instead of refetching with skeletons.
    staleTimes: { dynamic: 60, static: 300 },
  },
  // Plain <img> everywhere; the Vercel image optimizer is never used (it is metered).
  images: { unoptimized: true },
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
