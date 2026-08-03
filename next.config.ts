import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The seed is read at runtime through a path built from `process.cwd()`,
  // which Next's static tracing cannot see. Without this the `data/` directory
  // is left out of the serverless bundle and every deployed page renders its
  // empty state even though the files are committed.
  outputFileTracingIncludes: {
    "/": ["./data/**"],
    "/parlay": ["./data/**"],
    "/tracker": ["./data/**"],
    "/backtest": ["./data/**"],
    "/prop/[propId]": ["./data/**"],
    "/api/bets": ["./data/**"],
    "/api/bets/settle": ["./data/**"],
  },
  images: {
    remotePatterns: [
      // nflverse player headshots are served from these hosts.
      { protocol: "https", hostname: "static.www.nfl.com" },
      { protocol: "https", hostname: "a.espncdn.com" },
    ],
  },
};

export default nextConfig;
