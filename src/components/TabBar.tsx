"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";

import { useBetSlip } from "./BetSlipProvider";

/**
 * Bottom tab bar — the primary navigation on phones.
 *
 * This is where a native app puts navigation and where a thumb can actually
 * reach it; a top nav bar on a 6" screen is a stretch every single time. It
 * sits above the safe-area inset so it clears the iPhone home indicator, and
 * hides on large screens where the top bar takes over.
 */

const TABS = [
  {
    href: "/schedule",
    label: "Schedule",
    icon: (
      <>
        <rect x="3" y="5" width="18" height="16" rx="2" />
        <path d="M3 10h18" />
        <path d="M8 3v4" />
        <path d="M16 3v4" />
        <circle cx="9" cy="15" r="1.6" fill="currentColor" stroke="none" />
      </>
    ),
  },
  {
    href: "/",
    label: "Edges",
    icon: <path d="M13 2 4 14h6l-1 8 9-12h-6l1-8z" />,
  },
  {
    href: "/parlay",
    label: "Parlay",
    icon: (
      <>
        <rect x="5" y="8" width="8" height="8" rx="3" transform="rotate(45 9 12)" />
        <rect x="11" y="8" width="8" height="8" rx="3" transform="rotate(45 15 12)" />
      </>
    ),
  },
  {
    href: "/tracker",
    label: "Tracker",
    icon: (
      <>
        <path d="M4 18V9" />
        <path d="M10 18V5" />
        <path d="M16 18v-6" />
        <path d="M3 21h18" />
      </>
    ),
  },
  {
    href: "/backtest",
    label: "Backtest",
    icon: (
      <>
        <path d="M3 17l5-6 4 4 6-8" />
        <path d="M14 7h5v5" />
      </>
    ),
  },
  {
    href: "/search",
    label: "Search",
    icon: (
      <>
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-4.3-4.3" />
      </>
    ),
  },
];

export function TabBar() {
  const pathname = usePathname();
  const slip = useBetSlip();

  // The slip sheet takes over the bottom of the screen; stacking a tab bar
  // under it would just be two competing bars.
  const slipOpen = slip.isHydrated && slip.legs.length > 0;

  return (
    <nav
      className={clsx(
        "chrome fixed inset-x-0 bottom-0 z-30 border-t border-[var(--border)] lg:hidden",
        slipOpen && "pointer-events-none opacity-0",
      )}
      aria-hidden={slipOpen}
    >
      <div className="pb-safe flex items-stretch">
        {TABS.map((tab) => {
          const active =
            tab.href === "/"
              ? pathname === "/"
              : pathname.startsWith(tab.href);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={active ? "page" : undefined}
              className={clsx(
                "tap relative flex min-w-0 flex-1 flex-col items-center justify-center gap-1 px-0.5 py-2 transition-colors",
                active ? "text-[var(--gold)]" : "text-[var(--ink-mute)]",
              )}
            >
              {active ? (
                <span
                  aria-hidden
                  className="absolute inset-x-6 top-0 h-[2px] rounded-full bg-[var(--gold)]"
                  style={{ boxShadow: "var(--glow-gold-sm)" }}
                />
              ) : null}
              <svg
                width="21"
                height="21"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.9"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                {tab.icon}
              </svg>
              {/* Six tabs leaves ~53px per column on the smallest phones
                  still in use (320px, iPhone SE 1st-gen) — too narrow for
                  "Backtest" at the old 10px/tracking-wide size without
                  overlapping its neighbour. `truncate` is the backstop for
                  anything narrower still. */}
              <span className="w-full truncate text-center text-[9px] font-semibold">
                {tab.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
