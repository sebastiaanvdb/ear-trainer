import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Netlify sets NETLIFY=true automatically — use static export there.
  // Locally and in Docker we use standalone (self-contained Node.js server).
  output: process.env.NETLIFY ? 'export' : 'standalone',
};

export default nextConfig;
