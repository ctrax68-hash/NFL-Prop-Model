import type { Metadata, Viewport } from "next";

import "./globals.css";
import { Aurora } from "@/components/Aurora";
import { BetSlipProvider } from "@/components/BetSlipProvider";
import { BetSlip } from "@/components/BetSlip";
import { Nav } from "@/components/Nav";
import { TabBar } from "@/components/TabBar";
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

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const slates = await listSlates();
  const current = slates[0]
    ? { season: slates[0].season, week: slates[0].week }
    : null;

  return (
    <html lang="en">
      <body className="min-h-dvh">
        <Aurora />
        <BetSlipProvider>
          <Nav slates={slates} current={current} />
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
