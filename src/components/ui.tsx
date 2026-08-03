/** Shared presentational primitives. */

import clsx from "clsx";
import type { ReactNode } from "react";

import { CountUp } from "./CountUp";
import { edgeTone, formatSignedPercent } from "@/lib/format";

export function Card({
  children,
  className,
  hud,
}: {
  children: ReactNode;
  className?: string;
  hud?: boolean;
}) {
  return (
    <div
      className={clsx(
        "hairline bevel glass relative rounded-[var(--radius)]",
        hud && "hud",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function SectionHeading({
  title,
  hint,
  action,
}: {
  title: string;
  hint?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-3 flex items-end justify-between gap-4">
      <div className="min-w-0">
        <h2 className="flex items-center gap-2 text-sm font-semibold tracking-[0.08em] text-[var(--ink)] uppercase">
          <span
            aria-hidden
            className="inline-block h-3 w-[2px] rounded-full bg-[var(--gold)]"
            style={{ boxShadow: "var(--glow-gold-sm)" }}
          />
          {title}
        </h2>
        {hint ? (
          <p className="mt-1 text-xs leading-relaxed text-[var(--ink-mute)]">
            {hint}
          </p>
        ) : null}
      </div>
      {action}
    </div>
  );
}

/**
 * Edge badge, tiered.
 *
 * Strong edges get a glow and a brighter fill so they separate at a glance on a
 * board of hundreds of rows. Mint rather than gold throughout — gold is chrome
 * here, and if the signal colour matched the brand colour the eye would have
 * nothing to lock onto.
 */
export function EdgeBadge({
  edge,
  className,
}: {
  edge: number;
  className?: string;
}) {
  const tone = edgeTone(edge);
  return (
    <span
      className={clsx(
        "numeric inline-flex items-center rounded-[var(--radius-pill)] px-2 py-0.5 text-[11px] font-bold",
        tone === "strong" &&
          "bg-[rgba(53,227,159,0.14)] text-[var(--mint)] ring-1 ring-[rgba(53,227,159,0.45)]",
        tone === "good" && "bg-[rgba(53,227,159,0.10)] text-[var(--mint)]",
        tone === "flat" && "bg-[var(--obsidian-3)] text-[var(--ink-dim)]",
        tone === "bad" && "bg-[var(--obsidian-3)] text-[var(--ink-mute)]",
        className,
      )}
      style={
        tone === "strong"
          ? { boxShadow: "0 0 14px rgba(53,227,159,0.28)" }
          : undefined
      }
      title={`Model edge over the de-vigged fair price: ${formatSignedPercent(edge, 2)}`}
    >
      {formatSignedPercent(edge)}
    </span>
  );
}

export function Pill({
  children,
  active,
  onClick,
  className,
}: {
  children: ReactNode;
  active?: boolean;
  onClick?: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={clsx(
        "inline-flex min-h-[40px] shrink-0 items-center rounded-[var(--radius-pill)] border px-3.5 text-xs font-medium whitespace-nowrap transition-all duration-200 active:scale-[0.97]",
        active
          ? "border-transparent bg-gradient-to-b from-[var(--gold-bright)] to-[var(--gold)] font-semibold text-[#04101f]"
          : "border-[var(--border)] bg-[rgba(32,26,36,0.6)] text-[var(--ink-dim)] hover:border-[var(--bronze)] hover:text-[var(--ink)]",
        className,
      )}
      style={active ? { boxShadow: "var(--glow-gold-sm)" } : undefined}
    >
      {children}
    </button>
  );
}

/** Hero stat tile — the number is the subject. */
export function Stat({
  label,
  value,
  numericValue,
  decimals = 0,
  prefix,
  suffix,
  tone = "gold",
  hint,
}: {
  label: string;
  value: string;
  /** When supplied, the tile animates up to this on mount instead of rendering `value`. */
  numericValue?: number;
  decimals?: number;
  prefix?: string;
  suffix?: string;
  tone?: "gold" | "mint" | "ember" | "plain";
  hint?: string;
}) {
  const color =
    tone === "mint"
      ? "var(--mint)"
      : tone === "ember"
        ? "var(--ember)"
        : tone === "plain"
          ? "var(--ink)"
          : "var(--gold)";

  return (
    <Card className="overflow-hidden px-3 py-2.5 sm:px-4 sm:py-3.5">
      <div className="eyebrow">{label}</div>
      <div
        className={clsx(
          "display mt-1 text-[21px] font-bold sm:mt-1.5 sm:text-[30px]",
          tone === "gold" && "glow-gold",
          tone === "mint" && "glow-mint",
        )}
        style={{ color }}
      >
        {numericValue !== undefined ? (
          <CountUp
            value={numericValue}
            decimals={decimals}
            prefix={prefix}
            suffix={suffix}
          />
        ) : (
          value
        )}
      </div>
      {hint ? (
        <div className="numeric mt-1 text-[11px] text-[var(--ink-mute)]">
          {hint}
        </div>
      ) : null}
    </Card>
  );
}

/**
 * Shown whenever the slate was priced against synthetic lines.
 *
 * The difference between "this model found an edge" and "this model disagreed
 * with a line it invented" is the single most important thing for a user to
 * understand here, so it is never hidden or softened.
 */
export function SyntheticWarning({ provider }: { provider: string }) {
  return (
    <div
      className="hairline relative overflow-hidden rounded-[var(--radius)] px-3 py-2.5 sm:px-4 sm:py-3"
      style={{
        background:
          "linear-gradient(100deg, rgba(255,176,32,0.12), rgba(255,176,32,0.04))",
      }}
    >
      <div className="flex items-start gap-2.5">
        <span
          aria-hidden
          className="mt-0.5 grid size-4 shrink-0 place-items-center rounded-full bg-[var(--amber)] text-[10px] font-black text-black"
        >
          !
        </span>
        <div className="text-[11px] leading-snug text-[var(--ink-dim)] sm:text-xs sm:leading-relaxed">
          <span className="font-bold text-[var(--amber)]">
            Simulated lines ({provider}).
          </span>{" "}
          These prices are generated from this model&apos;s own projections, so
          the edges below are the simulation&apos;s noise read back — not real
          betting value. Connect a sportsbook feed to measure genuine edge.
        </div>
      </div>
    </div>
  );
}

export function EmptyState({
  title,
  body,
  command,
}: {
  title: string;
  body: string;
  command?: string;
}) {
  return (
    <Card hud className="px-6 py-14 text-center">
      <h3 className="display text-lg font-bold text-[var(--ink)]">{title}</h3>
      <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-[var(--ink-dim)]">
        {body}
      </p>
      {command ? (
        <code className="numeric mt-4 inline-block rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--obsidian-1)] px-3 py-2 text-xs text-[var(--gold)]">
          {command}
        </code>
      ) : null}
    </Card>
  );
}
