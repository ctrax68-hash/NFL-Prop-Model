/**
 * Radial gauge for a single edge value.
 *
 * Used on the prop detail page where there is room to make the number the
 * subject. The arc is capped at 20% because that is well past anything a
 * sane model produces — a needle pinned to the rail is a signal that
 * something is wrong, not a jackpot.
 */

const MAX_EDGE = 0.2;

export function EdgeMeter({
  edge,
  size = 132,
}: {
  edge: number;
  size?: number;
}) {
  const stroke = 9;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;

  // Three-quarter dial, opening at the bottom.
  const sweep = 0.75;
  const track = circumference * sweep;
  const clamped = Math.max(0, Math.min(MAX_EDGE, edge));
  const filled = track * (clamped / MAX_EDGE);

  const positive = edge >= 0;
  const color = positive ? "var(--gold)" : "var(--ink-mute)";

  return (
    <figure className="m-0 flex flex-col items-center">
      <div className="relative" style={{ width: size, height: size }}>
        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          role="img"
          aria-label={`Model edge ${(edge * 100).toFixed(2)} percent`}
          style={{ transform: "rotate(135deg)" }}
        >
          <defs>
            <linearGradient id="edge-fill" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="var(--bronze)" />
              <stop offset="55%" stopColor="var(--gold)" />
              <stop offset="100%" stopColor="var(--gold-bright)" />
            </linearGradient>
            <filter id="edge-glow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="4" result="b" />
              <feMerge>
                <feMergeNode in="b" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="var(--obsidian-3)"
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={`${track} ${circumference}`}
          />

          {filled > 0 ? (
            <circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke="url(#edge-fill)"
              strokeWidth={stroke}
              strokeLinecap="round"
              strokeDasharray={`${filled} ${circumference}`}
              filter="url(#edge-glow)"
            />
          ) : null}
        </svg>

        <div className="absolute inset-0 grid place-items-center">
          <div className="text-center">
            <div
              className="display glow-gold text-[30px] font-bold"
              style={{ color }}
            >
              {edge > 0 ? "+" : ""}
              {(edge * 100).toFixed(1)}
              <span className="text-[16px]">%</span>
            </div>
            <div className="eyebrow mt-1">edge</div>
          </div>
        </div>
      </div>
    </figure>
  );
}
