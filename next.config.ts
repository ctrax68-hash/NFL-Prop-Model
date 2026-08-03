import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      // nflverse player headshots are served from these hosts.
      { protocol: "https", hostname: "static.www.nfl.com" },
      { protocol: "https", hostname: "a.espncdn.com" },
    ],
  },
};

export default nextConfig;
