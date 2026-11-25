import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Payment screenshots are sent with the booking (3 MB max, plus overhead)
    serverActions: { bodySizeLimit: '4mb' },
  },
};

export default nextConfig;
