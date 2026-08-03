/**
 * iOS home-screen icon, generated at build time.
 *
 * Apple only accepts PNG for `apple-touch-icon`, so the SVG favicon can't do
 * double duty here. `ImageResponse` ships with Next, so this costs no new
 * dependency and no checked-in binary.
 */

import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(145deg, #0b1220 0%, #05080f 100%)",
        }}
      >
        <div
          style={{
            fontSize: 104,
            fontWeight: 800,
            letterSpacing: -4,
            // The gradient text trick needs an explicit transparent fill.
            backgroundImage: "linear-gradient(160deg, #8fc9ff, #2b6fc4)",
            backgroundClip: "text",
            color: "transparent",
          }}
        >
          N
        </div>
      </div>
    ),
    size,
  );
}
