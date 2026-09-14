/**
 * Won/lost/push/void colouring — the Tracker's placed-bet settlement colours
 * (`tracker/page.tsx`), shared with the Edges tab's closing-result pill
 * (`ClosingStatusPill`) so the two can't drift into different colours for
 * the same four outcomes. Tracker adds its own "pending" tint on top of this
 * (a placed bet has a state this never does — a graded prop is settled or
 * it isn't shown at all).
 */
export const SETTLEMENT_TINT: Record<"won" | "lost" | "push" | "void", string> = {
  won: "bg-[rgba(53,227,159,0.12)] text-[var(--mint)]",
  lost: "bg-[rgba(255,90,110,0.12)] text-[var(--ember)]",
  push: "bg-[var(--obsidian-3)] text-[var(--ink-dim)]",
  void: "bg-[var(--obsidian-3)] text-[var(--ink-mute)]",
};
