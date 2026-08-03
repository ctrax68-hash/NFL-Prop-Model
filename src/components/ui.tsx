/** Shared presentational primitives for the betting board. */

import clsx from "clsx";
import type { ReactNode } from "react";

import { edgeTone, formatSignedPercent } from "@/lib/format";

export function Card({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={clsx(
        "rounded-[var(--radius)] border bg-[var(--surface-1)]",
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
      <div>
        <h2 className="text-sm font-semibold tracking-wide text-[var(--text-primary)] uppercase">
          {title}
        </h2>
        {hint ? (
          <p className="mt-1 text-xs text-[var(--text-muted)]">{hint}</p>
        ) : null}
      </div>
      {action}
    </div>
  );
}

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
        "tnum inline-flex items-center rounded-[var(--radius-pill)] px-2 py-0.5 text-[11px] font-semibold",
        tone === "strong" &&
          "bg-[var(--positive-dim)] text-[var(--positive)] ring-1 ring-[var(--positive)]/40",
        tone === "good" && "bg-[var(--positive-dim)] text-[var(--positive)]",
        tone === "flat" && "bg-[var(--surface-3)] text-[var(--text-secondary)]",
        tone === "bad" && "bg-[var(--surface-3)] text-[var(--text-muted)]",
        className,
      )}
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
        "shrink-0 rounded-[var(--radius-pill)] border px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-colors",
        active
          ? "border-transparent bg-[var(--accent)] text-[var(--accent-ink)]"
          : "border-[var(--border)] bg-[var(--surface-2)] text-[var(--text-secondary)] hover:border-[var(--border-strong)] hover:text-[var(--text-primary)]",
        className,
      )}
    >
      {children}
    </button>
  );
}

export function Stat({
  label,
  value,
  tone = "neutral",
  hint,
}: {
  label: string;
  value: string;
  tone?: "neutral" | "positive" | "negative";
  hint?: string;
}) {
  return (
    <div className="rounded-[var(--radius)] border bg-[var(--surface-1)] px-4 py-3">
      <div className="text-[11px] font-medium tracking-wide text-[var(--text-muted)] uppercase">
        {label}
      </div>
      <div
        className={clsx(
          "tnum mt-1 text-xl font-semibold",
          tone === "positive" && "text-[var(--positive)]",
          tone === "negative" && "text-[var(--negative)]",
          tone === "neutral" && "text-[var(--text-primary)]",
        )}
      >
        {value}
      </div>
      {hint ? (
        <div className="mt-1 text-[11px] text-[var(--text-muted)]">{hint}</div>
      ) : null}
    </div>
  );
}

/**
 * Banner shown whenever the slate was priced against synthetic lines.
 * The distinction between "this model found an edge" and "this model disagreed
 * with a line it invented" is the single most important thing for a user to
 * understand, so it is never hidden.
 */
export function SyntheticWarning({ provider }: { provider: string }) {
  return (
    <div className="rounded-[var(--radius)] border border-[var(--warning)]/35 bg-[var(--warning)]/10 px-4 py-3">
      <div className="flex items-start gap-2.5">
        <span
          aria-hidden
          className="mt-0.5 grid size-4 shrink-0 place-items-center rounded-full bg-[var(--warning)] text-[10px] font-bold text-black"
        >
          !
        </span>
        <div className="text-xs leading-relaxed text-[var(--text-secondary)]">
          <span className="font-semibold text-[var(--warning)]">
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
    <Card className="px-6 py-12 text-center">
      <h3 className="text-base font-semibold">{title}</h3>
      <p className="mx-auto mt-2 max-w-md text-sm text-[var(--text-secondary)]">
        {body}
      </p>
      {command ? (
        <code className="mt-4 inline-block rounded-[var(--radius-sm)] border bg-[var(--surface-2)] px-3 py-2 text-xs text-[var(--text-primary)]">
          {command}
        </code>
      ) : null}
    </Card>
  );
}
