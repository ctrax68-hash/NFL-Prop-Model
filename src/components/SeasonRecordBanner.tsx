import type { SeasonRecord } from "@/lib/calibration/seasonRecord";
import { formatPercent, formatSignedPercent, formatSignedUnits } from "@/lib/format";
import { Card, SectionHeading, Stat } from "./ui";

/**
 * The model's record on its own recommended plays, every graded week of the
 * season folded in — see `src/lib/calibration/seasonRecord.ts` for why this
 * is computed once at pipeline time rather than on every page load, and how
 * it differs from `LiveCalibration`'s 6-week drift check.
 *
 * Renders nothing before Week 1 has graded — there's no "0-0" to show yet,
 * and an empty card at the top of the page would just be noise.
 */
export function SeasonRecordBanner({ record }: { record: SeasonRecord | undefined }) {
  if (!record) return null;

  const { record: r, weeks, propsAreReal } = record;
  const weeksLabel = weeks.length === 1 ? `WK ${weeks[0]}` : `WK ${weeks[0]}–${weeks[weeks.length - 1]}`;

  return (
    <Card className="p-4" hud>
      <SectionHeading
        title="YTD · Model Favorites"
        hint={`Every recommended pick graded so far this season (${weeksLabel}) — not just this week's board.`}
      />
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat
          label="Record"
          value={`${r.wins}-${r.losses}${r.pushes > 0 ? `-${r.pushes}` : ""}`}
          tone="plain"
        />
        <Stat
          label="Hit Rate"
          value={formatPercent(r.hitRate, 1)}
          tone={r.hitRate > 0.5 ? "mint" : r.hitRate < 0.5 ? "ember" : "plain"}
        />
        <Stat
          label="P/L"
          value={formatSignedUnits(r.unitsProfit)}
          tone={r.unitsProfit > 0 ? "mint" : r.unitsProfit < 0 ? "ember" : "plain"}
        />
        <Stat
          label="ROI"
          value={formatSignedPercent(r.roi, 1)}
          tone={r.roi > 0 ? "mint" : r.roi < 0 ? "ember" : "plain"}
        />
      </div>
      {!propsAreReal ? (
        <p className="mt-3 text-[11px] leading-relaxed text-[var(--amber)]">
          One or more graded weeks priced against synthetic lines — this record is
          circular for those weeks, not a real result against a book.
        </p>
      ) : null}
    </Card>
  );
}
