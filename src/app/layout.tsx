import type { Metadata, Viewport } from "next";

import "./globals.css";
import { Aurora } from "@/components/Aurora";
import { BetSlipProvider } from "@/components/BetSlipProvider";
import { BetSlip } from "@/components/BetSlip";
import { Nav } from "@/components/Nav";
import { SplashScreen } from "@/components/SplashScreen";
import { TabBar } from "@/components/TabBar";
import { getCurrentUser } from "@/lib/auth";
import { listSlates } from "@/lib/data";

export const metadata: Metadata = {
  title: "NFL Edge — Prop Model",
  description:
    "Projection, pricing and fractional-Kelly staking for NFL player props.",
  applicationName: "NFL Edge",
  // Launched from the iOS home screen this runs without Safari's chrome, with
  // a dark status bar that blends into the page instead of banding against it.
  appleWebApp: {
    capable: true,
    title: "NFL Edge",
    statusBarStyle: "black-translucent",
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: "#05080f",
  width: "device-width",
  initialScale: 1,
  // Let content sit under the notch/home indicator; components opt back in
  // with the safe-area utilities.
  viewportFit: "cover",
  maximumScale: 5,
};

/**
 * iOS "Add to Home Screen" splash screens.
 *
 * Chrome builds Android's version for free from the manifest; Safari has no
 * such thing and needs one exact-pixel PNG per device, selected by matching
 * `media` against `device-width`/`device-height`/pixel ratio. There is no
 * Metadata API or file convention for this (per Next's own docs), hence the
 * manual `<link>` tags below rather than the `metadata` export. Images are
 * rendered on demand by `src/app/splash/[dims]/route.tsx`; keep its
 * `ALLOWED_SIZES` allowlist in sync with this list.
 */
const SPLASH_SIZES = [
  { dims: "1290x2796", width: 430, height: 932, ratio: 3 }, // 16/15/14 Pro Max
  { dims: "1284x2778", width: 428, height: 926, ratio: 3 }, // 14/13/12 Pro Max, 12 Pro Max
  { dims: "1179x2556", width: 393, height: 852, ratio: 3 }, // 16/15 Pro, 16/15, 14 Pro
  { dims: "1170x2532", width: 390, height: 844, ratio: 3 }, // 14, 13 Pro, 13, 12 Pro, 12
  { dims: "1125x2436", width: 375, height: 812, ratio: 3 }, // 13/12 mini, 11 Pro, XS, X
  { dims: "1242x2688", width: 414, height: 896, ratio: 3 }, // 11 Pro Max, XS Max
  { dims: "828x1792", width: 414, height: 896, ratio: 2 }, // 11, XR
  { dims: "750x1334", width: 375, height: 667, ratio: 2 }, // SE (2nd/3rd gen), 8, 7, 6s
] as const;

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [slates, user] = await Promise.all([listSlates(), getCurrentUser()]);

  return (
    <html lang="en">
      <head>
        {SPLASH_SIZES.map(({ dims, width, height, ratio }) => (
          <link
            key={dims}
            rel="apple-touch-startup-image"
            href={`/splash/${dims}`}
            media={`(device-width: ${width}px) and (device-height: ${height}px) and (-webkit-device-pixel-ratio: ${ratio}) and (orientation: portrait)`}
          />
        ))}
      </head>
      <body className="min-h-dvh">
        <SplashScreen />
        <Aurora />
        <BetSlipProvider>
          <Nav slates={slates} user={user} />
          {/* Bottom padding clears the tab bar and the slip bar. */}
          <main className="mx-auto max-w-6xl px-3 pt-3 pb-36 sm:px-4 lg:pb-32">
            {children}
          </main>
          <TabBar />
          <BetSlip />
        </BetSlipProvider>
      </body>
    </html>
  );
}
