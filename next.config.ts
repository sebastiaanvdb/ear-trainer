import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  output: 'standalone', // Optimized for Docker deployment
};

export default nextConfig;
