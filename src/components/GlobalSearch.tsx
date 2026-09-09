"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Search } from "lucide-react";

/**
 * Navigates to `/search?q=...` on submit — the actual matching happens
 * server-side on that page (it needs the latest slate loaded, which this
 * component has no business fetching). Rendered twice: a compact pill in
 * `Nav` (desktop only — the tab bar carries a plain "Search" tab on mobile
 * instead, there being no room for an inline input there) and full-width at
 * the top of the `/search` page itself, so a query can be typed or refined
 * from wherever the tab bar sent you.
 */
export function GlobalSearch({
  variant = "nav",
}: {
  variant?: "nav" | "page";
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [value, setValue] = useState(params.get("q") ?? "");

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const q = value.trim();
    router.push(q ? `/search?q=${encodeURIComponent(q)}` : "/search");
  };

  return (
    <form
      onSubmit={submit}
      className={
        variant === "nav"
          ? "hidden shrink-0 lg:block"
          : "w-full"
      }
    >
      <label className="sr-only" htmlFor={`global-search-${variant}`}>
        Search players and games
      </label>
      <div className="relative">
        <Search
          size={variant === "nav" ? 14 : 18}
          className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-[var(--ink-mute)]"
        />
        <input
          id={`global-search-${variant}`}
          type="search"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder="Search players, games..."
          autoFocus={variant === "page"}
          className={
            variant === "nav"
              ? "numeric min-h-[36px] w-40 rounded-[var(--radius-pill)] border border-[var(--border)] bg-[var(--obsidian-3)] pl-8 pr-3 text-xs text-[var(--ink)] outline-none focus:border-[var(--gold)] focus:w-56 transition-[width]"
              : "min-h-[48px] w-full rounded-[var(--radius)] border border-[var(--border)] bg-[var(--obsidian-3)] pl-10 pr-3 text-sm text-[var(--ink)] outline-none focus:border-[var(--gold)]"
          }
        />
      </div>
    </form>
  );
}
