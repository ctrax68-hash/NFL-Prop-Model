/**
 * iOS home-screen icon, generated at build time.
 *
 * Apple only accepts PNG for `apple-touch-icon`, so the SVG favicon can't do
 * double duty here. `ImageResponse` ships with Next, so this costs no new
 * dependency and no checked-in binary. Same football mark as `icon.svg` and
 * `FootballMark.tsx` — kept in sync by hand since this file's rendering
 * pipeline (Satori, via `ImageResponse`) can't import a React component that
 * itself isn't Satori-compatible, and can't load an external SVG file either.
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
        <svg width="132" height="132" viewBox="0 0 64 64">
          <defs>
            <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#8fc9ff" />
              <stop offset="1" stopColor="#2b6fc4" />
            </linearGradient>
          </defs>
          <g transform="rotate(-28 32 32)">
            <ellipse cx={32} cy={32} rx={24} ry={12.4} fill="url(#g)" />
            <path
              d="M11 32 Q32 24 53 32"
              fill="none"
              stroke="#0b1220"
              strokeWidth={1.1}
              opacity={0.35}
            />
            <path
              d="M11 32 Q32 40 53 32"
              fill="none"
              stroke="#0b1220"
              strokeWidth={1.1}
              opacity={0.35}
            />
            <line x1={25} y1={32} x2={39} y2={32} stroke="#eaf1fb" strokeWidth={2.1} strokeLinecap="round" />
            <line x1={27.8} y1={28} x2={27.8} y2={36} stroke="#eaf1fb" strokeWidth={1.7} strokeLinecap="round" />
            <line x1={30.6} y1={28} x2={30.6} y2={36} stroke="#eaf1fb" strokeWidth={1.7} strokeLinecap="round" />
            <line x1={33.4} y1={28} x2={33.4} y2={36} stroke="#eaf1fb" strokeWidth={1.7} strokeLinecap="round" />
            <line x1={36.2} y1={28} x2={36.2} y2={36} stroke="#eaf1fb" strokeWidth={1.7} strokeLinecap="round" />
          </g>
        </svg>
      </div>
    ),
    size,
  );
}
