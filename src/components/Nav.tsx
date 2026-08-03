"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";

import type { SlateSummary } from "@/lib/pipeline/types";
import { ThemeToggle } from "./ThemeToggle";

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
    <header className="sticky top-0 z-30 border-b bg-[var(--surface-0)]/90 backdrop-blur">
      {/* min-w-0 on the flex children is what actually lets this row fit a
          390px viewport — without it the select refuses to shrink and pushes
          the header ~70px past the screen edge. */}
      <div className="mx-auto flex max-w-6xl items-center gap-2 px-3 py-3 sm:gap-3 sm:px-4">
        <Link href="/" className="flex shrink-0 items-center gap-2">
          <span
            aria-hidden
            className="grid size-7 place-items-center rounded-[var(--radius-sm)] bg-[var(--accent)] text-xs font-black text-[var(--accent-ink)]"
          >
            PM
          </span>
          <span className="hidden text-sm font-bold tracking-tight sm:block">
            Prop Model
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
                  "rounded-[var(--radius-pill)] px-2 py-1.5 text-xs font-semibold transition-colors sm:px-3",
                  active
                    ? "bg-[var(--surface-3)] text-[var(--text-primary)]"
                    : "text-[var(--text-muted)] hover:text-[var(--text-primary)]",
                )}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto flex min-w-0 items-center gap-1.5 sm:gap-2">
          {slates.length > 0 && current ? (
            <label className="sr-only" htmlFor="slate-picker">
              Select week
            </label>
          ) : null}
          {slates.length > 0 && current ? (
            <select
              id="slate-picker"
              defaultValue={`${current.season}-${current.week}`}
              onChange={(event) => {
                const [season, week] = event.target.value.split("-");
                window.location.href = `/?season=${season}&week=${week}`;
              }}
              className="tnum min-w-0 flex-1 truncate rounded-[var(--radius-pill)] border bg-[var(--surface-2)] px-2 py-1.5 text-[11px] font-medium outline-none focus:border-[var(--accent)] sm:px-3 sm:text-xs"
            >
              {slates.map((slate) => (
                <option
                  key={`${slate.season}-${slate.week}`}
                  value={`${slate.season}-${slate.week}`}
                >
                  {slate.season} · Wk {slate.week}
                </option>
              ))}
            </select>
          ) : null}
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
