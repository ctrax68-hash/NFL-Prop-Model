/**
 * iOS "Add to Home Screen" launch splash screens.
 *
 * Android gets a splash screen for free — Chrome builds one from the
 * manifest's icon/background_color/name. Safari has no such thing: it wants
 * an exact-pixel-match PNG per device, picked via `<link
 * rel="apple-touch-startup-image" media="...">` in `<head>` (added by hand in
 * `layout.tsx` — there is no Metadata API or file convention for this, per
 * Next's own docs on the metadata the API doesn't cover). This route renders
 * one on demand per size instead of checking in a dozen static PNGs.
 *
 * `dims` is restricted to an allowlist, not parsed as arbitrary WxH — this is
 * a public GET route, and an open-ended width/height would let anyone use it
 * as a free image-rendering service for whatever size they ask for.
 */

import { ImageResponse } from "next/og";
import { NextResponse } from "next/server";
import { helmetDataUri } from "@/lib/brandAsset";

/** Every size actually linked from `layout.tsx`, keep the two in sync. */
const ALLOWED_SIZES = new Set([
  "1320x2868", // iPhone 17 Pro Max, 16 Pro Max
  "1260x2736", // iPhone Air
  "1206x2622", // iPhone 17 Pro, 17, 16 Pro
  "1290x2796", // iPhone 16 Plus, 15 Plus, 15/14 Pro Max
  "1284x2778", // iPhone 14/13 Pro Max, 12 Pro Max
  "1179x2556", // iPhone 16/15 Pro, 16/15, 14 Pro
  "1170x2532", // iPhone 14, 13 Pro, 13, 12 Pro, 12
  "1125x2436", // iPhone 13/12 mini, 11 Pro, XS, X
  "1242x2688", // iPhone 11 Pro Max, XS Max
  "828x1792", // iPhone 11, XR
  "750x1334", // iPhone SE (2nd/3rd gen), 8, 7, 6s
]);

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ dims: string }> },
): Promise<Response> {
  const { dims } = await params;
  if (!ALLOWED_SIZES.has(dims)) {
    return NextResponse.json({ error: "Unknown splash size." }, { status: 404 });
  }

  const [width, height] = dims.split("x").map(Number);
  // Scale the mark off the shorter side so it reads the same proportionally
  // across a small phone and a large one, not just the same fixed pixels.
  const markSize = Math.round(Math.min(width, height) * 0.28);
  const wordmarkSize = Math.round(markSize * 0.32);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: Math.round(markSize * 0.22),
          background: "linear-gradient(145deg, #0b1220 0%, #05080f 100%)",
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={helmetDataUri()} width={markSize} height={markSize} alt="" />
        <div
          style={{
            display: "flex",
            fontSize: wordmarkSize,
            fontWeight: 800,
            letterSpacing: wordmarkSize * 0.14,
            backgroundImage: "linear-gradient(180deg, #8fc9ff, #2b6fc4)",
            backgroundClip: "text",
            color: "transparent",
          }}
        >
          NFL EDGE
        </div>
      </div>
    ),
    { width, height },
  );
}
