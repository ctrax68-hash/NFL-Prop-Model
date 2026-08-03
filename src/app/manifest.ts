/**
 * Web app manifest.
 *
 * This is what makes "Add to Home screen" on Android produce a real app entry —
 * own icon, own name, and a standalone window with no browser chrome, which is
 * the whole point of a phone-first build.
 */

import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "NFL Edge — Prop Model",
    short_name: "NFL Edge",
    description:
      "Projection, pricing and fractional-Kelly staking for NFL player props.",
    start_url: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#05080f",
    theme_color: "#05080f",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
      { src: "/apple-icon", sizes: "180x180", type: "image/png" },
    ],
  };
}
