"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";

import type { SlateSummary } from "@/lib/pipeline/types";

const LINKS = [
  { href: "/", label: "Board" },
  { href: "/tracker", label: "Tracker" },
  { href: "/backtest", label: "Backtest" },
];

export function Nav({
  slates,
  current,
}: {
  slates: SlateSummary[];
  current: { season: number; week: number } | null;
}) {
  const pathname = usePathname();

  return (
    <header className="glass sticky top-0 z-30 border-b border-[var(--border)]">
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
        <Link href="/" className="flex shrink-0 items-center gap-2">
          <span
            aria-hidden
            className="grid size-7 place-items-center rounded-[var(--radius-sm)] text-[11px] font-black text-[#14100a]"
            style={{
              background:
                "linear-gradient(145deg, var(--gold-bright), var(--bronze))",
              boxShadow: "var(--glow-gold-sm)",
            }}
          >
            V
          </span>
          <span
            className="hidden text-sm font-black tracking-[0.16em] sm:block"
            style={{
              background:
                "linear-gradient(180deg, var(--gold-bright), var(--bronze))",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
            }}
          >
            VAULT
          </span>
        </Link>

        <nav className="flex shrink-0 items-center gap-0.5 sm:gap-1">
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
                  "relative px-2 py-1.5 text-xs font-semibold transition-colors sm:px-3",
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
          {slates.length > 0 && current ? (
            <>
              <label className="sr-only" htmlFor="slate-picker">
                Select week
              </label>
              <select
                id="slate-picker"
                defaultValue={`${current.season}-${current.week}`}
                onChange={(event) => {
                  const [season, week] = event.target.value.split("-");
                  window.location.href = `/?season=${season}&week=${week}`;
                }}
                className="numeric min-w-0 flex-1 truncate rounded-[var(--radius-pill)] border border-[var(--border)] bg-[rgba(32,26,36,0.7)] px-2 py-1.5 text-[11px] font-medium text-[var(--ink-dim)] outline-none focus:border-[var(--gold)] sm:px-3 sm:text-xs"
              >
                {slates.map((slate) => (
                  <option
                    key={`${slate.season}-${slate.week}`}
                    value={`${slate.season}-${slate.week}`}
                  >
                    {slate.season} · WK {slate.week}
                  </option>
                ))}
              </select>
            </>
          ) : null}
        </div>
      </div>
    </header>
  );
}
