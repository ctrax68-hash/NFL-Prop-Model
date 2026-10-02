"use client";

import { Card } from "@/components/ui";

/**
 * Route-segment error boundary — catches a throw in a page (`PropBoard`,
 * `ScheduleGameCard`, etc.) without taking down the chrome around it, since
 * this renders inside the root layout: `Nav` and `TabBar` stay up and
 * navigable. `global-error.tsx` is the separate, more minimal boundary for a
 * throw in the root layout itself, which this one can't catch.
 */
export default function Error({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <Card hud className="px-6 py-14 text-center">
      <h3 className="display text-lg font-bold text-[var(--ink)]">
        Something went wrong
      </h3>
      <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-[var(--ink-dim)]">
        This page hit an error it couldn&apos;t recover from. Try again, or
        reload if that doesn&apos;t help.
      </p>
      <div className="mt-4 flex items-center justify-center gap-2">
        <button
          type="button"
          onClick={() => reset()}
          className="tap min-h-[40px] rounded-[var(--radius-pill)] border border-[var(--border)] px-4 text-sm font-semibold text-[var(--ink)] transition-colors hover:border-[var(--gold)]"
        >
          Try again
        </button>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="tap min-h-[40px] rounded-[var(--radius-pill)] bg-[var(--gold)] px-4 text-sm font-bold text-[#04101f]"
        >
          Reload
        </button>
      </div>
    </Card>
  );
}
