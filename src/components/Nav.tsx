"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense } from "react";
import clsx from "clsx";

import { SlatePicker } from "./SlatePicker";
import type { SlateSummary } from "@/lib/pipeline/types";

const LINKS = [
  { href: "/", label: "Board" },
  { href: "/tracker", label: "Tracker" },
  { href: "/backtest", label: "Backtest" },
];

export function Nav({ slates }: { slates: SlateSummary[] }) {
  const pathname = usePathname();

  return (
    <header className="chrome sticky top-0 z-30 border-b border-[var(--border)]">
      {/* Gold filament along the bottom edge. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 h-px"
        style={{
          background:
            "linear-gradient(90deg, transparent, rgba(255,194,75,0.55), transparent)",
        }}
      />

      <div className="mx-auto flex max-w-6xl items-center gap-2 px-3 py-2.5 sm:gap-3 sm:px-4">
        <Link href="/" className="tap flex shrink-0 items-center gap-2">
          <span
            aria-hidden
            className="grid size-7 place-items-center rounded-[var(--radius-sm)] text-[11px] font-black text-[#04101f]"
            style={{
              background:
                "linear-gradient(145deg, var(--gold-bright), var(--bronze))",
              boxShadow: "var(--glow-gold-sm)",
            }}
          >
            N
          </span>
          <span
            className="text-sm font-black tracking-[0.14em]"
            style={{
              background:
                "linear-gradient(180deg, var(--gold-bright), var(--bronze))",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
            }}
          >
            NFL EDGE
          </span>
        </Link>

        <nav className="hidden shrink-0 items-center gap-0.5 lg:flex lg:gap-1">
          {LINKS.map((link) => {
            const active =
              link.href === "/"
                ? pathname === "/"
                : pathname.startsWith(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={active ? "page" : undefined}
                className={clsx(
                  "relative flex min-h-[40px] items-center px-2 text-xs font-semibold transition-colors sm:px-3",
                  active
                    ? "text-[var(--gold)]"
                    : "text-[var(--ink-mute)] hover:text-[var(--ink)]",
                )}
              >
                {link.label}
                {active ? (
                  <span
                    aria-hidden
                    className="absolute inset-x-1.5 -bottom-[9px] h-[2px] rounded-full bg-[var(--gold)]"
                    style={{ boxShadow: "var(--glow-gold-sm)" }}
                  />
                ) : null}
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto flex min-w-0 items-center gap-2">
          {/* The picker reads the URL, and `useSearchParams` needs a boundary
              so the statically prerendered 404 can still build. */}
          <Suspense fallback={null}>
            <SlatePicker slates={slates} />
          </Suspense>
        </div>
      </div>
    </header>
  );
}
