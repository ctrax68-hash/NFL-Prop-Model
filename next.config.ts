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
    // Every route below also reads the file-store fallback via
    // `getSlate()`/`listSlates()` and was missing from this list — a real
    // gap (not just a new-route risk) that predates this entry, caught
    // while adding the two newest routes it was written for.
    "/schedule": ["./data/**"],
    "/edges": ["./data/**"],
    "/search": ["./data/**"],
    "/api/watchlist": ["./data/**"],
    "/api/alerts": ["./data/**"],
    "/players/[slug]": ["./data/**"],
    "/games/[slug]": ["./data/**"],
    "/sitemap": ["./data/**"],
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
