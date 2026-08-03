import type { Metadata, Viewport } from "next";

import "./globals.css";
import { BetSlipProvider } from "@/components/BetSlipProvider";
import { BetSlip } from "@/components/BetSlip";
import { Nav } from "@/components/Nav";
import { listSlates } from "@/lib/data";

export const metadata: Metadata = {
  title: "NFL Prop Model",
  description:
    "Projection, pricing and fractional-Kelly staking for NFL player props.",
};

export const viewport: Viewport = {
  themeColor: "#0a0b0e",
  width: "device-width",
  initialScale: 1,
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
    <html lang="en" data-theme="dark" suppressHydrationWarning>
      <body className="min-h-dvh bg-[var(--surface-0)]">
        <BetSlipProvider>
          <Nav slates={slates} current={current} />
          {/* Bottom padding clears the fixed bet slip bar. */}
          <main className="mx-auto max-w-6xl px-4 pt-4 pb-28">{children}</main>
          <BetSlip />
        </BetSlipProvider>
      </body>
    </html>
  );
}
