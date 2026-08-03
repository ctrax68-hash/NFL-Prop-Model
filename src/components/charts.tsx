/**
 * Hand-rolled SVG charts.
 *
 * Deliberately not a charting library: these four forms are simple, and writing
 * the SVG directly gives exact control over the mark specs — 2px lines, hairline
 * recessive grid, >=8px markers, a 2px surface gap between adjacent fills, and
 * selective direct labels rather than a number on every mark.
 *
 * Series colours are the validated categorical slots (blue / orange / aqua),
 * read from CSS custom properties so they re-step for light and dark surfaces.
 */

import type { DensityPoint } from "@/lib/engine/distribution";

const AXIS = "var(--ink-mute)";
const GRID = "var(--grid)";

function niceTicks(min: number, max: number, count = 5): number[] {
  if (max <= min) return [min];
  const raw = (max - min) / count;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const step =
    [1, 2, 2.5, 5, 10].find((candidate) => candidate * magnitude >= raw)! *
    magnitude;
  const ticks: number[] = [];
  for (let t = Math.ceil(min / step) * step; t <= max + 1e-9; t += step) {
    ticks.push(Number(t.toFixed(6)));
  }
  return ticks;
}

/**
 * The modelled distribution for one prop, with the line marked and the side
 * that wins shaded.
 */
export function DistributionChart({
  points,
  line,
  projection,
  winningSide,
  discrete,
  height = 190,
}: {
  points: DensityPoint[];
  line: number;
  projection: number;
  winningSide: "over" | "under";
  discrete: boolean;
  height?: number;
}) {
  if (points.length === 0) return null;

  const width = 640;
  const padding = { top: 14, right: 14, bottom: 26, left: 14 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;

  const xMax = Math.max(points[points.length - 1].x, line * 1.15, 1);
  const yMax = Math.max(...points.map((p) => p.y)) || 1;

  const sx = (x: number) => padding.left + (x / xMax) * plotWidth;
  const sy = (y: number) => padding.top + plotHeight - (y / yMax) * plotHeight;

  const lineX = sx(line);
  const baseline = padding.top + plotHeight;

  // Split the curve at the line so each side can be filled separately.
  const winningPoints = points.filter((p) =>
    winningSide === "over" ? p.x >= line : p.x <= line,
  );

  const areaPath = (subset: DensityPoint[]) => {
    if (subset.length === 0) return "";
    const start = `M ${sx(subset[0].x)} ${baseline}`;
    const curve = subset
      .map((p) => `L ${sx(p.x)} ${sy(p.y)}`)
      .join(" ");
    return `${start} ${curve} L ${sx(subset[subset.length - 1].x)} ${baseline} Z`;
  };

  const linePath = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${sx(p.x)} ${sy(p.y)}`)
    .join(" ");

  const ticks = niceTicks(0, xMax, 5);

  return (
    <figure className="m-0">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full"
        role="img"
        aria-label={`Projected distribution centred on ${projection.toFixed(1)}, with the sportsbook line at ${line}. The ${winningSide} region is shaded.`}
      >
        <defs>
          <linearGradient id="dist-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--gold)" stopOpacity="0.55" />
            <stop offset="100%" stopColor="var(--gold)" stopOpacity="0.04" />
          </linearGradient>
          <filter id="dist-glow" x="-30%" y="-60%" width="160%" height="260%">
            <feGaussianBlur stdDeviation="3.2" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {ticks.map((tick) => (
          <line
            key={tick}
            x1={sx(tick)}
            x2={sx(tick)}
            y1={padding.top}
            y2={baseline}
            stroke={GRID}
            strokeWidth={1}
          />
        ))}
        <line
          x1={padding.left}
          x2={width - padding.right}
          y1={baseline}
          y2={baseline}
          stroke={GRID}
          strokeWidth={1}
        />

        {/* Whole distribution, recessive. */}
        <path d={areaPath(points)} fill="url(#dist-fill)" opacity={0.28} />
        {/* The side that wins, emphasised. */}
        <path d={areaPath(winningPoints)} fill="url(#dist-fill)" opacity={0.95} />

        {!discrete ? (
          <path
            d={linePath}
            fill="none"
            stroke="var(--gold)"
            strokeWidth={2}
            strokeLinejoin="round"
            filter="url(#dist-glow)"
          />
        ) : (
          points.map((p) => (
            <circle
              key={p.x}
              cx={sx(p.x)}
              cy={sy(p.y)}
              r={4}
              fill="var(--gold)"
              filter="url(#dist-glow)"
            >
              <title>{`${p.x}: ${(p.y * 100).toFixed(1)}%`}</title>
            </circle>
          ))
        )}

        {/* Sportsbook line. */}
        <line
          x1={lineX}
          x2={lineX}
          y1={padding.top - 4}
          y2={baseline}
          stroke="var(--ink)"
          strokeWidth={2}
        />
        <text
          x={lineX}
          y={padding.top - 6}
          textAnchor="middle"
          fontSize={11}
          fontWeight={700}
          fill="var(--ink)"
        >
          {line}
        </text>

        {/* Projection marker — 8px, ringed against the surface. */}
        <circle
          cx={sx(projection)}
          cy={baseline}
          r={5}
          fill="var(--azure)"
          stroke="var(--obsidian-1)"
          strokeWidth={2}
        >
          <title>{`Projection ${projection.toFixed(1)}`}</title>
        </circle>

        {ticks.map((tick) => (
          <text
            key={`label-${tick}`}
            x={sx(tick)}
            y={height - 8}
            textAnchor="middle"
            fontSize={10}
            fill={AXIS}
          >
            {tick}
          </text>
        ))}
      </svg>
      <figcaption className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-[var(--ink-mute)]">
        <span className="flex items-center gap-1.5">
          <span
            aria-hidden
            className="inline-block h-2 w-3 rounded-[2px]"
            style={{ background: "var(--gold)", opacity: 0.85 }}
          />
          {winningSide === "over" ? "Over" : "Under"} wins
        </span>
        <span className="flex items-center gap-1.5">
          <span
            aria-hidden
            className="inline-block size-2 rounded-full"
            style={{ background: "var(--azure)" }}
          />
          Projection {projection.toFixed(1)}
        </span>
        <span className="flex items-center gap-1.5">
          <span
            aria-hidden
            className="inline-block h-3 w-0.5"
            style={{ background: "var(--ink)" }}
          />
          Line {line}
        </span>
      </figcaption>
    </figure>
  );
}

/** Cumulative profit in units, one point per settled bet. */
export function EquityCurve({
  points,
  height = 200,
}: {
  points: Array<{ index: number; cumulativeUnits: number }>;
  height?: number;
}) {
  if (points.length < 2) return null;

  const width = 720;
  const padding = { top: 12, right: 16, bottom: 24, left: 44 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;

  const xMax = points[points.length - 1].index;
  const values = points.map((p) => p.cumulativeUnits);
  const yMin = Math.min(0, ...values);
  const yMax = Math.max(0, ...values);

  const sx = (x: number) => padding.left + (x / xMax) * plotWidth;
  const sy = (y: number) =>
    padding.top + plotHeight - ((y - yMin) / (yMax - yMin || 1)) * plotHeight;

  const path = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${sx(p.index)} ${sy(p.cumulativeUnits)}`)
    .join(" ");

  const ticks = niceTicks(yMin, yMax, 4);
  const last = points[points.length - 1];

  return (
    <figure className="m-0">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full"
        role="img"
        aria-label={`Cumulative profit across ${xMax} bets, ending at ${last.cumulativeUnits.toFixed(1)} units.`}
      >
        {ticks.map((tick) => (
          <g key={tick}>
            <line
              x1={padding.left}
              x2={width - padding.right}
              y1={sy(tick)}
              y2={sy(tick)}
              stroke={GRID}
              strokeWidth={1}
            />
            <text
              x={padding.left - 6}
              y={sy(tick) + 3}
              textAnchor="end"
              fontSize={10}
              fill={AXIS}
            >
              {tick}
            </text>
          </g>
        ))}

        {yMin < 0 ? (
          <line
            x1={padding.left}
            x2={width - padding.right}
            y1={sy(0)}
            y2={sy(0)}
            stroke="var(--border-strong)"
            strokeWidth={1}
          />
        ) : null}

        <defs>
          <filter id="eq-glow" x="-20%" y="-60%" width="140%" height="260%">
            <feGaussianBlur stdDeviation="3" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        <path
          d={path}
          fill="none"
          stroke="var(--gold)"
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
          filter="url(#eq-glow)"
        />

        {/* Direct-label the endpoint only. */}
        <circle
          cx={sx(last.index)}
          cy={sy(last.cumulativeUnits)}
          r={4.5}
          fill="var(--gold-bright)"
          stroke="var(--obsidian-1)"
          strokeWidth={2}
          filter="url(#eq-glow)"
        />

        <text
          x={width / 2}
          y={height - 6}
          textAnchor="middle"
          fontSize={10}
          fill={AXIS}
        >
          bets placed (chronological)
        </text>
      </svg>
    </figure>
  );
}

/**
 * Predicted vs. realised probability against the diagonal.
 * Marks are sized by sample count so thin bins read as thin.
 */
export function CalibrationChart({
  bins,
  height = 300,
}: {
  bins: Array<{ predicted: number; realized: number; n: number }>;
  height?: number;
}) {
  if (bins.length === 0) return null;

  const size = 300;
  const padding = { top: 12, right: 12, bottom: 34, left: 40 };
  const plot = size - padding.left - padding.right;

  const sx = (p: number) => padding.left + p * plot;
  const sy = (p: number) => padding.top + plot - p * plot;

  const maxN = Math.max(...bins.map((b) => b.n));
  const radius = (n: number) => 4 + 7 * Math.sqrt(n / maxN);

  const ticks = [0, 0.25, 0.5, 0.75, 1];

  return (
    <figure className="m-0">
      <svg
        viewBox={`0 0 ${size} ${height}`}
        className="mx-auto w-full max-w-[340px]"
        role="img"
        aria-label="Calibration: predicted probability against realised frequency. Points on the diagonal are perfectly calibrated."
      >
        {ticks.map((tick) => (
          <g key={tick}>
            <line
              x1={sx(tick)}
              x2={sx(tick)}
              y1={padding.top}
              y2={padding.top + plot}
              stroke={GRID}
              strokeWidth={1}
            />
            <line
              x1={padding.left}
              x2={padding.left + plot}
              y1={sy(tick)}
              y2={sy(tick)}
              stroke={GRID}
              strokeWidth={1}
            />
            <text
              x={sx(tick)}
              y={padding.top + plot + 14}
              textAnchor="middle"
              fontSize={9}
              fill={AXIS}
            >
              {tick.toFixed(2)}
            </text>
            <text
              x={padding.left - 6}
              y={sy(tick) + 3}
              textAnchor="end"
              fontSize={9}
              fill={AXIS}
            >
              {tick.toFixed(2)}
            </text>
          </g>
        ))}

        {/* Perfect calibration. */}
        <line
          x1={sx(0)}
          y1={sy(0)}
          x2={sx(1)}
          y2={sy(1)}
          stroke="var(--border-strong)"
          strokeWidth={2}
          strokeDasharray="4 4"
        />

        {bins.map((bin) => (
          <circle
            key={bin.predicted}
            cx={sx(bin.predicted)}
            cy={sy(bin.realized)}
            r={radius(bin.n)}
            fill="var(--gold)"
            fillOpacity={0.8}
            stroke="var(--obsidian-1)"
            strokeWidth={2}
          >
            <title>
              {`predicted ${bin.predicted.toFixed(3)} · realised ${bin.realized.toFixed(3)} · n=${bin.n}`}
            </title>
          </circle>
        ))}

        <text
          x={padding.left + plot / 2}
          y={height - 6}
          textAnchor="middle"
          fontSize={10}
          fill={AXIS}
        >
          predicted P(over) → realised
        </text>
      </svg>
      <figcaption className="mt-1 text-center text-[11px] text-[var(--ink-mute)]">
        Marks sized by sample count. On the grey diagonal means perfectly
        calibrated.
      </figcaption>
    </figure>
  );
}

/** Horizontal bars for a single measure across ordered buckets. */
export function BucketBars({
  buckets,
  valueOf,
  format,
  label,
}: {
  buckets: Array<{ label: string; bets: number }>;
  valueOf: (bucket: { label: string; bets: number }) => number;
  format: (value: number) => string;
  label: string;
}) {
  if (buckets.length === 0) return null;

  const values = buckets.map(valueOf);
  const max = Math.max(...values.map(Math.abs), 0.0001);

  return (
    <div className="space-y-2">
      {buckets.map((bucket) => {
        const value = valueOf(bucket);
        const width = (Math.abs(value) / max) * 100;
        return (
          <div key={bucket.label} className="flex items-center gap-3">
            <span className="numeric w-16 shrink-0 text-[11px] text-[var(--ink-dim)]">
              {bucket.label}
            </span>
            <div className="relative h-5 flex-1 overflow-hidden rounded-[4px] bg-[var(--obsidian-3)]">
              <div
                className="h-full rounded-[4px]"
                style={{
                  width: `${width}%`,
                  background: value >= 0
                    ? "linear-gradient(90deg, var(--bronze), var(--gold))"
                    : "linear-gradient(90deg, #6b2733, var(--ember))",
                  boxShadow: value >= 0 ? "0 0 12px rgba(255,194,75,0.25)" : undefined,
                }}
                title={`${label}: ${format(value)} across ${bucket.bets} bets`}
              />
            </div>
            <span className="numeric w-16 shrink-0 text-right text-[11px] font-semibold text-[var(--ink)]">
              {format(value)}
            </span>
            <span className="numeric w-14 shrink-0 text-right text-[11px] text-[var(--ink-mute)]">
              n={bucket.bets}
            </span>
          </div>
        );
      })}
    </div>
  );
}
