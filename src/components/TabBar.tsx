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
    href: "/",
    label: "Board",
    icon: (
      <>
        <rect x="3" y="4" width="18" height="4" rx="1.5" />
        <rect x="3" y="10" width="18" height="4" rx="1.5" />
        <rect x="3" y="16" width="18" height="4" rx="1.5" />
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
                "tap relative flex flex-1 flex-col items-center justify-center gap-1 py-2 transition-colors",
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
              <span className="text-[10px] font-semibold tracking-wide">
                {tab.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
