"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Suspense, useState } from "react";
import clsx from "clsx";

import { SlatePicker } from "./SlatePicker";
import { GlobalSearch } from "./GlobalSearch";
import { useBetSlip } from "./BetSlipProvider";
import type { CurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/client";
import type { SlateSummary } from "@/lib/pipeline/types";

const LINKS = [
  { href: "/schedule", label: "Schedule" },
  { href: "/", label: "Edges" },
  { href: "/parlay", label: "Parlay" },
  { href: "/tracker", label: "Tracker" },
  { href: "/backtest", label: "Backtest" },
];

function AuthStatus({ user }: { user: CurrentUser | null }) {
  const router = useRouter();
  const slip = useBetSlip();
  const [signingOut, setSigningOut] = useState(false);

  if (!user) {
    return (
      <Link
        href="/login"
        className="tap flex min-h-[36px] shrink-0 items-center rounded-[var(--radius-pill)] border border-[var(--border)] px-3 text-xs font-semibold text-[var(--ink-dim)] transition-colors hover:border-[var(--gold)] hover:text-[var(--gold)]"
      >
        Sign in
      </Link>
    );
  }

  async function signOut() {
    setSigningOut(true);
    const supabase = createClient();
    await supabase.auth.signOut();
    // A stranger on a shared device shouldn't see a leftover queued slip
    // after the previous user signs out.
    slip.clear();
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={signOut}
      disabled={signingOut}
      title={user.email}
      className="tap flex min-h-[36px] shrink-0 items-center gap-1.5 rounded-[var(--radius-pill)] border border-[var(--border)] px-3 text-xs font-semibold text-[var(--ink-dim)] transition-colors hover:border-[var(--gold)] hover:text-[var(--gold)] disabled:opacity-60"
    >
      <span
        aria-hidden
        className="grid size-5 place-items-center rounded-full bg-[var(--obsidian-3)] text-[10px] font-black text-[var(--gold)]"
      >
        {user.email[0]?.toUpperCase()}
      </span>
      <span className="hidden sm:inline">{signingOut ? "Signing out…" : "Sign out"}</span>
    </button>
  );
}

export function Nav({
  slates,
  user,
}: {
  slates: SlateSummary[];
  user: CurrentUser | null;
}) {
  const pathname = usePathname();

  return (
    <header className="chrome pt-safe sticky top-0 z-30 border-b border-[var(--border)]">
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
            className="grid size-7 shrink-0 place-items-center rounded-[var(--radius-sm)] bg-[var(--obsidian-1)]"
            style={{ boxShadow: "var(--glow-gold-sm)" }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/helmet-badge.png" width={20} height={20} alt="" className="block" />
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
          {/* `useSearchParams` needs a boundary so the statically prerendered
              404 can still build — same reason `SlatePicker` gets one below. */}
          <Suspense fallback={null}>
            <GlobalSearch />
          </Suspense>
          {/* A trust/transparency page, not a primary destination — a quiet
              text link here rather than a LINKS entry with equal visual
              weight to Schedule/Edges. */}
          <Link
            href="/methodology"
            className="hidden shrink-0 text-xs font-medium text-[var(--ink-mute)] transition-colors hover:text-[var(--ink)] lg:inline"
          >
            Methodology
          </Link>
          {/* The picker reads the URL, and `useSearchParams` needs a boundary
              so the statically prerendered 404 can still build. */}
          <Suspense fallback={null}>
            <SlatePicker slates={slates} />
          </Suspense>
          <AuthStatus user={user} />
        </div>
      </div>
    </header>
  );
}
