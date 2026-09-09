/**
 * iOS home-screen icon, generated at build time.
 *
 * Apple only accepts PNG for `apple-touch-icon`, so the PNG favicon
 * (`icon.png`) can't do double duty here since Next serves this route at a
 * fixed 180x180 regardless. `ImageResponse` ships with Next, so this costs
 * no new dependency — it just composites the same helmet artwork
 * (`public/brand/helmet-512.png`, via `helmetDataUri()`) onto a background.
 */

import { ImageResponse } from "next/og";
import { helmetDataUri } from "@/lib/brandAsset";

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
        <img src={helmetDataUri()} width={150} height={150} alt="" />
      </div>
    ),
    size,
  );
}
